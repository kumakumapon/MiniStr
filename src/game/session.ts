import { attackUnit, captureProperty, disembarkUnit, embarkUnit, endTurn, mergeUnits, moveUnit, produceUnit, waitUnit } from './commands';
import { MAX_EXPERIENCE } from './experience';
import { isUnitKindAvailable } from './facilities';
import { createScenarioInitialState, scenarioForState, scenarioHistory, scenarioDefinitionToData, scenarioCatalogRevision, type ScenarioDefinition } from './maps';
import { ruleVersions, terrainKindSet, type GameResult, type GameState, type Position, type UnitKind } from './types';
import { isEmbarkableUnit, transportCapacity, unitKindSet } from './units';
import { parseBoundedJson } from './jsonBoundary';

/**
 * Schema v3 adds the explicit `wait` command. Malformed cargo is rejected
 * by `isGameState` instead of being repaired during load.
 */
export const SAVE_SCHEMA_VERSION = 4 as const;
export const MAX_SAVE_BYTES = 1_000_000;
export const MANUAL_SAVE_KEY = 'ministr.save.manual';
export const AUTO_SAVE_KEY = 'ministr.save.auto';
export const SAVE_SLOT_PREFIX = 'ministr.save.slot.';
export const SAVE_SLOT_INDEX_KEY = 'ministr.save.slots';
export const MAX_SAVE_SLOTS = 12;
export const STORAGE_WARNING_BYTES = 4_000_000;

export type GameCommand =
  | { type: 'move'; unitId: string; destination: Position }
  | { type: 'wait'; unitId: string }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'merge'; unitId: string; targetId: string }
  | { type: 'capture'; unitId: string }
  | { type: 'produce'; factory: Position; kind: UnitKind }
  | { type: 'embark'; unitId: string; transportId: string }
  | { type: 'disembark'; transportId: string; destination: Position }
  | { type: 'endTurn' };

export interface SavedGame {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  mapId: string;
  difficulty: 'easy' | 'normal' | 'hard';
  initialState: GameState;
  commands: GameCommand[];
  gameState: GameState;
  /** Present only when this save belongs to an active campaign battle. */
  campaignScenarioId?: string;
  /** Match format; absent means a CPU match. Older app versions ignore it. */
  mode?: SavedMatchMode;
  /**
   * Spectating only: red's CPU difficulty (`difficulty` is blue's). Absent means
   * red plays at `difficulty` too. Any other match format must not carry it.
   */
  redDifficulty?: 'easy' | 'normal' | 'hard';
  savedAt: string;
}

/**
 * 'spectate' was added after 'hotseat'. Versions before it reject such saves in
 * `validateSavedGameShape` (an unknown mode), so they never load a half-understood match.
 */
export type SavedMatchMode = 'cpu' | 'hotseat' | 'spectate';

/** Metadata is kept separately so the save picker never needs to trust or parse arbitrary storage values. */
export interface SaveSlot {
  id: string;
  name: string;
  mapId: string;
  difficulty: 'easy' | 'normal' | 'hard';
  turn: number;
  savedAt: string;
  bytes: number;
  /** `legacy` entries are the pre-slot manual/auto saves and remain readable. */
  source: 'slot' | 'legacy';
  mode: SavedMatchMode;
  status?: 'valid' | 'corrupt' | 'missing';
  error?: string;
}

export interface StorageUsage {
  bytes: number;
  itemCount: number;
  warning: boolean;
}

/** v1 had the same fields; keeping named migrations makes later changes append-only. */
function migrateSaveV1ToV2(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, schemaVersion: 2 };
}
function migrateSaveV2ToV3(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, schemaVersion: 3 };
}
function migrateSaveV3ToV4(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, schemaVersion: SAVE_SCHEMA_VERSION };
}

function migrateSavedGame(value: Record<string, unknown>): Record<string, unknown> | undefined {
  if (value.schemaVersion === SAVE_SCHEMA_VERSION) return value;
  if (value.schemaVersion === 3) return migrateSaveV3ToV4(value);
  if (value.schemaVersion === 2) return migrateSaveV3ToV4(migrateSaveV2ToV3(value));
  if (value.schemaVersion === 1) return migrateSaveV3ToV4(migrateSaveV2ToV3(migrateSaveV1ToV2(value)));
  return undefined;
}

