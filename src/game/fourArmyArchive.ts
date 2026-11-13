import { FOUR_ARMY_ARCHIVES } from './fourArmyFoundation';
import { applyFourArmyCommand, createFourArmyState, isFourArmyCommand, isFourArmyState, type FourArmyCommand, type FourArmyMap, type FourArmyState } from './fourArmyEngine';
import { parseBoundedJson } from './jsonBoundary';
import type { GameResult } from './types';

export interface FourArmyArchive {
  format: typeof FOUR_ARMY_ARCHIVES.saveFormat;
  schemaVersion: 1 | 2;
  ruleset: typeof FOUR_ARMY_ARCHIVES.ruleset | 'four-army-v2';
  payload: { map: FourArmyMap; commands: FourArmyCommand[]; state: FourArmyState };
}
const fail = (error: string): GameResult<never> => ({ ok: false, error });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join() === [...keys].sort().join();
// Validated JSON DTOs only; sorted keys permit JSON serializers to reorder object fields.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (record(v))
    return (
      '{' +
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}

/** Legacy engine codec. The public spectator container selects its own bounded history policy. */
export function serializeFourArmyArchive(map: FourArmyMap, commands: readonly FourArmyCommand[], state: FourArmyState): GameResult<string> {
  try {
    const text = JSON.stringify({
      format: FOUR_ARMY_ARCHIVES.saveFormat,
      schemaVersion: state.engineVersion,
      ruleset: state.engineVersion === 1 ? FOUR_ARMY_ARCHIVES.ruleset : 'four-army-v2',
      payload: { map, commands, state },
    });
    const checked = parseFourArmyArchive(text);
    return checked.ok ? { ok: true, value: text } : checked;
  } catch {
    return fail('4軍の保存データをJSON化できません。');
  }
}

/** Bound structure/size before replaying; do not expose an unverified checkpoint as a resumed game. */
export function parseFourArmyArchive(text: string): GameResult<FourArmyArchive> {
  const parsed = parseBoundedJson(text, 1_000_000);
  if (!parsed.ok) return parsed;
  const verifier = verifyFourArmyArchive(parsed.value);
  let next = verifier.next();
  while (!next.done) next = verifier.next();
  return next.value;
}

export interface FourArmyCheckpoint {
  position: number;
  state: FourArmyState;
}
/** Checkpoints are derived from legal commands, never accepted as authority from a file. */
export function* verifyFourArmyArchive(v: unknown, limit: 2048 | 65536 = 2048): Generator<FourArmyCheckpoint, GameResult<FourArmyArchive>> {
  if (
    !record(v) ||
    !exact(v, ['format', 'schemaVersion', 'ruleset', 'payload']) ||
    v.format !== FOUR_ARMY_ARCHIVES.saveFormat ||
    !((v.schemaVersion === 1 && v.ruleset === FOUR_ARMY_ARCHIVES.ruleset) || (v.schemaVersion === 2 && v.ruleset === 'four-army-v2')) ||
    !record(v.payload) ||
    !exact(v.payload, ['map', 'commands', 'state'])
  )
    return fail('未対応の4軍保存形式です。');
  const p = v.payload;
  if (!Array.isArray(p.commands) || p.commands.length > limit || !p.commands.every(isFourArmyCommand) || !isFourArmyState(p.state) || p.state.engineVersion !== v.schemaVersion)
    return fail('4軍保存の内容が不正です。');
  let replayed = createFourArmyState(p.map);
  if (!replayed.ok) return replayed;
  yield { position: 0, state: replayed.value };
  for (let i = 0; i < p.commands.length; i++) {
    const command = p.commands[i];
    replayed = applyFourArmyCommand(replayed.value, command);
    if (!replayed.ok) return fail('4軍保存の命令履歴を再現できません。');
    if ((i + 1) % 32 === 0) yield { position: i + 1, state: replayed.value };
  }
  if (canonical(replayed.value) !== canonical(p.state)) return fail('4軍保存の状態と命令履歴が一致しません。');
  return { ok: true, value: v as unknown as FourArmyArchive };
}
