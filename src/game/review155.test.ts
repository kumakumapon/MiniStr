import { describe, expect, it } from 'vitest';
import {
  attackUnit,
  createBoard,
  createGameState,
  createScenarioInitialState,
  createScenarioEditor,
  deleteSaveSlot,
  enemyThreatPreview,
  forecastCombat,
  importScenarioEditorJson,
  listSaveSlots,
  loadCustomScenarios,
  loadGameFromSlot,
  maps,
  parseReplay,
  parseSavedGame,
  saveCustomScenario,
  saveGame,
  saveGameToSlot,
  scenarioDefinitionToData,
  scenarioForState,
  SAVE_SLOT_INDEX_KEY,
  SAVE_SLOT_PREFIX,
  type StorageLike,
} from './index';
import { chooseCpuAction } from '../ai';
import { hasSafeJsonStructure, parseBoundedJson } from './jsonBoundary';
import { deleteCustomScenario } from './maps';
import { writeStorageChanges } from './session';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
const match = () => {
  const initialState = createScenarioInitialState(maps[0]!);
  return { mapId: maps[0]!.id, difficulty: 'normal' as const, initialState, gameState: initialState, commands: [] };
};

describe('review #155 external boundaries', () => {
  it('rejects deep old formats before migration or cloning', () => {
    const deep = `{"schemaVersion":1,"extra":${'['.repeat(4000)}0${']'.repeat(4000)}}`;
    for (const parse of [parseSavedGame, parseReplay]) expect(parse(deep)).toMatchObject({ ok: false });
    expect(importScenarioEditorJson(deep, createScenarioEditor())).toMatchObject({ ok: false });
    expect(parseBoundedJson('x'.repeat(1_000_001))).toMatchObject({ ok: false });
    expect(parseBoundedJson('"あ"', 4)).toMatchObject({ ok: false });
    expect(hasSafeJsonStructure([1, 2, 3], 64, 2)).toBe(false);
    expect(parseBoundedJson('{')).toMatchObject({ ok: false });
  });

  it('preserves custom battles across replacement, catalog deletion and another browser', () => {
    const storage = new MemoryStorage();
    const source = { ...scenarioDefinitionToData(maps[0]!), id: 'revision-test' };
    const saved = saveCustomScenario(storage, source);
    if (!saved.ok) throw Error(saved.error);
    const initialState = createScenarioInitialState(saved.value);
    const input = { ...match(), mapId: source.id, initialState, gameState: initialState };
    expect(saveGame(storage, 'battle', input).ok).toBe(true);
    const payload = storage.getItem('battle')!;
    expect(saveCustomScenario(storage, { ...source, startingGold: source.startingGold + 1000 }).ok).toBe(true);
    expect(parseSavedGame(payload).ok).toBe(true);
    expect(deleteCustomScenario(storage, source.id).ok).toBe(true);
    loadCustomScenarios(new MemoryStorage());
    const restored = parseSavedGame(payload);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(scenarioForState(restored.value.gameState)?.startingGold).toBe(source.startingGold);
    const corrupt = JSON.parse(payload);
    corrupt.initialState.scenarioSnapshot.board.width = -1;
    expect(parseSavedGame(JSON.stringify(corrupt)).ok).toBe(false);
  });

  it('keeps pre-snapshot custom saves readable using persisted revisions', () => {
    const storage = new MemoryStorage();
    const source = { ...scenarioDefinitionToData(maps[0]!), id: 'legacy-revision' };
    const created = saveCustomScenario(storage, source);
    if (!created.ok) throw Error(created.error);
    const initialState = createScenarioInitialState(created.value);
    delete initialState.scenarioSnapshot;
    saveGame(storage, 'legacy', { ...match(), mapId: source.id, initialState, gameState: initialState });
    const old = { ...JSON.parse(storage.getItem('legacy')!), schemaVersion: 3 };
    saveCustomScenario(storage, { ...source, startingGold: 20000 });
    loadCustomScenarios(storage);
    expect(parseSavedGame(JSON.stringify(old))).toMatchObject({ ok: true });
    expect(deleteCustomScenario(storage, source.id).ok).toBe(true);
    loadCustomScenarios(storage);
    expect(parseSavedGame(JSON.stringify(old))).toMatchObject({ ok: true });
    loadCustomScenarios(new MemoryStorage());
  });

  it('exposes corrupted/missing slots, recovers orphans and rejects reserved identifiers', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SAVE_SLOT_INDEX_KEY,
      JSON.stringify([
        { id: 'broken', name: '壊れた保存' },
        { id: 'missing', name: '本体なし' },
      ]),
    );
    storage.setItem(`${SAVE_SLOT_PREFIX}broken`, '{broken');
    saveGame(storage, `${SAVE_SLOT_PREFIX}orphan`, match());
    const slots = listSaveSlots(storage);
    expect(slots.map((slot) => slot.status).sort()).toEqual(['corrupt', 'missing', 'valid']);
    expect(loadGameFromSlot(storage, 'orphan')?.ok).toBe(true);
    for (const id of ['manual', 'auto']) expect(saveGameToSlot(storage, id, 'reserved', match()).ok).toBe(false);
    expect(deleteSaveSlot(storage, 'broken').ok).toBe(true);
    expect(deleteSaveSlot(storage, 'missing').ok).toBe(true);
    storage.setItem('ministr.save.manual', 'bad');
    expect(deleteSaveSlot(storage, 'manual').ok).toBe(true);
    expect(listSaveSlots(storage)).toHaveLength(1);
  });

  it('rolls back a payload if writing its index fails, including overwrite', () => {
    const storage = new MemoryStorage();
    saveGameToSlot(storage, 'one', 'original', match());
    const old = new Map(storage.data);
    const failing: StorageLike = {
      getItem: (key) => storage.getItem(key),
      removeItem: (key) => storage.removeItem(key),
      setItem: (key, value) => {
        if (key === SAVE_SLOT_INDEX_KEY) throw Error('quota');
        storage.setItem(key, value);
      },
    };
    expect(saveGameToSlot(failing, 'two', 'new', match()).ok).toBe(false);
    expect(storage.data).toEqual(old);
    expect(saveGameToSlot(failing, 'one', 'changed', match()).ok).toBe(false);
    expect(storage.data).toEqual(old);
    expect(deleteSaveSlot(failing, 'one').ok).toBe(false);
    expect(storage.data).toEqual(old);
    expect(
      writeStorageChanges(
        {
          ...failing,
          getItem: () => {
            throw Error('denied');
          },
        },
        new Map([['x', '1']]),
      ).ok,
    ).toBe(false);
  });

  it('invalidates cached metadata when another tab changes the raw payload', () => {
    const storage = new MemoryStorage();
    saveGameToSlot(storage, 'one', 'name', match());
    expect(listSaveSlots(storage)[0]?.status).toBe('valid');
    storage.setItem(`${SAVE_SLOT_PREFIX}one`, 'broken');
    expect(listSaveSlots(storage)[0]?.status).toBe('corrupt');
    expect(loadGameFromSlot(storage, 'one')?.ok).toBe(false);
  });
});

