import { defaultArmyPolicies, isArmyPolicy, type ArmyPolicy } from './armyPolicy';
import { parseBoundedJson } from './jsonBoundary';
import { serializeReplay, type ReplayFile } from './replay';
import { ReplayTimeline } from './replayTimeline';
import { parseSavedGame, replayCommands, saveGame, SAVE_SCHEMA_VERSION, withinInteractiveMatchBudget, type GameCommand, type SavedGame, type StorageLike } from './session';
import { isGameOver, type GameResult, type GameState } from './types';

export const RESEARCH_AUTO_KEY = 'ministr.research.auto';
export const RESEARCH_MANUAL_KEY = 'ministr.research.manual';
export const MAX_RESEARCH_BYTES = 1_000_000;
export interface ResearchOrigin {
  replaySha256: string;
  branchIndex: number;
}
/** The nested match deliberately has no ordinary save schema or campaign tag. */
export type ResearchMatch = Omit<SavedGame, 'schemaVersion' | 'mode' | 'campaignScenarioId' | 'redDifficulty'>;
export interface ResearchFile {
  format: 'ministr-research';
  schemaVersion: 1;
  origin: ResearchOrigin;
  match: ResearchMatch;
}
export const isResearchKey = (key: string): boolean => key === RESEARCH_AUTO_KEY || key === RESEARCH_MANUAL_KEY;
const failure = (error: string): GameResult<never> => ({ ok: false, error });
const validOrigin = (value: unknown): value is ResearchOrigin =>
  record(value) &&
  keys(value, ['replaySha256', 'branchIndex']) &&
  typeof value.replaySha256 === 'string' &&
  /^[a-f0-9]{64}$/.test(value.replaySha256) &&
  Number.isSafeInteger(value.branchIndex) &&
  (value.branchIndex as number) >= 0 &&
  (value.branchIndex as number) <= 100_000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

/** At zero, or immediately after blue's endTurn; never an arbitrary red action. */
export function isResearchBranchPoint(commands: readonly GameCommand[], index: number, state: GameState): boolean {
  return (
    Number.isSafeInteger(index) &&
    index >= 0 &&
    index <= commands.length &&
    state.activePlayer === 'red' &&
    !isGameOver(state) &&
    (index === 0 || commands[index - 1]?.type === 'endTurn')
  );
}

function matchFields(saved: SavedGame): ResearchMatch {
  return {
    mapId: saved.mapId,
    difficulty: saved.difficulty,
    initialState: saved.initialState,
    commands: saved.commands,
    gameState: saved.gameState,
    savedAt: saved.savedAt,
    ...(saved.cpuPolicies ? { cpuPolicies: saved.cpuPolicies } : {}),
  };
}
export function researchSavedMatch(file: ResearchFile): SavedGame {
  return { ...structuredClone(file.match), schemaVersion: SAVE_SCHEMA_VERSION, mode: 'cpu' };
}

/** Runtime stream: validate shape/budget without replaying the entire prefix on every autosave. */
export function createResearchSave(origin: ResearchOrigin, input: Omit<SavedGame, 'schemaVersion' | 'savedAt'>): GameResult<ResearchFile> {
  if (!validOrigin(origin) || origin.branchIndex > input.commands.length) return failure('研究対局の分岐情報が不正です。');
  const checked = saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'memory', {
    mapId: input.mapId,
    difficulty: input.difficulty,
    initialState: input.initialState,
    commands: input.commands,
    gameState: input.gameState,
    mode: 'cpu',
    ...(input.cpuPolicies ? { cpuPolicies: input.cpuPolicies } : {}),
  });
  if (!checked.ok) return checked;
  const file: ResearchFile = { format: 'ministr-research', schemaVersion: 1, origin: { ...origin }, match: matchFields(checked.value) };
  return new TextEncoder().encode(JSON.stringify(file)).byteLength <= MAX_RESEARCH_BYTES ? { ok: true, value: file } : failure('研究対局の保存容量が上限を超えています。');
}

