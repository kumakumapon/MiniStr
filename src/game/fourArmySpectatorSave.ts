import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import { createFourArmyMap32 } from './fourArmyMap32';
import { isFourArmyState } from './fourArmyEngine';
import { verifyFourArmyArchive, type FourArmyArchive, type FourArmyCheckpoint } from './fourArmyArchive';
import { FOUR_ARMY_LONG_COMMANDS, packFourArmyCommands, unpackFourArmyCommands } from './fourArmyCommandLog';
import { isFourArmyCpuSettings, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import { parseBoundedJson } from './jsonBoundary';
import type { GameResult } from './types';
import { isFourArmyCpuVersion, type FourArmyCpuVersion } from '../ai/fourArmyCpuVersion';

export const FOUR_ARMY_SAVE_KEYS = ['ministr.fourArmy.save.1', 'ministr.fourArmy.save.2'] as const;
export const FOUR_ARMY_FILE_BYTES = 8_000_000;
export const FOUR_ARMY_CHECKPOINT_INTERVAL = 2048;
export const FOUR_ARMY_COMMAND_LIMIT = FOUR_ARMY_LONG_COMMANDS;
export type FourArmyView = 'all' | FourArmyId;
export interface FourArmySpectatorSave {
  format: 'ministr-four-army-spectator';
  schemaVersion: 1 | 2;
  cpuVersion: FourArmyCpuVersion;
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
    (v.schemaVersion === 1 || v.schemaVersion === 2) &&
    isFourArmyCpuVersion(v.cpuVersion) &&
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
    isFourArmyState(v.archive.payload.state) &&
    Array.isArray(v.archive.payload.commands) &&
    v.archive.payload.commands.length <= (v.schemaVersion === 1 ? 2048 : FOUR_ARMY_COMMAND_LIMIT)
  );
}

export interface VerifiedFourArmySave {
  save: FourArmySpectatorSave;
  checkpoints: FourArmyCheckpoint[];
}
export interface FourArmyVerificationProgress extends FourArmyCheckpoint {
  total: number;
}
/** Full history remains authoritative. Persisted files cannot supply trusted checkpoints. */
export function* verifyFourArmySpectatorSave(text: string): Generator<FourArmyVerificationProgress, GameResult<VerifiedFourArmySave>> {
  const bounded = parseBoundedJson(text, FOUR_ARMY_FILE_BYTES, 1_000_000);
  if (!bounded.ok) return bounded;
  let input = bounded.value;
  if (!record(input)) return fail('4軍観戦の保存形式が不正です。');
  if (input.schemaVersion === 1) {
    const legacy = parseBoundedJson(text, 1_000_000);
    if (!legacy.ok) return legacy;
  } else if (input.schemaVersion === 2) {
    if (!record(input.archive) || !record(input.archive.payload)) return fail('4軍観戦の保存形式が不正です。');
    const commands = unpackFourArmyCommands(input.archive.payload.commands);
    if (!commands.ok) return commands;
    input = { ...input, archive: { ...input.archive, payload: { ...input.archive.payload, commands: commands.value } } };
  }
  if (!isFourArmySpectatorEnvelope(input)) return fail('4軍観戦の保存形式が不正です。');
  const save = input,
    map = save.archive.payload.map;
  const expected = record(map) ? createFourArmyMap32(map.seed, map.order, map.pathVersion) : undefined;
  if (!expected?.ok || save.archive.schemaVersion !== 2 || canonical(map) !== canonical(expected.value)) return fail('この4軍観戦では四方の前線の固定初期条件を使用します。');
  const verifier = verifyFourArmyArchive(save.archive, save.schemaVersion === 1 ? 2048 : 65536),
    checkpoints: FourArmyCheckpoint[] = [];
  let step = verifier.next();
  while (!step.done) {
    if (step.value.position % FOUR_ARMY_CHECKPOINT_INTERVAL === 0) checkpoints.push(step.value);
    yield { ...step.value, total: save.archive.payload.commands.length };
    step = verifier.next();
  }
  return step.value.ok ? { ok: true, value: { save: { ...save, archive: step.value.value }, checkpoints } } : step.value;
}
export function parseFourArmySpectatorSave(text: string): GameResult<FourArmySpectatorSave> {
  const verifier = verifyFourArmySpectatorSave(text);
  let next = verifier.next();
  while (!next.done) next = verifier.next();
  return next.value.ok ? { ok: true, value: next.value.value.save } : next.value;
}
/** Used by the file Worker and cancellable fallback; 32 commands per cooperative slice. */
export async function verifyFourArmySpectatorSaveAsync(
  text: string,
  current: () => boolean = () => true,
  progress?: (done: number, total: number) => void,
): Promise<GameResult<VerifiedFourArmySave> | undefined> {
  const verifier = verifyFourArmySpectatorSave(text);
  let next = verifier.next();
  while (!next.done) {
    if (!current()) return;
    if (next.value.position % FOUR_ARMY_CHECKPOINT_INTERVAL === 0) progress?.(next.value.position, next.value.total);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!current()) return;
    next = verifier.next();
  }
  return current() ? next.value : undefined;
}
/** Encodes only. Every external writer must run the full verifier before persisting the result. */
export function encodeFourArmySpectatorSave(value: FourArmySpectatorSave): GameResult<string> {
  try {
    if (!isFourArmySpectatorEnvelope(value)) return fail('4軍観戦の保存形式が不正です。');
    const file =
      value.schemaVersion === 2
        ? { ...value, archive: { ...value.archive, payload: { ...value.archive.payload, commands: packFourArmyCommands(value.archive.payload.commands) } } }
        : value;
    const text = JSON.stringify(file);
    return new TextEncoder().encode(text).byteLength <= FOUR_ARMY_FILE_BYTES ? { ok: true, value: text } : fail('4軍観戦の保存容量が上限を超えています。');
  } catch {
    return fail('4軍観戦の保存データを作成できません。');
  }
}
export function serializeFourArmySpectatorSave(value: FourArmySpectatorSave): GameResult<string> {
  const encoded = encodeFourArmySpectatorSave(value);
  if (!encoded.ok) return encoded;
  const verified = parseFourArmySpectatorSave(encoded.value);
  return verified.ok ? encoded : verified;
}

/** A label is not proof that a slot can be resumed. Corrupt originals stay untouched. */
export function fourArmySlotName(text: string | null): string | undefined {
  if (text === null) return;
  const v = parseBoundedJson(text, FOUR_ARMY_FILE_BYTES, 1_000_000);
  return v.ok && record(v.value) && v.value.format === 'ministr-four-army-spectator' && typeof v.value.name === 'string' && v.value.name.length <= 40 ? v.value.name : undefined;
}
