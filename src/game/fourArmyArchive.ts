import { FOUR_ARMY_ARCHIVES } from './fourArmyFoundation';
import { applyFourArmyCommand, createFourArmyState, isFourArmyCommand, isFourArmyState, type FourArmyCommand, type FourArmyMap, type FourArmyState } from './fourArmyEngine';
import { parseBoundedJson } from './jsonBoundary';
import type { GameResult } from './types';

export interface FourArmyArchive {
  format: typeof FOUR_ARMY_ARCHIVES.saveFormat;
  schemaVersion: 1;
  ruleset: typeof FOUR_ARMY_ARCHIVES.ruleset;
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

/** Engine checkpoint codec only. Slot storage, replay UI and backup registration come later. */
export function serializeFourArmyArchive(map: FourArmyMap, commands: readonly FourArmyCommand[], state: FourArmyState): GameResult<string> {
  try {
    const text = JSON.stringify({ format: FOUR_ARMY_ARCHIVES.saveFormat, schemaVersion: 1, ruleset: FOUR_ARMY_ARCHIVES.ruleset, payload: { map, commands, state } });
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
  const v = parsed.value;
  if (
    !record(v) ||
    !exact(v, ['format', 'schemaVersion', 'ruleset', 'payload']) ||
    v.format !== FOUR_ARMY_ARCHIVES.saveFormat ||
    v.schemaVersion !== 1 ||
    v.ruleset !== FOUR_ARMY_ARCHIVES.ruleset ||
    !record(v.payload) ||
    !exact(v.payload, ['map', 'commands', 'state'])
  )
    return fail('未対応の4軍保存形式です。');
  const p = v.payload;
  if (!Array.isArray(p.commands) || p.commands.length > 2048 || !p.commands.every(isFourArmyCommand) || !isFourArmyState(p.state)) return fail('4軍保存の内容が不正です。');
  let replayed = createFourArmyState(p.map);
  if (!replayed.ok) return replayed;
  for (const command of p.commands) {
    replayed = applyFourArmyCommand(replayed.value, command);
    if (!replayed.ok) return fail('4軍保存の命令履歴を再現できません。');
  }
  if (canonical(replayed.value) !== canonical(p.state)) return fail('4軍保存の状態と命令履歴が一致しません。');
  return { ok: true, value: v as unknown as FourArmyArchive };
}
