import { parseBoundedJson } from './jsonBoundary';
import { availableScenarios, loadScenarioDefinitions, scenarioDefinitionToData, scenarioForState, type ScenarioData, type ScenarioDefinition } from './maps';
import { specialOperationData } from './specialOperations';
import { standaloneOperationData } from './standaloneOperations';
import { controlOperationData } from './controlOperations';
import { applyGameCommand, isGameCommand, isGameState, matchesScenarioInitialState, withinReplayBudget, type GameCommand, type StorageLike } from './session';
import { ruleVersions, type GameResult, type GameState } from './types';

export const OPERATION_RECORDS_KEY = 'ministr.operations.records';
export const MAX_OPERATION_RECORDS = 128;
export const MAX_OPERATION_RECORD_BYTES = 384_000;
export const operationIds: ReadonlySet<string> = new Set([...specialOperationData, ...standaloneOperationData, ...controlOperationData].map((data) => data.id));
export const OPERATION_CHALLENGES = ['swift', 'careful', 'survivors'] as const;
export type OperationChallenge = (typeof OPERATION_CHALLENGES)[number];
export const challengeNames: Record<OperationChallenge, string> = { swift: '規定ターン以内', careful: '味方損失2以下', survivors: '初期の味方全員生存' };
export interface OperationRecord {
  scenarioId: string;
  revision: string;
  configuration: string;
  ruleVersion: NonNullable<GameState['ruleVersion']>;
  difficulty: 'easy' | 'normal' | 'hard';
  bestTurns: number;
  bestLosses: number;
  challenges: OperationChallenge[];
  updatedAt: string;
}
export interface OperationRecords {
  schemaVersion: 1;
  records: OperationRecord[];
}
const emptyRecords = (): OperationRecords => ({ schemaVersion: 1, records: [] });
const fail = <T>(error: string): GameResult<T> => ({ ok: false, error });
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));

