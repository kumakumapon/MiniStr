import type { unitDefinitions } from './units';
import type { ScenarioData } from './maps';

export type PlayerId = 'red' | 'blue';
export type UnitKind = keyof typeof unitDefinitions;
export const terrainKinds = ['plain', 'forest', 'road', 'mountain', 'swamp', 'sea', 'city', 'factory', 'airport', 'port', 'capital'] as const;
export type TerrainKind = (typeof terrainKinds)[number];
export const terrainKindSet: ReadonlySet<string> = new Set(terrainKinds);

export interface Position { x: number; y: number }

export interface Terrain {
  kind: TerrainKind;
  owner?: PlayerId;
  capturePoints?: number;
}

export interface Unit {
  id: string;
  kind: UnitKind;
  owner: PlayerId;
  /** Present only while this unit is deployed on the board. */
  position?: Position;
  /** ID of the transport carrying this unit. Embarked units have no position. */
  embarkedIn?: string;
  hp: number;
  fuel?: number;
  /** Remaining rounds, an integer from 0 to this kind's ammo capacity; absent means full. */
  ammo?: number;
  /** Secondary weapon rounds in rule v5; absent means a full secondary magazine. */
  secondaryAmmo?: number;
  hasMoved: boolean;
  hasActed: boolean;
  /** Combat experience (0-10). Present only in modern-rule games; absent means 0. */
  experience?: number;
}

export type DeployedUnit = Unit & { position: Position; embarkedIn?: undefined };

export function isDeployedUnit(unit: Unit): unit is DeployedUnit {
  return unit.position !== undefined && unit.embarkedIn === undefined;
}

export interface Board {
  width: number;
  height: number;
  terrain: Terrain[][];
}

export interface PlayerState { gold: number; income: number }

export interface GameState {
  board: Board;
  units: Unit[];
  /** Units that reached an authored exit in rule v6; kept for results and veterans. */
  evacuatedUnits?: Unit[];
  players: Record<PlayerId, PlayerState>;
  activePlayer: PlayerId;
  /** Completed full rounds, starting at 1 and advancing when blue hands play back to red. */
  turn: number;
  winner?: PlayerId;
  /** Optional for backwards-compatible save/replay loading. */
  scenarioId?: string;
  /** Immutable definition recorded at match creation (save/replay schema v4). */
  scenarioSnapshot?: ScenarioData;
  /** Scenario-defined score; absent values are treated as zero. */
  scores?: Partial<Record<PlayerId, number>>;
  /** Consecutive completed turns for each hold-condition key. */
  objectiveHoldTurns?: Partial<Record<PlayerId, Record<string, number>>>;
  /** State for the deterministic LCG consumed by commands that resolve random outcomes. */
  rngSeed: number;
  nextUnitId: number;
  /**
   * Rule set this match is played with. Absent means the classic rules that
   * saves and replays written before Phase 9 were recorded with; 2 is the
   * Phase 9 modern rules; 3 adds the unit limit and decision victory (#119);
   * 4 makes opening fuel upkeep equal, resolves score races after both turns,
   * and caps each army at 64 units; 5 adds a secondary weapon with independent
   * damage, range and ammunition; 6 adds escort/withdrawal objectives and evacuation.
   */
  ruleVersion?: RuleVersion;
}

/** Phase 9 rules: supply vehicles, paid repairs at compatible facilities, experience, and new units. */
export const MODERN_RULE_VERSION = 2 as const;
/** #119 rules: modern rules plus a per-side unit limit and a decision victory. */
export const DECISION_RULE_VERSION = 3 as const;
/** Equal opening fuel, round-end score races, and a force cap for large interactive boards. */
export const BALANCED_RULE_VERSION = 4 as const;
/** Up to two weapons with independent damage, range and magazines. */
export const DUAL_WEAPON_RULE_VERSION = 5 as const;
/** Escort/withdrawal objectives, explicit evacuation and coordinated CPU operations. */
export const OPERATIONS_RULE_VERSION = 6 as const;
/** Rule version assigned to newly started scenario matches. */
export const CURRENT_RULE_VERSION = OPERATIONS_RULE_VERSION;
export type RuleVersion = typeof MODERN_RULE_VERSION | typeof DECISION_RULE_VERSION | typeof BALANCED_RULE_VERSION | typeof DUAL_WEAPON_RULE_VERSION | typeof OPERATIONS_RULE_VERSION;
export const ruleVersions: readonly RuleVersion[] = [MODERN_RULE_VERSION, DECISION_RULE_VERSION, BALANCED_RULE_VERSION, DUAL_WEAPON_RULE_VERSION, OPERATIONS_RULE_VERSION];
export const usesOperationsRules = (state: Pick<GameState, 'ruleVersion'>): boolean => (state.ruleVersion ?? 0) >= OPERATIONS_RULE_VERSION;
export const usesDualWeapons = (state: Pick<GameState, 'ruleVersion'>): boolean => (state.ruleVersion ?? 0) >= DUAL_WEAPON_RULE_VERSION;

/** Modern features (supply vehicles, repairs, experience, new units) apply from rule version 2 on. */
export const usesModernRules = (state: Pick<GameState, 'ruleVersion'>): boolean => state.ruleVersion !== undefined;
/** The unit limit and decision victory apply from rule version 3 on. */
export const usesDecisionRules = (state: Pick<GameState, 'ruleVersion'>): boolean => state.ruleVersion !== undefined && state.ruleVersion >= DECISION_RULE_VERSION;

export type GameResult<T = GameState> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const otherPlayer = (player: PlayerId): PlayerId => player === 'red' ? 'blue' : 'red';