/** Upgrade archived custom-map matches without registering imported definitions. */
export function restoreArchivedScenario(value: Record<string, unknown>): Record<string, unknown> {
  const initial = value.initialState;
  if (!isRecord(initial) || initial.scenarioSnapshot !== undefined || typeof value.mapId !== 'string') return value;
  const current = scenarioForState(initial as unknown as GameState);
  if (current && matchesScenarioInitialState(initial, current)) return value;
  const archived = scenarioHistory(value.mapId).find(scenario => matchesScenarioInitialState(initial, scenario));
  if (!archived) return value;
  const snapshot = scenarioDefinitionToData(archived);
  const result = { ...value, initialState: { ...initial, scenarioSnapshot: snapshot } };
  for (const key of ['gameState', 'finalState']) {
    if (isRecord(value[key])) Object.assign(result, { [key]: { ...value[key], scenarioSnapshot: snapshot } });
  }
  return result;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Present on browser Storage; optional so existing storage adapters stay compatible. */
  readonly length?: number;
  key?(index: number): string | null;
}

export function applyGameCommand(state: GameState, command: GameCommand): GameResult {
  switch (command.type) {
    case 'move': return moveUnit(state, command.unitId, command.destination);
    case 'wait': return waitUnit(state, command.unitId);
    case 'attack': return attackUnit(state, command.unitId, command.targetId);
    case 'merge': return mergeUnits(state, command.unitId, command.targetId);
    case 'capture': return captureProperty(state, command.unitId);
    case 'produce': return produceUnit(state, command.factory, command.kind);
    case 'embark': return embarkUnit(state, command.unitId, command.transportId);
    case 'disembark': return disembarkUnit(state, command.transportId, command.destination);
    case 'endTurn': return { ok: true, value: endTurn(state) };
  }
}

export function replayCommands(initialState: GameState, commands: readonly GameCommand[]): GameResult {
  if (!withinReplayBudget(initialState, commands.length)) return { ok: false, error: '再現処理の上限を超えています。履歴または盤面が大きすぎます。' };
  let state = structuredClone(initialState);
  for (let index = 0; index < commands.length; index += 1) {
    const result = applyGameCommand(state, commands[index]!);
    if (!result.ok) return { ok: false, error: `Command ${index + 1}: ${result.error}` };
    state = result.value;
  }
  return { ok: true, value: state };
}