/** Canonical strings are compared in full; the short revision hash never decides configuration equality. */
export function canonicalOperationValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalOperationValue).join(',')}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalOperationValue(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function structuralData(data: ScenarioData) {
  const structure = { ...data };
  delete structure.firstPlayerBonus;
  delete structure.secondPlayerBonus;
  return Object.fromEntries(Object.entries(structure).filter(([key]) => key !== 'initialUnits' && key !== 'startingGold'));
}
function configuration(scenario: ScenarioDefinition): string {
  const data = scenarioDefinitionToData(scenario);
  return canonicalOperationValue({ ...data, firstPlayerBonus: data.firstPlayerBonus ?? 0, secondPlayerBonus: data.secondPlayerBonus ?? 0 });
}
export function operationRevision(scenario: ScenarioDefinition): string {
  const text = canonicalOperationValue(structuralData(scenarioDefinitionToData(scenario)));
  let hash = 2166136261;
  for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function operationTurnTarget(id: string): number {
  if (id === 'fighting-withdrawal') return 55;
  if (id === 'frontier-defense') return 7;
  if (id === 'encirclement-breakout') return 10;
  if (id.startsWith('control-')) return 20;
  return 15;
}
function parseConfiguration(text: unknown): ScenarioDefinition | undefined {
  if (typeof text !== 'string') return undefined;
  const parsed = parseBoundedJson(text, 32_000);
  if (!parsed.ok) return undefined;
  const loaded = loadScenarioDefinitions([parsed.value]);
  return loaded.ok && operationIds.has(loaded.value[0]!.id) ? loaded.value[0] : undefined;
}
function recordKey(record: OperationRecord): string {
  return `${record.scenarioId}/${record.ruleVersion}/${record.difficulty}/${record.configuration}`;
}
export function parseOperationRecords(text: string): GameResult<OperationRecords> {
  const parsed = parseBoundedJson(text, MAX_OPERATION_RECORD_BYTES);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (
    !isRecord(value) ||
    !onlyKeys(value, ['schemaVersion', 'records']) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.records) ||
    value.records.length > MAX_OPERATION_RECORDS
  )
    return fail('作戦戦績の形式または件数が不正です。');
  const records: OperationRecord[] = [],
    keys = new Set<string>();
  for (const raw of value.records) {
    if (!isRecord(raw) || !onlyKeys(raw, ['scenarioId', 'revision', 'configuration', 'ruleVersion', 'difficulty', 'bestTurns', 'bestLosses', 'challenges', 'updatedAt']))
      return fail('作戦戦績の項目が不正です。');
    const scenario = parseConfiguration(raw.configuration);
    if (
      !scenario ||
      raw.scenarioId !== scenario.id ||
      raw.revision !== operationRevision(scenario) ||
      !ruleVersions.includes(raw.ruleVersion as never) ||
      (raw.ruleVersion as number) < 6 ||
      !['easy', 'normal', 'hard'].includes(String(raw.difficulty)) ||
      !Number.isSafeInteger(raw.bestTurns) ||
      (raw.bestTurns as number) < 1 ||
      !Number.isSafeInteger(raw.bestLosses) ||
      (raw.bestLosses as number) < 0 ||
      !Array.isArray(raw.challenges) ||
      raw.challenges.length > OPERATION_CHALLENGES.length ||
      new Set(raw.challenges).size !== raw.challenges.length ||
      raw.challenges.some((challenge) => !OPERATION_CHALLENGES.includes(challenge as OperationChallenge)) ||
      typeof raw.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(raw.updatedAt))
    )
      return fail('作戦戦績の値が不正です。');
    if (scenario.victoryConditions.some((condition) => condition.type === 'control') && (raw.ruleVersion as number) < 7) return fail('拠点支配戦のルール版が不正です。');
    const record = { ...raw, configuration: configuration(scenario) } as unknown as OperationRecord;
    const key = recordKey(record);
    if (keys.has(key)) return fail('同じ条件の戦績が重複しています。');
    keys.add(key);
    records.push(record);
  }
  return { ok: true, value: { schemaVersion: 1, records } };
}
export function loadOperationRecords(storage: StorageLike): GameResult<OperationRecords> {
  try {
    const text = storage.getItem(OPERATION_RECORDS_KEY);
    return text === null ? { ok: true, value: emptyRecords() } : parseOperationRecords(text);
  } catch {
    return fail('作戦戦績を読み出せませんでした。');
  }
}

