import { createExpandedBattleMap } from './expandedBattleMap';
import { isFourArmyControlHistory, fourArmyControlVerifier, type FourArmyControlHistory } from './fourArmyControlHistory';
import { createSmallBattleMap } from './smallBattleMap';
import { fourArmyParticipants, isSmallBattle } from './smallBattle';
import { isFourArmyControllers, fourArmyControllers, fourArmyHumanArmies, type FourArmyControllers } from './fourArmyControl';
import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import { createFourArmyMap32 } from './fourArmyMap32';
import { isFourArmyState } from './fourArmyEngine';
import { verifyFourArmyArchive, type FourArmyArchive, type FourArmyCheckpoint } from './fourArmyArchive';
import { FOUR_ARMY_LONG_COMMANDS, packFourArmyCommands, unpackFourArmyCommands } from './fourArmyCommandLog';
import { isFourArmyCpuSettings, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import { parseBoundedJson } from './jsonBoundary';
import type { GameResult } from './types';
import { isFourArmyCpuCompatible, isFourArmyCpuVersion, type FourArmyCpuVersion } from '../ai/fourArmyCpuVersion';
import {
  isFourArmyExperienceManifest,
  fourArmyExperienceVerifier,
  fourArmyExperienceManifest,
  type FourArmyExperienceManifest,
  type FourArmyExperience,
} from './fourArmyExperience';

export const FOUR_ARMY_SAVE_KEYS = ['ministr.fourArmy.save.1', 'ministr.fourArmy.save.2'] as const;
export const FOUR_ARMY_AUTO_SAVE_KEY = 'ministr.fourArmy.autosave';
export const FOUR_ARMY_FILE_BYTES = 8_000_000;
export const FOUR_ARMY_CHECKPOINT_INTERVAL = 2048;
export const FOUR_ARMY_COMMAND_LIMIT = FOUR_ARMY_LONG_COMMANDS;
export type FourArmyView = 'all' | FourArmyId;
interface FourArmySaveBase {
  format: 'ministr-four-army-spectator' | 'ministr-four-army-match' | 'ministr-four-army-configurable';
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6;
  cpuVersion: FourArmyCpuVersion;
  name: string;
  savedAt: string;
  settings: FourArmyCpuSettings;
  view: FourArmyView;
  speed: 0.5 | 1 | 2 | 4;
  archive: FourArmyArchive;
}
export type FourArmySpectatorSave = FourArmySaveBase &
  (
    | { format: 'ministr-four-army-spectator' }
    | { format: 'ministr-four-army-match'; humanArmy: FourArmyId }
    | { format: 'ministr-four-army-configurable'; schemaVersion: 3; controllers: FourArmyControllers }
    | { format: 'ministr-four-army-configurable'; schemaVersion: 4 | 5; controllers: FourArmyControllers; experience: FourArmyExperienceManifest }
    | {
        format: 'ministr-four-army-configurable';
        schemaVersion: 6;
        controllers: FourArmyControllers;
        experience: FourArmyExperienceManifest;
        controlHistory: FourArmyControlHistory;
      }
  );
export const isFourArmySaveKey = (key: string): boolean => key === FOUR_ARMY_AUTO_SAVE_KEY || FOUR_ARMY_SAVE_KEYS.some((k) => k === key);
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
    keys(v, [
      'format',
      'schemaVersion',
      'cpuVersion',
      'name',
      'savedAt',
      'settings',
      'view',
      'speed',
      'archive',
      ...(v.format === 'ministr-four-army-match' ? ['humanArmy'] : v.format === 'ministr-four-army-configurable' ? ['controllers'] : []),
      ...(v.schemaVersion === 4 || v.schemaVersion === 5 || v.schemaVersion === 6 ? ['experience'] : []),
      ...(v.schemaVersion === 6 ? ['controlHistory'] : []),
    ]) &&
    ((v.format === 'ministr-four-army-spectator' && (v.schemaVersion === 1 || v.schemaVersion === 2)) ||
      (v.format === 'ministr-four-army-match' && v.schemaVersion === 2 && FOUR_ARMY_IDS.some((a) => a === v.humanArmy)) ||
      (v.format === 'ministr-four-army-configurable' &&
        (v.schemaVersion === 3 || v.schemaVersion === 4 || v.schemaVersion === 5 || v.schemaVersion === 6) &&
        isFourArmyControllers(v.controllers))) &&
    (v.schemaVersion === 1 || v.schemaVersion === 2 || v.schemaVersion === 3 || v.schemaVersion === 4 || v.schemaVersion === 5 || v.schemaVersion === 6) &&
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
    (v.format !== 'ministr-four-army-match' ||
      v.archive.payload.state.outcome.type !== 'ongoing' ||
      !v.archive.payload.state.alive.includes(v.humanArmy as FourArmyId) ||
      v.view === v.humanArmy) &&
    (v.format !== 'ministr-four-army-configurable' || allowedConfigurableView(v.controllers as FourArmyControllers, v.archive.payload.state, v.view)) &&
    Array.isArray(v.archive.payload.commands) &&
    v.archive.payload.commands.length <= (v.schemaVersion === 1 ? 2048 : FOUR_ARMY_COMMAND_LIMIT) &&
    ((v.schemaVersion !== 4 && v.schemaVersion !== 5 && v.schemaVersion !== 6) || isFourArmyExperienceManifest(v.experience, v.archive.payload.commands.length)) &&
    (v.schemaVersion !== 6 || isFourArmyControlHistory(v.controlHistory, v.archive.payload.commands.length))
  );
}

