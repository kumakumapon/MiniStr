import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import { createFourArmyMap32 } from './fourArmyMap32';
import { isFourArmyState } from './fourArmyEngine';
import { parseFourArmyArchive, type FourArmyArchive } from './fourArmyArchive';
import { isFourArmyCpuSettings, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import { parseBoundedJson } from './jsonBoundary';
import type { GameResult } from './types';

export const FOUR_ARMY_SAVE_KEYS = ['ministr.fourArmy.save.1', 'ministr.fourArmy.save.2'] as const;
export const FOUR_ARMY_FILE_BYTES = 1_000_000;
export const FOUR_ARMY_COMMAND_LIMIT = 2048;
export type FourArmyView = 'all' | FourArmyId;
export interface FourArmySpectatorSave {
  format: 'ministr-four-army-spectator';
  schemaVersion: 1;
  cpuVersion: 'four-army-cpu-v1';
  name: string;
  savedAt: string;
  settings: FourArmyCpuSettings;
  view: FourArmyView;
  speed: 0.5 | 1 | 2 | 4;
  archive: FourArmyArchive;
}
export const isFourArmySaveKey = (key: string): boolean => FOUR_ARMY_SAVE_KEYS.some((k) => k === key);
export const isFourArmyView = (v: unknown): v is FourArmyView => v === 'all' || FOUR_ARMY_IDS.some((a) => a === v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every((k) => Object.hasOwn(v, k));
const fail = (error: string): GameResult<never> => ({ ok: false, error });
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (record(v))
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}

/** Shape inspection only. Resume and backup always use the complete history verifier below. */
export function isFourArmySpectatorEnvelope(v: unknown): v is FourArmySpectatorSave {
  return (
    record(v) &&
    keys(v, ['format', 'schemaVersion', 'cpuVersion', 'name', 'savedAt', 'settings', 'view', 'speed', 'archive']) &&
    v.format === 'ministr-four-army-spectator' &&
    v.schemaVersion === 1 &&
    v.cpuVersion === 'four-army-cpu-v1' &&
    typeof v.name === 'string' &&
    v.name.trim() === v.name &&
    v.name.length > 0 &&
    v.name.length <= 40 &&
    typeof v.savedAt === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.savedAt) &&
    Number.isFinite(Date.parse(v.savedAt)) &&
    new Date(v.savedAt).toISOString() === v.savedAt &&
    isFourArmyCpuSettings(v.settings) &&
    isFourArmyView(v.view) &&
    [0.5, 1, 2, 4].some((s) => s === v.speed) &&
    record(v.archive) &&
    record(v.archive.payload) &&
    isFourArmyState(v.archive.payload.state)
  );
}

/** A fixed public map, verified from the original snapshot and every applied command. */
export function parseFourArmySpectatorSave(text: string): GameResult<FourArmySpectatorSave> {
  const bounded = parseBoundedJson(text, FOUR_ARMY_FILE_BYTES);
  if (!bounded.ok) return bounded;
  if (!isFourArmySpectatorEnvelope(bounded.value)) return fail('4軍観戦の保存形式が不正です。');
  const v = bounded.value;
  const archive = parseFourArmyArchive(JSON.stringify(v.archive));
  if (!archive.ok) return archive;
  const map = archive.value.payload.map,
    expected = createFourArmyMap32(map.seed, map.order);
  if (!expected.ok || archive.value.schemaVersion !== 2 || canonical(map) !== canonical(expected.value)) return fail('この4軍観戦では四方の前線の固定初期条件を使用します。');
  return { ok: true, value: { ...v, archive: archive.value } };
}

export function serializeFourArmySpectatorSave(value: FourArmySpectatorSave): GameResult<string> {
  try {
    const text = JSON.stringify(value),
      checked = parseFourArmySpectatorSave(text);
    return checked.ok ? { ok: true, value: text } : checked;
  } catch {
    return fail('4軍観戦の保存データを作成できません。');
  }
}

/** A label is not proof that a slot can be resumed. Corrupt originals stay untouched. */
export function fourArmySlotName(text: string | null): string | undefined {
  if (text === null) return;
  const v = parseBoundedJson(text, FOUR_ARMY_FILE_BYTES);
  return v.ok && record(v.value) && v.value.format === 'ministr-four-army-spectator' && typeof v.value.name === 'string' && v.value.name.length <= 40 ? v.value.name : undefined;
}
