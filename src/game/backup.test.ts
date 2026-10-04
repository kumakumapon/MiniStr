import { describe, expect, it } from 'vitest';
import { exportBackup, previewBackup, restoreBackup } from './backup';
import { CUSTOM_SCENARIOS_KEY, createScenarioInitialState, loadCustomScenarios, maps, saveGameToSlot, scenarioById, scenarioDefinitionToData, type StorageLike } from './index';

class Store implements StorageLike {
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
const pack = (entries: unknown) => JSON.stringify({ schemaVersion: 1, entries });
describe('complete local backup', () => {
  it('round trips data without touching another app and removes obsolete app entries', () => {
    const source = new Store();
    const initialState = createScenarioInitialState(maps[0]!);
    saveGameToSlot(source, 'one', 'match', {
      mapId: maps[0]!.id,
      difficulty: 'normal',
      initialState,
      gameState: initialState,
      commands: [],
    });
    source.setItem('ministr.sound.settings', '{"muted":true,"volume":0.5}');
    source.setItem('ministr.confirmEndTurnWithUnacted', 'true');
    source.setItem('ministr.locale', 'ja');
    const backup = exportBackup(source);
    if (!backup.ok) throw Error(backup.error);
    const target = new Store();
    target.setItem('another.app', 'private');
    target.setItem('ministr.save.manual', 'old');
    expect(restoreBackup(target, backup.value).ok).toBe(true);
    expect(target.getItem('another.app')).toBe('private');
    expect(target.getItem('ministr.save.manual')).toBeNull();
    for (const [key, value] of source.data) expect(target.getItem(key)).toBe(value);
  });
  it('rejects invalid entries before writing and still exports corrupt data for recovery', () => {
    const storage = new Store();
    storage.setItem('ministr.save.manual', 'broken');
    const old = new Map(storage.data);
    for (const entries of [
      null,
      [['other', 'x']],
      [['ministr.locale', 'xx']],
      [['ministr.sound.settings', '{"muted":true,"volume":8}']],
      [['ministr.confirmEndTurnWithUnacted', 'x']],
      [['ministr.unknown', 'x']],
      [['ministr.save.slots', '[{"id":"missing","name":"x"}]']],
      [['ministr.save.manual', 'broken']],
      [['ministr.scenarios.custom', '{}']],
      [['ministr.campaign.progress', '{}']],
      [
        ['ministr.locale', 'ja'],
        ['ministr.locale', 'en'],
      ],
    ]) {
      expect(restoreBackup(storage, pack(entries)).ok).toBe(false);
      expect(storage.data).toEqual(old);
    }
    expect(restoreBackup(storage, '{').ok).toBe(false);
    expect(exportBackup(storage).ok).toBe(true);
    expect(
      exportBackup({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }).ok,
    ).toBe(false);
  });
  it('previews the scope of a backup replacement before restore', () => {
    const storage = new Store();
    storage.setItem('ministr.locale', 'ja');
    storage.setItem('ministr.sound.settings', '{"muted":true,"volume":0.5}');
    const preview = previewBackup(
      storage,
      JSON.stringify({
        schemaVersion: 1,
        createdAt: '2026-10-04T00:00:00.000Z',
        entries: [['ministr.locale', 'en']],
      }),
    );
    expect(preview).toEqual({
      ok: true,
      value: {
        createdAt: '2026-10-04T00:00:00.000Z',
        entryCount: 1,
        saveCount: 0,
        hasScenarios: false,
        hasCampaign: false,
        removedEntryCount: 1,
      },
    });
    expect(previewBackup(storage, pack([['ministr.save.manual', 'broken']]))).toMatchObject({
      ok: false,
      error: expect.stringContaining('ministr.save.manual'),
    });
  });
  it('rolls back when storage fails in the middle of restore', () => {
    const storage = new Store();
    storage.setItem('ministr.locale', 'ja');
    const original = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key.endsWith('settings')) throw Error('quota');
      original(key, value);
    };
    expect(
      restoreBackup(
        storage,
        pack([
          ['ministr.locale', 'en'],
          ['ministr.sound.settings', '{"muted":false,"volume":0.5}'],
        ]),
      ).ok,
    ).toBe(false);
    expect([...storage.data]).toEqual([['ministr.locale', 'ja']]);
  });

  it('restores the live scenario catalog after a candidate backup fails validation', () => {
    const live = new Store();
    const liveScenario = {
      ...scenarioDefinitionToData(maps[0]!),
      id: 'live-catalog-scenario',
    };
    live.setItem(
      CUSTOM_SCENARIOS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        scenarios: [liveScenario],
        history: [],
      }),
    );
    expect(loadCustomScenarios(live).ok).toBe(true);
    const target = new Store();
    target.setItem(CUSTOM_SCENARIOS_KEY, '{broken persisted catalog');
    const candidateScenario = {
      ...scenarioDefinitionToData(maps[1]!),
      id: 'candidate-catalog-scenario',
    };
    const restored = restoreBackup(
      target,
      pack([
        [
          CUSTOM_SCENARIOS_KEY,
          JSON.stringify({
            schemaVersion: 1,
            scenarios: [candidateScenario],
            history: [],
          }),
        ],
        ['ministr.save.manual', 'broken'],
      ]),
    );
    expect(restored.ok).toBe(false);
    expect(scenarioById('live-catalog-scenario')?.name).toBe(liveScenario.name);
    expect(scenarioById('candidate-catalog-scenario')).toBeUndefined();
  });
});
