import { describe, it, expect, vi } from 'vitest';
import { fourArmySpectatorFixture } from './fourArmySpectator.fixture';
import {
  FOUR_ARMY_COMMAND_LIMIT,
  FOUR_ARMY_FILE_BYTES,
  serializeFourArmySpectatorSave,
  parseFourArmySpectatorSave,
  verifyFourArmySpectatorSave,
  verifyFourArmySpectatorSaveAsync,
  encodeFourArmySpectatorSave,
  fourArmySlotName,
} from './fourArmySpectatorSave';
import { previewBackupAsync, restoreBackup, previewBackup } from './backup';
import { handleFourArmyFileRequestAsync } from './fourArmySpectatorProtocol';
import { parseFourArmyArchive } from './fourArmyArchive';
import type { GameResult } from './types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const cached = { ...fourArmySpectatorFixture(2050), schemaVersion: 2 as const };
const long = () => structuredClone(cached);
describe('long four-army save policy', () => {
  it('migrates a legacy record on explicit save and losslessly compresses a history beyond 2048', () => {
    const source = long(),
      raw = value(encodeFourArmySpectatorSave(source)),
      parsed = value(parseFourArmySpectatorSave(raw));
    expect(parsed).toEqual(source);
    expect(JSON.parse(raw).archive.payload.commands.encoding).toBe('four-army-log-v1');
    expect(raw.length).toBeLessThan(JSON.stringify(source).length * 0.6);
    const old = fourArmySpectatorFixture(8),
      legacy = value(parseFourArmySpectatorSave(value(serializeFourArmySpectatorSave(old))));
    expect(legacy.schemaVersion).toBe(1);
    legacy.schemaVersion = 2;
    expect(value(parseFourArmySpectatorSave(value(serializeFourArmySpectatorSave(legacy))))).toEqual(legacy);
    expect(parseFourArmyArchive(JSON.stringify(source.archive)).ok).toBe(false);
    expect(fourArmySlotName(raw)).toBe(source.name);
  }, 10000);
  it('keeps legacy bounds and rejects forged states, injected checkpoints and invalid compact logs', () => {
    const source = long(),
      file = JSON.parse(value(encodeFourArmySpectatorSave(source)));
    const bads = [
      { ...source, schemaVersion: 1 },
      { ...file, schemaVersion: 3 },
      { ...file, checkpoints: [] },
      { ...file, archive: { ...file.archive, payload: { ...file.archive.payload, state: { ...file.archive.payload.state, rngSeed: 999 } } } },
      { ...file, archive: { ...file.archive, payload: { ...file.archive.payload, commands: { ...file.archive.payload.commands, rows: [[0, 0]] } } } },
    ];
    for (const b of bads) expect(parseFourArmySpectatorSave(JSON.stringify(b)).ok).toBe(false);
    source.archive.payload.commands = Array.from({ length: FOUR_ARMY_COMMAND_LIMIT + 1 }, () => ({ actor: 'army1', type: 'endTurn' }));
    expect(encodeFourArmySpectatorSave(source).ok).toBe(false);
    expect(parseFourArmySpectatorSave(' '.repeat(FOUR_ARMY_FILE_BYTES + 1)).ok).toBe(false);
    const short = fourArmySpectatorFixture();
    expect(parseFourArmySpectatorSave(' '.repeat(1_000_001) + JSON.stringify(short)).ok).toBe(false);
    short.schemaVersion = 2;
    expect(parseFourArmySpectatorSave(' '.repeat(1_000_001) + value(encodeFourArmySpectatorSave(short))).ok).toBe(true);
  }, 10000);
  it('derives checkpoints only from the complete valid prefix and cancels asynchronous validation', async () => {
    const raw = value(encodeFourArmySpectatorSave(long())),
      g = verifyFourArmySpectatorSave(raw);
    let next = g.next();
    while (!next.done) next = g.next();
    const result = value(next.value);
    expect(result.checkpoints.map((p) => p.position)).toEqual([0, 2048]);
    expect(result.checkpoints.at(-1)!.state.round.round).toBeLessThanOrEqual(result.save.archive.payload.state.round.round);
    let current = true;
    const progress = vi.fn(() => {
      current = false;
    });
    expect(await verifyFourArmySpectatorSaveAsync(raw, () => current, progress)).toBeUndefined();
    expect(progress).toHaveBeenCalledWith(0, 2050);
    const p = await handleFourArmyFileRequestAsync({ id: 7, action: 'decode', text: value(encodeFourArmySpectatorSave({ ...fourArmySpectatorFixture(64), schemaVersion: 2 })) });
    expect(p?.result.ok).toBe(true);
  }, 10000);
  it('verifies all long backup entries before writes and keeps the preview authority private', async () => {
    const data = new Map<string, string>([['ministr.locale', 'en']]);
    const storage = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: vi.fn((k: string, v: string) => {
        data.set(k, v);
      }),
      removeItem: vi.fn((k: string) => {
        data.delete(k);
      }),
    };
    const raw = ' '.repeat(1_000_001) + value(encodeFourArmySpectatorSave({ ...fourArmySpectatorFixture(256), schemaVersion: 2 }));
    const text = JSON.stringify({
      schemaVersion: 1,
      entries: [
        ['ministr.fourArmy.save.1', raw],
        ['ministr.locale', 'ja'],
      ],
    });
    let current = true;
    const cancelled = previewBackupAsync(storage, text, () => current);
    current = false;
    expect(await cancelled).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();
    const checked = value((await previewBackupAsync(storage, text))!);
    expect(checked.saveCount).toBe(1);
    expect(restoreBackup(storage, { ...checked }).ok).toBe(false);
    expect(restoreBackup(storage, checked).ok).toBe(true);
    expect(data.get('ministr.fourArmy.save.1')).toBe(raw);
    const before = new Map(data);
    expect(previewBackup(storage, JSON.stringify({ schemaVersion: 1, entries: [['ministr.fourArmy.save.2', '{']] })).ok).toBe(false);
    expect(data).toEqual(before);
  }, 10000);
});
