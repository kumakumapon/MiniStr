import { describe, it, expect, vi } from 'vitest';
import { fourArmySpectatorFixture } from './fourArmySpectator.fixture';
import {
  parseFourArmySpectatorSave,
  serializeFourArmySpectatorSave,
  isFourArmySaveKey,
  FOUR_ARMY_SAVE_KEYS,
  fourArmySlotName,
  isFourArmySpectatorEnvelope,
} from './fourArmySpectatorSave';
import { handleFourArmyFileRequest } from './fourArmySpectatorProtocol';
import { exportBackup, previewBackup, restoreBackup } from './backup';
import { parseSavedGame } from './session';
import { parseReplay } from './replay';
import { parseResearch } from './research';
import { observeFourArmy } from './fourArmyEngine';
import { chooseFourArmyCpuCommand } from '../ai/fourArmyCpu';
import type { GameResult } from './types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
function storage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      map.delete(k);
    }),
  };
}
describe('public four-army saves', () => {
  it('round trips state/history, current army settings, view and speed without changing the next CPU decision', () => {
    const s = fourArmySpectatorFixture(8);
    s.name = '<record & 4>';
    s.settings.army1 = { difficulty: 'hard', policy: 'defensive' };
    s.view = 'army3';
    s.speed = 4;
    const before = structuredClone(s),
      raw = value(serializeFourArmySpectatorSave(s)),
      parsed = value(parseFourArmySpectatorSave(raw));
    expect(parsed).toEqual(s);
    expect(s).toEqual(before);
    const a = value(observeFourArmy(s.archive.payload.state, 'army1')),
      b = value(observeFourArmy(parsed.archive.payload.state, 'army1'));
    expect(chooseFourArmyCpuCommand(a, s.settings.army1)).toEqual(chooseFourArmyCpuCommand(b, parsed.settings.army1));
    expect(parseSavedGame(raw).ok).toBe(false);
    expect(parseReplay(raw).ok).toBe(false);
    expect(parseResearch(raw).ok).toBe(false);
  });
  it('rejects unsupported versions, malformed settings/metadata, changed map conditions and forged histories', () => {
    const source = fourArmySpectatorFixture(2);
    const mutations: ((v: any) => void)[] = [
      (v) => (v.extra = 1),
      (v) => (v.format = 'ministr-four-army-save'),
      (v) => (v.schemaVersion = 2),
      (v) => (v.cpuVersion = 'future'),
      (v) => (v.name = ''),
      (v) => (v.name = 'x'.repeat(41)),
      (v) => (v.name = ' spaced '),
      (v) => (v.savedAt = '2026-02-31T00:00:00.000Z'),
      (v) => (v.savedAt = 'no'),
      (v) => (v.speed = 8),
      (v) => (v.view = 'red'),
      (v) => (v.settings.army1.policy = 'cheat'),
      (v) => delete v.settings.army4,
      (v) => (v.archive.schemaVersion = 1),
      (v) => v.archive.payload.state.players.army1.gold++,
      (v) => (v.archive.payload.map.setup.unitLimitPerArmy = 12),
      (v) => (v.archive.payload.map.id = 'other'),
      (v) => (v.archive.payload.commands[0].actor = 'army3'),
    ];
    for (const mutate of mutations) {
      const bad = structuredClone(source);
      mutate(bad);
      expect(parseFourArmySpectatorSave(JSON.stringify(bad)).ok).toBe(false);
    }
    const variant = fourArmySpectatorFixture();
    variant.archive.payload.map.setup!.unitLimitPerArmy = 12;
    variant.archive.payload.state.setup!.unitLimitPerArmy = 12;
    expect(parseFourArmySpectatorSave(JSON.stringify(variant)).ok).toBe(false);
    expect(isFourArmySpectatorEnvelope(null)).toBe(false);
  });
  it('bounds file size and command count and keeps engine checkpoints separate', () => {
    expect(parseFourArmySpectatorSave(' '.repeat(1000001)).ok).toBe(false);
    expect(parseFourArmySpectatorSave('{').ok).toBe(false);
    const s = fourArmySpectatorFixture();
    s.archive.payload.commands = Array.from({ length: 2049 }, () => ({ actor: 'army1', type: 'endTurn' }));
    expect(serializeFourArmySpectatorSave(s).ok).toBe(false);
    expect(parseFourArmySpectatorSave(JSON.stringify(s.archive)).ok).toBe(false);
  });
  it('recognises only two dedicated slots and treats a label as unverified metadata', () => {
    expect(FOUR_ARMY_SAVE_KEYS.every(isFourArmySaveKey)).toBe(true);
    expect(isFourArmySaveKey('ministr.fourArmy.save.3')).toBe(false);
    expect(isFourArmySaveKey('ministr.manualSave')).toBe(false);
    expect(fourArmySlotName(null)).toBeUndefined();
    expect(fourArmySlotName('{')).toBeUndefined();
    expect(fourArmySlotName(JSON.stringify(fourArmySpectatorFixture()))).toBe('Four Fronts');
    expect(fourArmySlotName('{"name":"fake"}')).toBeUndefined();
  });
  it('validates file Worker requests and preserves the exact decoded text', () => {
    const s = fourArmySpectatorFixture(),
      text = value(serializeFourArmySpectatorSave(s));
    expect(handleFourArmyFileRequest({ id: 1, action: 'decode', text })).toMatchObject({ id: 1, result: { ok: true, value: { text, save: s } } });
    expect(handleFourArmyFileRequest({ id: 2, action: 'encode', value: s })?.result.ok).toBe(true);
    expect(handleFourArmyFileRequest(null)).toBeUndefined();
    expect(handleFourArmyFileRequest({ id: 0 })).toBeUndefined();
    expect(handleFourArmyFileRequest({ id: '1' })).toBeUndefined();
    expect(handleFourArmyFileRequest({ id: 1, action: 'future' })?.result.ok).toBe(false);
    expect(handleFourArmyFileRequest({ id: 1, action: 'decode', text: '{' })?.result.ok).toBe(false);
  });
  it('includes four-army slots in transactional backup preview/restore and rejects corrupt originals before writing', () => {
    const raw = value(serializeFourArmySpectatorSave(fourArmySpectatorFixture()));
    const source = storage({ [FOUR_ARMY_SAVE_KEYS[0]]: raw, [FOUR_ARMY_SAVE_KEYS[1]]: raw, 'ministr.locale': 'ja' }),
      target = storage({ 'ministr.locale': 'en' });
    const backup = value(exportBackup(source)),
      preview = value(previewBackup(target, backup));
    expect(preview.saveCount).toBe(2);
    expect(restoreBackup(target, preview).ok).toBe(true);
    expect(target.map).toEqual(source.map);
    const before = new Map(target.map),
      bad = JSON.parse(backup);
    bad.entries[0][1] = '{';
    target.setItem.mockClear();
    expect(restoreBackup(target, JSON.stringify(bad)).ok).toBe(false);
    expect(target.setItem).not.toHaveBeenCalled();
    expect(target.map).toEqual(before);
    bad.entries[0] = ['ministr.fourArmy.save.3', raw];
    expect(restoreBackup(target, JSON.stringify(bad)).ok).toBe(false);
  });
});