export interface VerifiedFourArmySave {
  save: FourArmySpectatorSave;
  checkpoints: FourArmyCheckpoint[];
  experience?: FourArmyExperience;
}
export interface FourArmyVerificationProgress extends FourArmyCheckpoint {
  total: number;
}
/** Full history remains authoritative. Persisted files cannot supply trusted checkpoints. */
export function* verifyFourArmySpectatorSave(text: string): Generator<FourArmyVerificationProgress, GameResult<VerifiedFourArmySave>> {
  const bounded = parseBoundedJson(text, FOUR_ARMY_FILE_BYTES, 1_000_000);
  if (!bounded.ok) return bounded;
  let input = bounded.value;
  if (!record(input)) return fail('4軍対局の保存形式が不正です。');
  if (input.schemaVersion === 1) {
    const legacy = parseBoundedJson(text, 1_000_000);
    if (!legacy.ok) return legacy;
  } else if (input.schemaVersion === 2 || input.schemaVersion === 3 || input.schemaVersion === 4 || input.schemaVersion === 5 || input.schemaVersion === 6) {
    if (!record(input.archive) || !record(input.archive.payload)) return fail('4軍対局の保存形式が不正です。');
    const commands = unpackFourArmyCommands(input.archive.payload.commands);
    if (!commands.ok) return commands;
    input = { ...input, archive: { ...input.archive, payload: { ...input.archive.payload, commands: commands.value } } };
  }
  if (!isFourArmySpectatorEnvelope(input)) return fail('4軍対局の保存形式が不正です。');
  const save = input,
    map = save.archive.payload.map;
  const expected =
    record(map) && (!map.match || isSmallBattle(map.match))
      ? map.match
        ? map.match.version === 2
          ? createExpandedBattleMap({
              sourceMapId: map.match.sourceMapId,
              layoutVersion: map.match.layoutVersion,
              participants: map.match.participants,
              seed: map.seed,
              order: map.order,
              ending: map.match.ending,
              teams: map.match.teams,
              sharedVision: map.match.sharedVision,
              rules: map.rules,
            })
          : createSmallBattleMap(map.match.participants.length as 3 | 4, map.seed, map.order, map.match.ending, map.rules)
        : createFourArmyMap32(map.seed, map.order, map.pathVersion === 1 ? 1 : undefined, map.rules)
      : undefined;
  if (
    !expected?.ok ||
    (save.schemaVersion === 6
      ? !isFourArmyCpuCompatible(save.cpuVersion, map.match?.version) ||
        (!map.match && save.cpuVersion === 'four-army-cpu-v5') ||
        save.archive.schemaVersion !== (map.match?.version === 2 ? 5 : map.match ? 4 : map.rules ? 3 : 2)
      : save.schemaVersion === 5
        ? save.archive.schemaVersion !== 4 || !map.match || save.cpuVersion !== 'four-army-cpu-v5'
        : !!map.match ||
          save.cpuVersion === 'four-army-cpu-v5' ||
          save.cpuVersion === 'four-army-cpu-v6' ||
          save.cpuVersion === 'four-army-cpu-v7' ||
          (save.archive.schemaVersion !== 2 && !((save.schemaVersion === 3 || save.schemaVersion === 4) && save.archive.schemaVersion === 3))) ||
    canonical(map) !== canonical(expected.value)
  )
    return fail('この4軍対局では四方の前線の固定初期条件を使用します。');
  const experience =
    (save.schemaVersion === 4 || save.schemaVersion === 5 || save.schemaVersion === 6) && save.format === 'ministr-four-army-configurable'
      ? fourArmyExperienceVerifier(save.experience, save.archive.payload.commands)
      : undefined;
  const control = save.format === 'ministr-four-army-configurable' && save.schemaVersion === 6 ? fourArmyControlVerifier(save.controlHistory, save.controllers) : undefined;
  const verifier = verifyFourArmyArchive(save.archive, save.schemaVersion === 1 ? 2048 : 65536, (state, at) => {
      experience?.visit(state, at);
      control?.visit(state, at);
    }),
    checkpoints: FourArmyCheckpoint[] = [];
  let step = verifier.next();
  while (!step.done) {
    if (step.value.position % FOUR_ARMY_CHECKPOINT_INTERVAL === 0) checkpoints.push(step.value);
    yield { ...step.value, total: save.archive.payload.commands.length };
    step = verifier.next();
  }
  if (!step.value.ok) return step.value;
  if (control && !control.finish()) return fail('操作切替の履歴が一致しません。');
  const history = experience?.finish();
  if (history && !history.ok) return history;
  return {
    ok: true,
    value: {
      save: { ...save, archive: step.value.value, ...(history?.ok ? { experience: fourArmyExperienceManifest(history.value) } : {}) } as FourArmySpectatorSave,
      checkpoints,
      ...(history?.ok ? { experience: history.value } : {}),
    },
  };
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
    if (!isFourArmySpectatorEnvelope(value)) return fail('4軍対局の保存形式が不正です。');
    const file =
      value.schemaVersion === 2 || value.schemaVersion === 3 || value.schemaVersion === 4 || value.schemaVersion === 5 || value.schemaVersion === 6
        ? { ...value, archive: { ...value.archive, payload: { ...value.archive.payload, commands: packFourArmyCommands(value.archive.payload.commands) } } }
        : value;
    const text = JSON.stringify(file);
    return new TextEncoder().encode(text).byteLength <= FOUR_ARMY_FILE_BYTES ? { ok: true, value: text } : fail('4軍対局の保存容量が上限を超えています。');
  } catch {
    return fail('4軍対局の保存データを作成できません。');
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
  return v.ok &&
    record(v.value) &&
    (v.value.format === 'ministr-four-army-spectator' || v.value.format === 'ministr-four-army-match' || v.value.format === 'ministr-four-army-configurable') &&
    typeof v.value.name === 'string' &&
    v.value.name.length <= 40
    ? v.value.name
    : undefined;
}

/** Old records keep their original controller allocation; new files must carry all four. */
export function savedFourArmyControllers(save: FourArmySpectatorSave): FourArmyControllers {
  return save.format === 'ministr-four-army-configurable'
    ? structuredClone(save.controllers)
    : fourArmyControllers(save.format === 'ministr-four-army-match' ? [save.humanArmy] : []);
}
function allowedConfigurableView(controllers: FourArmyControllers, state: import('./fourArmyEngine').FourArmyState, view: FourArmyView): boolean {
  const participants = fourArmyParticipants(state);
  if (view !== 'all' && !participants.includes(view)) return false;
  if (FOUR_ARMY_IDS.some((a) => !participants.includes(a) && controllers[a] !== 'cpu')) return false;
  const humans = fourArmyHumanArmies(controllers).filter((a) => participants.includes(a));
  if (state.outcome.type !== 'ongoing' || !humans.some((a) => state.alive.includes(a))) return true;
  if (humans.length === 1) return view === humans[0];
  const actor = state.round.order[state.round.index]!;
  // CPU intervals are concealed. Persist a human perspective, never an all-board permission.
  return controllers[actor] === 'human' ? view === actor : humans.includes(view as FourArmyId);
}