/** Deterministic work bound, independent of the machine's clock or speed. */
export function withinReplayBudget(state: GameState, commands: number): boolean {
  return commands * (state.board.width * state.board.height + state.units.length * 4 + 1) <= 50_000_000;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isPosition = (value: unknown): value is Position =>
  isRecord(value) && Number.isInteger(value.x) && Number.isInteger(value.y);
const players = new Set(['red', 'blue']);

const isScenarioScores = (value: unknown): boolean => {
  if (!isRecord(value) || Object.keys(value).some(key => !players.has(key))) return false;
  return Object.values(value).every(score => isFiniteNumber(score) && score >= 0);
};

const isHoldProgress = (value: unknown): boolean => {
  if (!isRecord(value) || Object.keys(value).some(key => !players.has(key))) return false;
  return Object.values(value).every(progress => isRecord(progress)
    && Object.values(progress).every(turns => Number.isSafeInteger(turns) && (turns as number) >= 0));
};

function sameValue(left: unknown, right: unknown): boolean {
  const stack: Array<[unknown, unknown]> = [[left, right]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (Object.is(a, b)) continue;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let index = 0; index < a.length; index += 1) stack.push([a[index], b[index]]);
      continue;
    }
    if (isRecord(a) || isRecord(b)) {
      if (!isRecord(a) || !isRecord(b)) return false;
      // JSON drops object properties whose value is undefined, so persisted
      // deployed units may omit `embarkedIn` while replayed units carry it as
      // an explicit undefined value.
      const keys = Object.keys(a).filter(key => a[key] !== undefined);
      const otherKeys = Object.keys(b).filter(key => b[key] !== undefined);
      if (keys.length !== otherKeys.length || !keys.every(key => Object.hasOwn(b, key) && b[key] !== undefined)) return false;
      for (const key of keys) stack.push([a[key], b[key]]);
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Whether `value` is the scenario's canonical turn-one state. States recorded
 * before Phase 9 carry no `ruleVersion`; they still match the same board and
 * forces and are then replayed with the classic rules they were played with.
 */
export function matchesScenarioInitialState(value: unknown, scenario: ScenarioDefinition): boolean {
  const expected = createScenarioInitialState(scenario);
  // Replay older matches with the rule version they recorded (classic or v2).
  const recorded = isRecord(value) && (value.ruleVersion === undefined || ruleVersions.includes(value.ruleVersion as never))
    ? value.ruleVersion : expected.ruleVersion;
  return sameValue(value, { ...expected, ruleVersion: recorded,
    scenarioSnapshot: isRecord(value) && value.scenarioSnapshot !== undefined ? expected.scenarioSnapshot : undefined });
}

export function isGameCommand(value: unknown): value is GameCommand {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'endTurn') return true;
  if (value.type === 'move') return typeof value.unitId === 'string' && isPosition(value.destination);
  if (value.type === 'wait') return typeof value.unitId === 'string';
  if (value.type === 'attack') return typeof value.unitId === 'string' && typeof value.targetId === 'string';
  if (value.type === 'merge') return typeof value.unitId === 'string' && typeof value.targetId === 'string';
  if (value.type === 'capture') return typeof value.unitId === 'string';
  if (value.type === 'embark') return typeof value.unitId === 'string' && typeof value.transportId === 'string';
  if (value.type === 'disembark') return typeof value.transportId === 'string' && isPosition(value.destination);
  return value.type === 'produce' && isPosition(value.factory)
    && typeof value.kind === 'string' && unitKindSet.has(value.kind);
}

export function isGameState(value: unknown): value is GameState {
  if (!isRecord(value) || !isRecord(value.board) || !Array.isArray(value.board.terrain)
    || !Array.isArray(value.units) || !isRecord(value.players)) return false;
  const width = value.board.width;
  const height = value.board.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || (width as number) <= 0 || (height as number) <= 0
    || (width as number) > 256 || (height as number) > 256
    || value.board.terrain.length !== height) return false;
  if (!value.board.terrain.every(row => Array.isArray(row) && row.length === width && row.every(tile =>
    isRecord(tile) && typeof tile.kind === 'string' && terrainKindSet.has(tile.kind)
    && (tile.owner === undefined || players.has(tile.owner as string))
    && (tile.capturePoints === undefined || (isFiniteNumber(tile.capturePoints) && tile.capturePoints >= 0 && tile.capturePoints <= 20))))) return false;

  if (value.ruleVersion !== undefined && !ruleVersions.includes(value.ruleVersion as never)) return false;
  const modern = value.ruleVersion !== undefined;
  if (value.units.length > 4096) return false;
  const ids = new Set<string>();
  const positions = new Set<string>();
  const unitsById = new Map<string, Record<string, unknown>>();
  for (const unit of value.units) {
    if (!isRecord(unit) || typeof unit.id !== 'string' || ids.has(unit.id)
      || typeof unit.kind !== 'string' || !unitKindSet.has(unit.kind)
      // Modern-only units cannot appear in a classic match, even through a map's initial forces.
      || !isUnitKindAvailable(unit.kind as UnitKind, value.ruleVersion as GameState['ruleVersion'])
      || typeof unit.owner !== 'string' || !players.has(unit.owner)
      || !isFiniteNumber(unit.hp) || unit.hp <= 0 || unit.hp > 100
      || (unit.fuel !== undefined && (!isFiniteNumber(unit.fuel) || unit.fuel < 0))
      || (unit.ammo !== undefined && (!isFiniteNumber(unit.ammo) || unit.ammo < 0))
      || typeof unit.hasMoved !== 'boolean' || typeof unit.hasActed !== 'boolean'
      // Experience exists only in modern-rule matches, so a classic save cannot smuggle in rank bonuses.
      || (unit.experience !== undefined && (!modern || !Number.isSafeInteger(unit.experience)
        || (unit.experience as number) < 0 || (unit.experience as number) > MAX_EXPERIENCE))) return false;
    const deployed = unit.position !== undefined && unit.embarkedIn === undefined;
    const embarked = unit.position === undefined && typeof unit.embarkedIn === 'string';
    if (!deployed && !embarked) return false;
    if (deployed) {
      if (!isPosition(unit.position) || unit.position.x < 0 || unit.position.y < 0
        || unit.position.x >= (width as number) || unit.position.y >= (height as number)) return false;
      const position = `${unit.position.x},${unit.position.y}`;
      if (positions.has(position)) return false;
      positions.add(position);
    }
    ids.add(unit.id);
    unitsById.set(unit.id, unit);
  }
  const cargoByTransport = new Map<string, number>();
  for (const unit of value.units) {
    if (!isRecord(unit) || unit.embarkedIn === undefined) continue;
    const transport = unitsById.get(unit.embarkedIn as string);
    if (!transport || typeof transport.kind !== 'string' || !unitKindSet.has(transport.kind)
      || transport.owner !== unit.owner || transport.embarkedIn !== undefined
      || typeof unit.kind !== 'string' || !unitKindSet.has(unit.kind) || !isEmbarkableUnit(unit.kind as UnitKind)) return false;
    const cargoCount = (cargoByTransport.get(unit.embarkedIn as string) ?? 0) + 1;
    if (cargoCount > transportCapacity(transport.kind as UnitKind)) return false;
    cargoByTransport.set(unit.embarkedIn as string, cargoCount);
  }
  const validPlayerState = (state: unknown) =>
    isRecord(state) && isFiniteNumber(state.gold) && state.gold >= 0
    && isFiniteNumber(state.income) && state.income >= 0;
  return validPlayerState(value.players.red) && validPlayerState(value.players.blue)
    && typeof value.activePlayer === 'string' && players.has(value.activePlayer)
    && Number.isInteger(value.turn) && (value.turn as number) >= 1
    && Number.isSafeInteger(value.rngSeed) && (value.rngSeed as number) >= 0 && (value.rngSeed as number) <= 0xffff_ffff
    && Number.isSafeInteger(value.nextUnitId) && (value.nextUnitId as number) >= 1
    && (value.winner === undefined || players.has(value.winner as string))
    && (value.scenarioId === undefined ? value.scenarioSnapshot === undefined
      : typeof value.scenarioId === 'string' && scenarioForState(value as unknown as GameState) !== undefined)
    && (value.scores === undefined || isScenarioScores(value.scores))
    && (value.objectiveHoldTurns === undefined || isHoldProgress(value.objectiveHoldTurns));
}

