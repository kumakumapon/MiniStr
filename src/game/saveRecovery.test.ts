import { describe, expect, it } from 'vitest';
import { createScenarioInitialState, maps } from './maps';
import { saveGame, listSaveSlots, type StorageLike } from './session';
import { previewSaveRecovery, restoreRecoveredSaves } from './saveRecovery';
function storage(): StorageLike {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}
function rawSave(): string {
  const target = storage();
  const initial = createScenarioInitialState(maps[0]!);
  saveGame(target, 'save', { mapId: maps[0]!.id, difficulty: 'normal', initialState: initial, gameState: initial, commands: [] });
  return target.getItem('save')!;
}
describe('non-destructive save recovery', () => {
  it('recovers valid matches from a damaged backup as additional slots', () => {
    const target = storage();
    target.setItem('ministr.save.manual', 'broken-original');
    const text = JSON.stringify({
      schemaVersion: 1,
      entries: [
        ['ministr.save.manual', rawSave()],
        ['ministr.save.auto', '{bad'],
        ['ministr.locale', 'invalid'],
      ],
    });
    const preview = previewSaveRecovery(text);
    if (!preview.ok) throw Error(preview.error);
    expect(preview.value).toEqual({ recovered: 1, rejected: 1 });
    expect(restoreRecoveredSaves(target, preview.value, () => 'rescued').ok).toBe(true);
    expect(target.getItem('ministr.save.manual')).toBe('broken-original');
    expect(listSaveSlots(target).find((s) => s.id === 'rescued')?.status).toBe('valid');
    expect(target.getItem('ministr.locale')).toBeNull();
  });
  it('does not trust fabricated previews, overwrite slots or accept malformed input', () => {
    const target = storage();
    expect(restoreRecoveredSaves(target, { recovered: 1, rejected: 0 }, () => 'a').ok).toBe(false);
    for (const text of [
      'null',
      '{',
      '{}',
      JSON.stringify({ schemaVersion: 1, entries: [[1, 'x']] }),
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          ['a', 'b'],
          ['a', 'c'],
        ],
      }),
    ])
      expect(previewSaveRecovery(text).ok).toBe(false);
    const preview = previewSaveRecovery(rawSave());
    if (!preview.ok) throw Error(preview.error);
    target.setItem('ministr.save.slot.occupied', 'retain');
    expect(restoreRecoveredSaves(target, preview.value, () => 'occupied').ok).toBe(false);
    expect(target.getItem('ministr.save.slot.occupied')).toBe('retain');
  });
  it('rolls back quota failures without losing unrelated entries', () => {
    const target = storage();
    target.setItem('ministr.locale', 'ja');
    const preview = previewSaveRecovery(rawSave());
    if (!preview.ok) throw Error(preview.error);
    const realSet = target.setItem;
    let calls = 0;
    target.setItem = (k, v) => {
      if (++calls === 2) throw Error('quota');
      realSet(k, v);
    };
    expect(restoreRecoveredSaves(target, preview.value, () => 'rescued').ok).toBe(false);
    expect(target.getItem('ministr.locale')).toBe('ja');
    expect(target.getItem('ministr.save.slot.rescued')).toBeNull();
  });
  it('rejects generated corruptions of an otherwise valid save', () => {
    const saved = JSON.parse(rawSave());
    for (let seed = 0; seed < 48; seed++) {
      const candidate = structuredClone(saved);
      if (seed % 3 === 0) candidate.schemaVersion = seed + 50;
      else if (seed % 3 === 1) candidate.gameState.units[0].hp = -1 - seed;
      else candidate.commands = [{ type: 'move', unitId: 'missing', destination: { x: seed, y: seed } }];
      expect(previewSaveRecovery(JSON.stringify(candidate)).ok).toBe(false);
    }
  });
});

it('refuses excessive match counts and adapters without enumeration before writing', () => {
  const entries = Array.from({ length: 15 }, (_, i) => [`ministr.save.slot.slot-${i}`, rawSave()]);
  expect(previewSaveRecovery(JSON.stringify({ schemaVersion: 1, entries })).ok).toBe(false);
  const preview = previewSaveRecovery(rawSave());
  if (!preview.ok) throw Error(preview.error);
  let wrote = false;
  expect(
    restoreRecoveredSaves(
      {
        getItem: () => 'retain',
        setItem: () => {
          wrote = true;
        },
        removeItem: () => {
          wrote = true;
        },
      },
      preview.value,
      () => 'new',
    ).ok,
  ).toBe(false);
  expect(wrote).toBe(false);
});