export function parseResearch(text: string): GameResult<ResearchFile> {
  const parsed = parseBoundedJson(text, MAX_RESEARCH_BYTES);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (
    !record(value) ||
    !keys(value, ['format', 'schemaVersion', 'origin', 'match']) ||
    value.format !== 'ministr-research' ||
    value.schemaVersion !== 1 ||
    !validOrigin(value.origin) ||
    !record(value.match) ||
    !keys(value.match, ['mapId', 'difficulty', 'initialState', 'commands', 'gameState', 'savedAt'], ['cpuPolicies'])
  )
    return failure('未対応または不正な研究対局ファイルです。');
  const saved = parseSavedGame(JSON.stringify({ ...value.match, schemaVersion: SAVE_SCHEMA_VERSION, mode: 'cpu' }));
  if (!saved.ok) return saved;
  if (!withinInteractiveMatchBudget(saved.value.initialState, saved.value.gameState, saved.value.commands.length)) return failure('研究対局の対話プレイ上限を超えています。');
  const index = value.origin.branchIndex;
  if (index > saved.value.commands.length) return failure('研究対局の分岐位置が不正です。');
  const branch = replayCommands(saved.value.initialState, saved.value.commands.slice(0, index));
  if (!branch.ok || !isResearchBranchPoint(saved.value.commands, index, branch.value)) return failure('研究対局は赤軍の手番開始から分岐してください。');
  return { ok: true, value: { format: 'ministr-research', schemaVersion: 1, origin: { ...value.origin }, match: matchFields(saved.value) } };
}

export async function forkResearch(file: ReplayFile, index: number, policy: ArmyPolicy = 'balanced'): Promise<GameResult<ResearchFile>> {
  if (!isArmyPolicy(policy) || ((file.initialState.ruleVersion ?? 0) < 12 && policy !== 'balanced')) return failure('この規則では研究用CPU方針を選べません。');
  const serialized = serializeReplay(file);
  if (!serialized.ok) return serialized;
  const source = JSON.parse(serialized.value) as ReplayFile;
  const timeline = new ReplayTimeline(source);
  const branch = timeline.seek(index);
  if (!branch.ok || !isResearchBranchPoint(source.commands, index, branch.value)) return failure('研究対局は赤軍の手番開始から分岐してください。');
  if (!withinInteractiveMatchBudget(source.initialState, branch.value, index)) return failure('研究対局の対話プレイ上限を超えています。');
  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized.value));
  } catch {
    return failure('研究対局の分岐元を確認できませんでした。');
  }
  const replaySha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return createResearchSave(
    { replaySha256, branchIndex: index },
    {
      mapId: source.mapId,
      difficulty: source.difficulty,
      initialState: source.initialState,
      commands: source.commands.slice(0, index),
      gameState: branch.value,
      ...((source.initialState.ruleVersion ?? 0) >= 12 ? { cpuPolicies: { ...defaultArmyPolicies(), blue: policy } } : {}),
    },
  );
}

/** Retrying retains classification and the exact prefix, not a fresh normal match. */
export function retryResearch(origin: ResearchOrigin, input: Omit<SavedGame, 'schemaVersion' | 'savedAt'>): GameResult<ResearchFile> {
  if (!validOrigin(origin) || origin.branchIndex > input.commands.length) return failure('研究対局の分岐情報が不正です。');
  const commands = input.commands.slice(0, origin.branchIndex);
  const state = replayCommands(input.initialState, commands);
  if (!state.ok || !isResearchBranchPoint(commands, origin.branchIndex, state.value)) return failure('研究対局の分岐位置が不正です。');
  return createResearchSave(origin, { ...input, commands, gameState: state.value });
}

// At most two last written strings per storage; foreign/corrupt values are revalidated before replacing.
const written = new WeakMap<StorageLike, Map<string, string>>();
export function saveResearch(storage: StorageLike, key: string, origin: ResearchOrigin, input: Omit<SavedGame, 'schemaVersion' | 'savedAt'>): GameResult<ResearchFile> {
  if (!isResearchKey(key)) return failure('研究用の保存先を選んでください。');
  const created = createResearchSave(origin, input);
  if (!created.ok) return created;
  try {
    const raw = storage.getItem(key);
    const known = written.get(storage);
    if (raw !== null && known?.get(key) !== raw && !parseResearch(raw).ok) return failure('保存済みの研究データを上書きできません。元データを書き出してから削除してください。');
    const serialized = JSON.stringify(created.value);
    storage.setItem(key, serialized);
    const cache = known ?? new Map<string, string>();
    cache.set(key, serialized);
    written.set(storage, cache);
    return created;
  } catch {
    return failure('研究対局を保存できませんでした。研究JSONを書き出して保管してください。');
  }
}
export function loadResearch(storage: StorageLike, key: string): GameResult<ResearchFile> {
  if (!isResearchKey(key)) return failure('研究用の保存先を選んでください。');
  try {
    const raw = storage.getItem(key);
    return raw === null ? failure('研究用セーブがありません。') : parseResearch(raw);
  } catch {
    return failure('研究用セーブを読み込めませんでした。');
  }
}