function validateSavedGameShape(value: unknown): value is SavedGame {
  const scenario = isRecord(value) && isRecord(value.initialState) ? scenarioForState(value.initialState as unknown as GameState) : undefined;
  return isRecord(value) && value.schemaVersion === SAVE_SCHEMA_VERSION
    && typeof value.mapId === 'string' && scenario !== undefined && scenario.id === value.mapId
    && ['easy', 'normal', 'hard'].includes(String(value.difficulty))
    && typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt)) && isGameState(value.initialState) && isGameState(value.gameState)
    // A self-consistent edited save/replay must not be able to alter the map's
    // turn-one gold, board, or forces. Custom IDs resolve through the loaded,
    // persisted custom catalog rather than trusting the save payload.
    && matchesScenarioInitialState(value.initialState, scenario)
    && (value.campaignScenarioId === undefined || value.campaignScenarioId === value.mapId)
    && (value.mode === undefined || value.mode === 'cpu' || value.mode === 'hotseat' || value.mode === 'spectate')
    // Campaigns are CPU battles only.
    && !((value.mode === 'hotseat' || value.mode === 'spectate') && value.campaignScenarioId !== undefined)
    && (value.redDifficulty === undefined
      || (value.mode === 'spectate' && ['easy', 'normal', 'hard'].includes(String(value.redDifficulty))))
    && Array.isArray(value.commands) && value.commands.length <= 100_000 && value.commands.every(isGameCommand);
}