describe('review #155 combat and private logistics', () => {
  const combat = () => {
    const state = createGameState(createBoard(3, 3), 1972);
    state.units = [
      { id: 'red', kind: 'tank', owner: 'red', position: { x: 0, y: 0 }, hp: 100, hasMoved: false, hasActed: false },
      { id: 'blue', kind: 'tank', owner: 'blue', position: { x: 1, y: 0 }, hp: 70, hasMoved: false, hasActed: false },
    ];
    return state;
  };
  it('includes counters when average damage would kill but a low roll leaves a survivor', () => {
    const state = combat();
    const forecast = forecastCombat(state, state.units[0]!, state.units[1]!);
    if (!forecast.ok) throw Error(forecast.error);
    expect(forecast.value.canCounter).toBe(false);
    expect(forecast.value.possibleCounter).toBe(true);
    expect(forecast.value.incoming.min).toBe(0);
    for (let seed = 0; seed < 2000; seed += 17) {
      const result = attackUnit({ ...state, rngSeed: seed }, 'red', 'blue');
      if (!result.ok) throw Error(result.error);
      const damage = 100 - (result.value.units.find((unit) => unit.id === 'red')?.hp ?? 0);
      expect(damage).toBeGreaterThanOrEqual(forecast.value.incoming.min);
      expect(damage).toBeLessThanOrEqual(forecast.value.incoming.max);
    }
  });
  it('does not leak enemy fuel/ammunition/funds through threats or AI choices', () => {
    const full = combat();
    const empty = structuredClone(full);
    empty.units[1]!.fuel = 0;
    empty.units[1]!.ammo = 0;
    empty.players.blue.gold = 987654;
    expect(enemyThreatPreview(empty, 'blue', 'red')).toEqual(enemyThreatPreview(full, 'blue', 'red'));
    expect(chooseCpuAction(empty)).toEqual(chooseCpuAction(full));
    const unseen = { ...full, units: full.units.filter((unit) => unit.owner === 'blue') };
    expect(enemyThreatPreview(unseen, 'blue', 'red').attack.size).toBe(0);
  });
});
