import { parseBoundedJson } from './jsonBoundary';
import { generateSymmetricMap, type MapGenerationOptions } from './mapGenerator';
import { loadScenarioDefinitions, scenarioDefinitionToData, scenarioForState, type ScenarioDefinition } from './maps';
import { canonicalOperationValue, replayOperationOutcome } from './operationRecords';
import { isGameState, matchesScenarioInitialState, withinReplayBudget, type GameCommand, type StorageLike } from './session';
import { CURRENT_RULE_VERSION, FINITE_SUPPLY_RULE_VERSION, ruleVersions, type GameResult, type GameState } from './types';

/**
 * Daily challenge (#230). Today's battlefield is derived from the UTC date alone, with no
 * server and no randomness beyond the date. Each derivation generation is frozen: a past
 * date must keep producing the same battlefield, so a changed table becomes `d2`, never an
 * edit of `d1`.
 */
export const DAILY_RECORDS_KEY = 'ministr.daily.records';
export const MAX_DAILY_RECORDS = 60;
export const MAX_DAILY_RECORD_BYTES = 32_000;
export const DAILY_GENERATIONS = ['d1'] as const;
export type DailyGeneration = (typeof DAILY_GENERATIONS)[number];
export type DailyPreset = 'standard' | 'frontline';

export interface DailyConditions {
  generation: DailyGeneration;
  /** UTC calendar date, `YYYY-MM-DD`. */
  date: string;
  size: MapGenerationOptions['size'];
  sea: MapGenerationOptions['sea'];
  preset: DailyPreset;
  /** Generator seed: `D<YYYYMMDD>`. */
  seed: string;
  /** Shareable identifier: `D1-YYYYMMDD-v{2|3}` (v2 standard, v3 frontline generator). */
  code: string;
}
export interface DailyRecord {
  date: string;
  generation: DailyGeneration;
  ruleVersion: NonNullable<GameState['ruleVersion']>;
  bestTurns: number;
  bestLosses: number;
  updatedAt: string;
}
export interface DailyRecords {
  schemaVersion: 1;
  /** Newest date first. */
  records: DailyRecord[];
}
export interface DailyMatchContext {
  difficulty: 'easy' | 'normal' | 'hard';
  matchMode: 'cpu' | 'hotseat' | 'spectate';
}

/**
 * Frozen d1 derivation table: every size x sea x preset combination whose balance review
 * (docs/reviews/230-daily-balance.md) did not find an extreme first/second-player skew.
 * Append-only per generation: never reorder or remove, or past dates change.
 */
export const DAILY_TABLE_D1: readonly (readonly [MapGenerationOptions['size'], MapGenerationOptions['sea'], DailyPreset])[] = [
  [16, 'none', 'standard'],
  [16, 'none', 'frontline'],
  [16, 'coast', 'standard'],
  [16, 'coast', 'frontline'],
  [16, 'ocean', 'standard'],
  [16, 'ocean', 'frontline'],
  [20, 'none', 'standard'],
  [20, 'none', 'frontline'],
  [20, 'coast', 'standard'],
  [20, 'coast', 'frontline'],
  [20, 'ocean', 'standard'],
  [20, 'ocean', 'frontline'],
  [24, 'none', 'standard'],
  [24, 'none', 'frontline'],
  [24, 'coast', 'standard'],
  [24, 'coast', 'frontline'],
  [24, 'ocean', 'standard'],
  [24, 'ocean', 'frontline'],
];

const fail = <T>(error: string): GameResult<T> => ({ ok: false, error });
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
const emptyRecords = (): DailyRecords => ({ schemaVersion: 1, records: [] });