function validateSavedGameConsistency(saved: SavedGame): GameResult<SavedGame> {
  const replayed = replayCommands(saved.initialState, saved.commands);
  if (!replayed.ok) return { ok: false, error: `セーブデータを再現できません: ${replayed.error}` };
  if (!sameValue(replayed.value, saved.gameState))
    return { ok: false, error: 'セーブデータの状態がコマンド履歴と一致しません。' };
  return { ok: true, value: saved };
}

export function parseSavedGame(serialized: string): GameResult<SavedGame> {
  if (new TextEncoder().encode(serialized).byteLength > MAX_SAVE_BYTES)
    return { ok: false, error: 'セーブデータが大きすぎます。' };
  const parsed = parseBoundedJson(serialized, MAX_SAVE_BYTES);
  if (!parsed.ok) return { ok: false, error: parsed.error.includes('壊れ') ? 'セーブデータが壊れています。' : 'セーブデータの内容が不正です。' };
  const value = parsed.value;
  if (!isRecord(value)) return { ok: false, error: 'セーブデータの形式が不正です。' };
  const migrated = migrateSavedGame(restoreArchivedScenario(value));
  if (!migrated) return { ok: false, error: '未対応のセーブデータです。' };
  if (!validateSavedGameShape(migrated)) return { ok: false, error: 'セーブデータの内容が不正です。' };
  try { return validateSavedGameConsistency(migrated); }
  catch { return { ok: false, error: 'セーブデータの内容が不正です。' }; }
}

export function saveGame(storage: StorageLike, key: string, game: Omit<SavedGame, 'schemaVersion' | 'savedAt'>): GameResult<SavedGame> {
  const saved: SavedGame = { schemaVersion: SAVE_SCHEMA_VERSION, ...structuredClone(game), savedAt: new Date().toISOString() };
  if (!validateSavedGameShape(saved)) return { ok: false, error: 'セーブデータの内容が不正です。' };
  // Runtime saves originate from the already-applied command stream. Replaying
  // that entire stream for every autosave is O(n²); untrusted serialized data
  // is still replayed by parseSavedGame/loadGame before it can be used.
  const serialized = JSON.stringify(saved);
  if (new TextEncoder().encode(serialized).byteLength > MAX_SAVE_BYTES)
    return { ok: false, error: 'セーブデータが大きすぎます。' };
  try { storage.setItem(key, serialized); return { ok: true, value: saved }; }
  catch { return { ok: false, error: 'セーブデータを書き込めませんでした。' }; }
}

export function loadGame(storage: StorageLike, keys: readonly string[] = [MANUAL_SAVE_KEY, AUTO_SAVE_KEY]): GameResult<SavedGame> | undefined {
  let firstError: GameResult<SavedGame> | undefined;
  for (const key of keys) {
    let raw: string | null;
    try { raw = storage.getItem(key); }
    catch { return { ok: false, error: 'セーブデータを読み込めませんでした。' }; }
    if (raw === null) continue;
    const parsed = parseSavedGame(raw);
    if (parsed.ok) return parsed;
    firstError ??= parsed;
  }
  return firstError;
}

export function hasSavedGame(storage: StorageLike): boolean {
  return listSaveSlots(storage).some(slot => slot.status === 'valid');
}

/** Presence-only check used to offer explicit recovery for invalid saves. */
export function hasStoredSaveData(storage: StorageLike): boolean {
  try { return storage.getItem(MANUAL_SAVE_KEY) !== null || storage.getItem(AUTO_SAVE_KEY) !== null; }
  catch { return false; }
}

export function deleteSaves(storage: StorageLike): GameResult<void> {
  return writeStorageChanges(storage, new Map([[MANUAL_SAVE_KEY, null], [AUTO_SAVE_KEY, null]]));
}

const slotKey = (id: string) => `${SAVE_SLOT_PREFIX}${id}`;
const bytesOf = (value: string) => new TextEncoder().encode(value).byteLength;
const validSlotId = (value: string) => /^[a-z0-9][a-z0-9-]{0,47}$/.test(value);
const reservedSlotId = (value: string) => value === 'manual' || value === 'auto';
const validSlotName = (value: string) => value.length > 0 && value.length <= 40
  && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