/** Derive a victory from its legal command prefix, including fuel losses and excluding merges/evacuation. */
export function operationVictory(initial: GameState, final: GameState, commands: readonly GameCommand[], difficulty: OperationRecord['difficulty']): GameResult<OperationRecord> {
  const scenario = scenarioForState(initial),
    current = availableScenarios().find((scenario) => scenario.id === initial.scenarioId);
  if (
    !scenario ||
    !current ||
    !operationIds.has(scenario.id) ||
    initial.turn !== 1 ||
    initial.activePlayer !== 'red' ||
    initial.winner ||
    !isGameState(initial) ||
    !matchesScenarioInitialState(initial, scenario) ||
    !isGameState(final) ||
    final.winner !== 'red' ||
    !initial.ruleVersion ||
    initial.ruleVersion < 6 ||
    !['easy', 'normal', 'hard'].includes(difficulty) ||
    canonicalOperationValue(structuralData(scenarioDefinitionToData(scenario))) !== canonicalOperationValue(structuralData(scenarioDefinitionToData(current))) ||
    !withinReplayBudget(initial, commands.length)
  )
    return fail('この対局は単体作戦の戦績対象ではありません。');
  let state = initial,
    losses = 0;
  for (const command of commands) {
    if (!isGameCommand(command)) return fail('作戦履歴が不正です。');
    const next = applyGameCommand(state, command);
    if (!next.ok) return next;
    if (command.type !== 'merge' && command.type !== 'evacuate') {
      const surviving = new Set([...next.value.units, ...(next.value.evacuatedUnits ?? [])].map((unit) => unit.id));
      losses += state.units.filter((unit) => unit.owner === 'red' && !surviving.has(unit.id)).length;
    }
    state = next.value;
  }
  if (canonicalOperationValue(state) !== canonicalOperationValue(final)) return fail('作戦の結果と履歴が一致しません。');
  const turns = Math.max(1, final.turn - Number(commands.at(-1)?.type === 'endTurn' && final.activePlayer === 'red'));
  const surviving = new Set([...final.units, ...(final.evacuatedUnits ?? [])].map((unit) => unit.id));
  const challenges = OPERATION_CHALLENGES.filter((challenge) =>
    challenge === 'swift'
      ? turns <= operationTurnTarget(scenario.id)
      : challenge === 'careful'
        ? losses <= 2
        : initial.units.filter((unit) => unit.owner === 'red').every((unit) => surviving.has(unit.id)),
  );
  return {
    ok: true,
    value: {
      scenarioId: scenario.id,
      revision: operationRevision(scenario),
      configuration: configuration(scenario),
      ruleVersion: initial.ruleVersion,
      difficulty,
      bestTurns: turns,
      bestLosses: losses,
      challenges,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function saveOperationVictory(storage: StorageLike, candidate: OperationRecord): GameResult<{ catalog: OperationRecords; changed: boolean }> {
  const checked = parseOperationRecords(JSON.stringify({ schemaVersion: 1, records: [candidate] }));
  if (!checked.ok) return checked;
  candidate = checked.value.records[0]!;
  const loaded = loadOperationRecords(storage);
  if (!loaded.ok) return loaded;
  const existing = loaded.value.records.find((record) => recordKey(record) === recordKey(candidate));
  const record = existing
    ? {
        ...existing,
        bestTurns: Math.min(existing.bestTurns, candidate.bestTurns),
        bestLosses: Math.min(existing.bestLosses, candidate.bestLosses),
        challenges: OPERATION_CHALLENGES.filter((challenge) => existing.challenges.includes(challenge) || candidate.challenges.includes(challenge)),
        updatedAt: candidate.updatedAt,
      }
    : candidate;
  if (
    existing &&
    existing.bestTurns === record.bestTurns &&
    existing.bestLosses === record.bestLosses &&
    canonicalOperationValue(existing.challenges) === canonicalOperationValue(record.challenges)
  )
    return { ok: true, value: { catalog: loaded.value, changed: false } };
  const catalog: OperationRecords = { schemaVersion: 1, records: [...loaded.value.records.filter((entry) => entry !== existing), record] };
  const text = JSON.stringify(catalog),
    validated = parseOperationRecords(text);
  if (!validated.ok) return validated;
  try {
    storage.setItem(OPERATION_RECORDS_KEY, text);
    return { ok: true, value: { catalog: validated.value, changed: true } };
  } catch {
    return fail('作戦戦績を保存できませんでした。既存記録は保持されています。');
  }
}
export function deleteOperationRecord(storage: StorageLike, index: number): GameResult<OperationRecords> {
  const loaded = loadOperationRecords(storage);
  if (!loaded.ok) return loaded;
  if (!Number.isSafeInteger(index) || index < 0 || index >= loaded.value.records.length) return fail('削除する戦績がありません。');
  const catalog = { ...loaded.value, records: loaded.value.records.filter((_, at) => at !== index) };
  try {
    storage.setItem(OPERATION_RECORDS_KEY, JSON.stringify(catalog));
    return { ok: true, value: catalog };
  } catch {
    return fail('戦績を削除できませんでした。');
  }
}
export function resetOperationRecords(storage: StorageLike): GameResult<OperationRecords> {
  try {
    storage.removeItem(OPERATION_RECORDS_KEY);
    return { ok: true, value: emptyRecords() };
  } catch {
    return fail('戦績を初期化できませんでした。');
  }
}
export function isDefaultOperationRecord(record: OperationRecord): boolean {
  const scenario = availableScenarios().find((scenario) => scenario.id === record.scenarioId);
  return !!scenario && configuration(scenario) === record.configuration;
}