export const DAILY_ERRORS = {
  notDaily: 'この対局は日替わりチャレンジではありません。',
  deployment: '編成を変更した対局は日替わりチャレンジの記録対象外です。',
  difficulty: '難易度が普通ではない対局は日替わりチャレンジの記録対象外です。',
  matchMode: '人間の赤軍対CPU以外の対局は日替わりチャレンジの記録対象外です。',
  rules: '補給方式などのルールが標準と異なる対局は日替わりチャレンジの記録対象外です。',
  unfinished: '赤軍が勝利した対局だけを記録します。',
  history: '対局の履歴が不正です。',
} as const;

/** UTC calendar date of `now` (`YYYY-MM-DD`); the clock is injected so tests and e2e can fix it. */
export function dailyDateKey(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid date');
  return now.toISOString().slice(0, 10);
}
export function isDailyDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619);
  return hash >>> 0;
}

export function dailyConditions(date: string, generation: DailyGeneration = 'd1'): GameResult<DailyConditions> {
  if (!isDailyDate(date)) return fail('日付が不正です。');
  if (!DAILY_GENERATIONS.includes(generation)) return fail('日替わりの版が不正です。');
  const hash = fnv1a(`daily-${generation}:${date}`);
  const [size, sea, preset] = DAILY_TABLE_D1[((hash ^ (hash >>> 16)) >>> 0) % DAILY_TABLE_D1.length]!;
  const compact = date.replaceAll('-', '');
  return { ok: true, value: { generation, date, size, sea, preset, seed: `D${compact}`, code: `D1-${compact}-v${preset === 'frontline' ? 3 : 2}` } };
}

/** The canonical definition of a date, normalized exactly as a saved or loaded scenario would be. */
export function dailyScenario(date: string, generation: DailyGeneration = 'd1'): GameResult<ScenarioDefinition> {
  const conditions = dailyConditions(date, generation);
  if (!conditions.ok) return conditions;
  const { size, sea, seed, preset } = conditions.value;
  const generated = generateSymmetricMap({ size, sea, seed, ...(preset === 'frontline' ? { preset } : {}) });
  if (!generated.ok) return generated;
  const loaded = loadScenarioDefinitions([scenarioDefinitionToData(generated.value)]);
  return loaded.ok ? { ok: true, value: loaded.value[0]! } : loaded;
}

const idPattern = /^generated-v(2|3-frontline)-(\d+)-(none|coast|ocean)-D(\d{8})$/;
/**
 * The date encoded in a generated scenario id when it names exactly that date's derived
 * conditions. A hand-generated map with the same options is deliberately treated the same.
 */
export function dailyDateOfScenarioId(id: string): string | undefined {
  const match = idPattern.exec(id);
  if (!match) return undefined;
  const digits = match[4]!;
  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const conditions = dailyConditions(date);
  if (!conditions.ok) return undefined;
  const { size, sea, preset } = conditions.value;
  return Number(match[2]) === size && match[3] === sea && (match[1] === '3-frontline') === (preset === 'frontline') ? date : undefined;
}
export const isDailyScenarioId = (id: string): boolean => dailyDateOfScenarioId(id) !== undefined;

/**
 * Full-data equality. An absent opening bonus and an explicit 0 are the same rule (the
 * deployment planner writes the explicit form even for the default army), so only that
 * one difference is normalized; every unit, tile, seed and objective is compared.
 */
function sameDefinition(left: ScenarioDefinition, right: ScenarioDefinition): boolean {
  const normalize = (scenario: ScenarioDefinition) => {
    const data = scenarioDefinitionToData(scenario);
    return canonicalOperationValue({ ...data, firstPlayerBonus: data.firstPlayerBonus ?? 0, secondPlayerBonus: data.secondPlayerBonus ?? 0 });
  };
  return normalize(left) === normalize(right);
}
/** True only when the definition is exactly the canonical one for its date (forces, budget, seed included). */
export function isStandardDailyDefinition(scenario: ScenarioDefinition): boolean {
  const date = dailyDateOfScenarioId(scenario.id);
  const canonical = date === undefined ? undefined : dailyScenario(date);
  return !!canonical?.ok && sameDefinition(scenario, canonical.value);
}