interface StoredSlotIndexEntry { id: string; name: string }

function readSlotIndex(storage: StorageLike): StoredSlotIndexEntry[] {
  try {
    const raw = storage.getItem(SAVE_SLOT_INDEX_KEY);
    if (!raw || bytesOf(raw) > 32_000) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const ids = new Set<string>();
    return value.flatMap(entry => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string'
        || !validSlotId(entry.id) || !validSlotName(entry.name) || ids.has(entry.id)) return [];
      ids.add(entry.id);
      return [{ id: entry.id, name: entry.name }];
    }).slice(0, MAX_SAVE_SLOTS);
  } catch { return []; }
}
/** Reconcile orphaned payloads without writing or discarding broken entries. */
function recoverSlotIndex(storage: StorageLike): StoredSlotIndexEntry[] {
  const entries = readSlotIndex(storage);
  try {
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const key = storage.key?.(i);
      if (!key?.startsWith(SAVE_SLOT_PREFIX)) continue;
      const id = key.slice(SAVE_SLOT_PREFIX.length);
      if (validSlotId(id) && !reservedSlotId(id) && !entries.some(entry => entry.id === id)) entries.push({ id, name: `復旧: ${id}` });
    }
  } catch { /* Indexed entries remain usable when enumeration is unavailable. */ }
  return entries;
}

export function writeStorageChanges(storage: StorageLike, changes: ReadonlyMap<string, string | null>): GameResult<void> {
  const previous = new Map<string, string | null>();
  try {
    for (const key of changes.keys()) previous.set(key, storage.getItem(key));
    for (const [key, value] of changes) {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
    }
    return { ok: true, value: undefined };
  } catch {
    try {
      for (const [key, value] of previous) {
        if (storage.getItem(key) === value) continue;
        if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      }
    } catch { return { ok: false, error: '保存に失敗し、元のデータを完全には復元できませんでした。バックアップを保存して復旧してください。' }; }
    return { ok: false, error: '保存に失敗しました。変更前のデータを保持しています。' };
  }
}
function toSaveSlot(id: string, name: string, source: SaveSlot['source'], raw: string | null): SaveSlot {
  const invalid = { id, name, source, mode: 'cpu' as const, mapId: '不明', difficulty: 'normal' as const, turn: 0, savedAt: '', bytes: bytesOf(raw ?? '') };
  if (raw === null) return { ...invalid, status: 'missing', error: '本体データがありません。' };
  const parsed = parseSavedGame(raw);
  if (!parsed.ok) return { ...invalid, status: 'corrupt', error: parsed.error };
  const saved = parsed.value;
  return { id, name, source, status: 'valid', mode: saved.mode ?? 'cpu', mapId: saved.mapId, difficulty: saved.difficulty, turn: saved.gameState.turn, savedAt: saved.savedAt, bytes: bytesOf(raw) };
}

const slotCache = new WeakMap<StorageLike, Map<string, { raw: string | null; name: string; revision: number; slot: SaveSlot }>>();
function cachedSlot(storage: StorageLike, id: string, name: string, source: SaveSlot['source'], raw: string | null): SaveSlot {
  let cache = slotCache.get(storage);
  if (!cache) { cache = new Map(); slotCache.set(storage, cache); }
  const key = `${source}:${id}`;
  const entry = cache.get(key);
  const revision = scenarioCatalogRevision();
  if (entry && entry.raw === raw && entry.name === name && entry.revision === revision) return { ...entry.slot };
  const slot = toSaveSlot(id, name, source, raw);
  if (cache.size > MAX_SAVE_SLOTS + 2) cache.clear();
  cache.set(key, { raw, name, slot, revision });
  return { ...slot };
}