/**
 * The date and code of a turn-one state that is exactly the date's canonical match. The
 * embedded snapshot is compared in full, so a changed deployment is never mistaken for it.
 */
export function dailyMatchOf(initial: GameState): { date: string; code: string } | undefined {
  const date = dailyDateOfScenarioId(initial.scenarioId ?? '');
  if (date === undefined || initial.scenarioSnapshot === undefined) return undefined;
  const canonical = dailyScenario(date);
  const actual = scenarioForState(initial);
  if (!canonical.ok || !actual || !sameDefinition(actual, canonical.value) || !matchesScenarioInitialState(initial, actual)) return undefined;
  const conditions = dailyConditions(date);
  return conditions.ok ? { date, code: conditions.value.code } : undefined;
}

/** Whether a finished match may be recorded, and the figures to record. The caller supplies the live settings. */
export function dailyVictory(
  initial: GameState,
  final: GameState,
  commands: readonly GameCommand[],
  context: DailyMatchContext,
  now: Date = new Date(),
): GameResult<{ record: DailyRecord; code: string }> {
  const date = dailyDateOfScenarioId(initial.scenarioId ?? '');
  if (date === undefined) return fail(DAILY_ERRORS.notDaily);
  if (initial.turn !== 1 || initial.activePlayer !== 'red' || initial.winner || !isGameState(initial) || !isGameState(final)) return fail(DAILY_ERRORS.history);
  const match = dailyMatchOf(initial);
  if (!match) return fail(DAILY_ERRORS.deployment);
  if (context.matchMode !== 'cpu') return fail(DAILY_ERRORS.matchMode);
  if (context.difficulty !== 'normal') return fail(DAILY_ERRORS.difficulty);
  if (initial.ruleVersion === undefined || initial.ruleVersion < FINITE_SUPPLY_RULE_VERSION || initial.ruleVersion > CURRENT_RULE_VERSION) return fail(DAILY_ERRORS.rules);
  if (final.winner !== 'red') return fail(DAILY_ERRORS.unfinished);
  if (!withinReplayBudget(initial, commands.length)) return fail(DAILY_ERRORS.history);
  const outcome = replayOperationOutcome(initial, final, commands);
  if (!outcome.ok) return outcome;
  return {
    ok: true,
    value: {
      code: match.code,
      record: { date, generation: 'd1', ruleVersion: initial.ruleVersion, bestTurns: outcome.value.turns, bestLosses: outcome.value.losses, updatedAt: now.toISOString() },
    },
  };
}

export function parseDailyRecords(text: string): GameResult<DailyRecords> {
  if (new TextEncoder().encode(text).byteLength > MAX_DAILY_RECORD_BYTES) return fail('日替わりチャレンジの記録が大きすぎます。');
  const parsed = parseBoundedJson(text, MAX_DAILY_RECORD_BYTES);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (!isRecord(value) || !onlyKeys(value, ['schemaVersion', 'records']) || value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > MAX_DAILY_RECORDS)
    return fail('日替わりチャレンジの記録の形式または件数が不正です。');
  const keys = new Set<string>();
  const records: DailyRecord[] = [];
  for (const raw of value.records) {
    if (!isRecord(raw) || !onlyKeys(raw, ['date', 'generation', 'ruleVersion', 'bestTurns', 'bestLosses', 'updatedAt'])) return fail('日替わりチャレンジの記録の項目が不正です。');
    if (
      !isDailyDate(raw.date) ||
      !DAILY_GENERATIONS.includes(raw.generation as DailyGeneration) ||
      !ruleVersions.includes(raw.ruleVersion as never) ||
      !Number.isSafeInteger(raw.bestTurns) ||
      (raw.bestTurns as number) < 1 ||
      (raw.bestTurns as number) > 1000 ||
      !Number.isSafeInteger(raw.bestLosses) ||
      (raw.bestLosses as number) < 0 ||
      (raw.bestLosses as number) > 1000 ||
      typeof raw.updatedAt !== 'string' ||
      raw.updatedAt.length > 40 ||
      !Number.isFinite(Date.parse(raw.updatedAt))
    )
      return fail('日替わりチャレンジの記録の値が不正です。');
    const key = `${raw.generation}/${raw.date}`;
    if (keys.has(key)) return fail('同じ日付の記録が重複しています。');
    keys.add(key);
    records.push({ ...(raw as unknown as DailyRecord) });
  }
  records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { ok: true, value: { schemaVersion: 1, records } };
}
export function loadDailyRecords(storage: StorageLike): GameResult<DailyRecords> {
  try {
    const text = storage.getItem(DAILY_RECORDS_KEY);
    return text === null ? { ok: true, value: emptyRecords() } : parseDailyRecords(text);
  } catch {
    return fail('日替わりチャレンジの記録を読み出せませんでした。');
  }
}

/** Keeps each date's best turns and fewest losses (they may come from different matches); only the newest 60 dates are kept. */
export function saveDailyVictory(storage: StorageLike, candidate: DailyRecord): GameResult<{ catalog: DailyRecords; changed: boolean; retained: boolean }> {
  const checked = parseDailyRecords(JSON.stringify({ schemaVersion: 1, records: [candidate] }));
  if (!checked.ok) return checked;
  candidate = checked.value.records[0]!;
  const loaded = loadDailyRecords(storage);
  if (!loaded.ok) return loaded;
  const existing = loaded.value.records.find((record) => record.date === candidate.date && record.generation === candidate.generation);
  // Records from different rule versions are not comparable, so the newer rules replace them.
  const merged: DailyRecord =
    existing && existing.ruleVersion === candidate.ruleVersion
      ? {
          ...existing,
          bestTurns: Math.min(existing.bestTurns, candidate.bestTurns),
          bestLosses: Math.min(existing.bestLosses, candidate.bestLosses),
          updatedAt: candidate.updatedAt,
        }
      : candidate;
  if (existing && existing.ruleVersion === merged.ruleVersion && existing.bestTurns === merged.bestTurns && existing.bestLosses === merged.bestLosses)
    return { ok: true, value: { catalog: loaded.value, changed: false, retained: true } };
  const next = [...loaded.value.records.filter((record) => record !== existing), merged]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_DAILY_RECORDS);
  if (!next.includes(merged)) return { ok: true, value: { catalog: loaded.value, changed: false, retained: false } };
  const text = JSON.stringify({ schemaVersion: 1, records: next });
  const validated = parseDailyRecords(text);
  if (!validated.ok) return validated;
  try {
    storage.setItem(DAILY_RECORDS_KEY, text);
    return { ok: true, value: { catalog: validated.value, changed: true, retained: true } };
  } catch {
    return fail('日替わりチャレンジの記録を保存できませんでした。既存記録は保持されています。');
  }
}
export function deleteDailyRecord(storage: StorageLike, date: string): GameResult<DailyRecords> {
  const loaded = loadDailyRecords(storage);
  if (!loaded.ok) return loaded;
  if (!loaded.value.records.some((record) => record.date === date)) return fail('削除する記録がありません。');
  const catalog: DailyRecords = { schemaVersion: 1, records: loaded.value.records.filter((record) => record.date !== date) };
  try {
    storage.setItem(DAILY_RECORDS_KEY, JSON.stringify(catalog));
    return { ok: true, value: catalog };
  } catch {
    return fail('日替わりチャレンジの記録を削除できませんでした。');
  }
}
export function resetDailyRecords(storage: StorageLike): GameResult<DailyRecords> {
  try {
    storage.removeItem(DAILY_RECORDS_KEY);
    return { ok: true, value: emptyRecords() };
  } catch {
    return fail('日替わりチャレンジの記録を初期化できませんでした。');
  }
}