/** Lists valid named saves plus compatible pre-v4 manual/auto saves. Invalid records are deliberately hidden. */
export function listSaveSlots(storage: StorageLike): SaveSlot[] {
  try {
    const slots = recoverSlotIndex(storage).map(entry => {
      const raw = storage.getItem(slotKey(entry.id));
      return cachedSlot(storage, entry.id, entry.name, 'slot', raw);
    });
    for (const [id, name, key] of [['manual', '以前の手動セーブ', MANUAL_SAVE_KEY], ['auto', '以前のオートセーブ', AUTO_SAVE_KEY]] as const) {
      const raw = storage.getItem(key);
      const slot = raw === null ? undefined : cachedSlot(storage, id, name, 'legacy', raw);
      if (slot) slots.push(slot);
    }
    return slots.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  } catch { return []; }
}
function namedSaveKey(id: string): string | undefined {
  return id === 'manual' ? MANUAL_SAVE_KEY : id === 'auto' ? AUTO_SAVE_KEY : validSlotId(id) ? slotKey(id) : undefined;
}

/** Saves to a named slot. Legacy ids are readable but intentionally cannot be overwritten through this API. */
export function saveGameToSlot(storage: StorageLike, id: string, name: string, game: Omit<SavedGame, 'schemaVersion' | 'savedAt'>): GameResult<SavedGame> {
  if (!validSlotId(id) || reservedSlotId(id) || !validSlotName(name)) return { ok: false, error: 'セーブスロット名またはIDが不正です。' };
  const index = recoverSlotIndex(storage);
  const existing = index.find(entry => entry.id === id);
  if (!existing && index.length >= MAX_SAVE_SLOTS) return { ok: false, error: `セーブスロットは最大${MAX_SAVE_SLOTS}件です。不要なセーブを削除してください。` };
  let serialized = '';
  const saved = saveGame({ getItem: () => null, removeItem: () => {}, setItem: (_key, value) => { serialized = value; } }, slotKey(id), game);
  if (!saved.ok) return saved;
  const next = existing ? index.map(entry => entry.id === id ? { id, name } : entry) : [...index, { id, name }];
  const indexed = writeStorageChanges(storage, new Map([[slotKey(id), serialized], [SAVE_SLOT_INDEX_KEY, JSON.stringify(next)]]));
  return indexed.ok ? saved : indexed;
}
export function loadGameFromSlot(storage: StorageLike, id: string): GameResult<SavedGame> | undefined {
  const key = namedSaveKey(id);
  if (!key) return { ok: false, error: 'セーブスロットが不正です。' };
  return loadGame(storage, [key]);
}
export function deleteSaveSlot(storage: StorageLike, id: string): GameResult<void> {
  if (!validSlotId(id)) return { ok: false, error: 'セーブスロットが不正です。' };
  if (reservedSlotId(id)) return writeStorageChanges(storage, new Map([[namedSaveKey(id)!, null]]));
  const index = recoverSlotIndex(storage);
  if (!index.some(entry => entry.id === id)) return { ok: false, error: 'セーブスロットが見つかりません。' };
  try {
    return writeStorageChanges(storage, new Map<string, string | null>([[slotKey(id), null], [SAVE_SLOT_INDEX_KEY, JSON.stringify(index.filter(entry => entry.id !== id))]]));
  } catch { return { ok: false, error: 'セーブスロットを削除できませんでした。' }; }
}

/** Counts this app's localStorage footprint, including scenarios, campaign state, sound settings, and saves. */
export function getStorageUsage(storage: StorageLike): StorageUsage {
  try {
    const keys: string[] = [];
    if (typeof storage.length === 'number' && storage.key) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith('ministr.')) keys.push(key);
      }
    } else keys.push(MANUAL_SAVE_KEY, AUTO_SAVE_KEY, SAVE_SLOT_INDEX_KEY, ...readSlotIndex(storage).map(entry => slotKey(entry.id)));
    const uniqueKeys = [...new Set(keys)];
    const bytes = uniqueKeys.reduce((total, key) => total + bytesOf(key) + bytesOf(storage.getItem(key) ?? ''), 0);
    return { bytes, itemCount: uniqueKeys.filter(key => storage.getItem(key) !== null).length, warning: bytes >= STORAGE_WARNING_BYTES };
  } catch { return { bytes: 0, itemCount: 0, warning: false }; }
}
