import { createAsymmetricLayout, isAsymmetricSource } from './asymmetricBattlefield';
import { enterReservedArmy, fourArmyArrival, isCanonicalArrival, validArrivalProgress, withoutReserve } from './fourArmyArrival';
import { isExpandedBattle } from './smallBattle';
import { heldObjectiveOutcome, isFourArmyHoldProgress, updateFourArmyHold, type FourArmyHoldProgress } from './fourArmyObjective';
import { combatSummaryForCommand, type CombatSummary } from './combatSummary';
import {
  alliedArmies,
  battleOrder,
  matchTeams,
  fourArmyParticipants,
  fourArmyUnitLimit,
  isSmallBattle,
  smallBattleDecision,
  smallBattleMapShape,
  smallBattlePositionRank,
  type SmallBattle,
} from './smallBattle';
import { bridgeBanks } from './bridges';
import { fourArmyRuleProjection, initialFourArmyExtensions, isFourArmyRules, type FourArmyRules, type FourArmyExtensions, type FourArmyRuleObservation } from './fourArmyRules';
import { isGroundUnit } from './logistics';
import { validRepairReserve } from './logisticsOrders';
import { applyGameCommand, isGameCommand, isGameState, type GameCommand } from './session';
import { applyModernUpkeep } from './logistics';
import { canProduceUnit, isPropertyTerrainKind } from './facilities';
import { visibleEnemies, visiblePositions, observedEnemy } from './fog';
import { incomePropertyCount } from './state';
import { moveUnit } from './commands';
import { homePositionRank } from './homePositionRank';
import { movementCost, unitMovementCost, positionKey } from './terrain';
import { unitStats } from './units';
import { inFourArmyStartZone, isFourArmySetup, type FourArmySetup } from './fourArmySetup';
import {
  FOUR_ARMY_IDS,
  createFourArmyRound,
  finishFourArmyTurn,
  isFourArmyRound,
  resolveFourArmyEliminations,
  startFourArmyTurn,
  type FourArmyId,
  type FourArmyOutcome,
  type FourArmyRound,
} from './fourArmyFoundation';
import type { Board, GameResult, GameState, PlayerState, Position, Terrain, Unit } from './types';

export type FourArmyUnit = Omit<Unit, 'owner' | 'callsign' | 'submerged' | 'diveTurns'> & { owner: FourArmyId };
export type FourArmyTerrain = Omit<Terrain, 'owner'> & { owner?: FourArmyId };
export interface FourArmyMap {
  match?: SmallBattle;
  rules?: FourArmyRules;
  pathVersion?: 1 | 2 | 3;
  bridges?: { owner: FourArmyId; position: Position }[];
  id: string;
  board: Omit<Board, 'terrain'> & { terrain: FourArmyTerrain[][] };
  capitals: Record<FourArmyId, Position>;
  units: FourArmyUnit[];
  players: Record<FourArmyId, PlayerState>;
  order: FourArmyId[];
  seed: number;
  setup?: FourArmySetup;
}
export interface FourArmyState {
  arrivedAt?: number;
  objectiveHold?: FourArmyHoldProgress;
  match?: SmallBattle;
  decision?: { round: 15 | 20 | 21 };
  /** Omission preserves the absolute-coordinate path rule of existing recordings. */
  pathVersion?: 1 | 2 | 3;
  bridges?: { owner: FourArmyId; position: Position }[];
  /** v1 retains legacy checkpoints; v2 adds immutable setup and a per-army ceiling. Combat/logistics remain v12. */
  engineVersion: 1 | 2 | 3 | 4 | 5 | 6;
  rules?: FourArmyRules;
  extensions?: FourArmyExtensions;
  setup?: FourArmySetup;
  board: FourArmyMap['board'];
  capitals: FourArmyMap['capitals'];
  units: FourArmyUnit[];
  players: FourArmyMap['players'];
  round: FourArmyRound;
  alive: FourArmyId[];
  eliminations: { army: FourArmyId; round: number }[];
  outcome: FourArmyOutcome;
  rngSeed: number;
  nextUnitId: number;
  paused: boolean;
}
export interface FourArmyObservation {
  arrivedAt?: number;
  objectiveHold?: FourArmyHoldProgress;
  match?: SmallBattle;
  decision?: { round: 15 | 20 | 21 };
  bridges?: { owner: FourArmyId; position: Position }[];
  rules?: FourArmyRules;
  extensions?: FourArmyRuleObservation;
  unitLimitPerArmy?: number;
  viewer: FourArmyId;
  board: FourArmyMap['board'];
  capitals: FourArmyMap['capitals'];
  units: FourArmyUnit[];
  player: PlayerState;
  visible: Position[];
  round: FourArmyRound;
  alive: FourArmyId[];
  outcome: FourArmyOutcome;
}
type BasicCommand = Extract<
  GameCommand,
  {
    type:
      | 'move'
      | 'wait'
      | 'attack'
      | 'merge'
      | 'capture'
      | 'produce'
      | 'embark'
      | 'disembark'
      | 'endTurn'
      | 'fortify'
      | 'recon'
      | 'ambush'
      | 'logistics'
      | 'repairReserve'
      | 'bridge'
      | 'destroyBridge';
  }
>;
export type FourArmyCommand = (BasicCommand | { type: 'resume' }) & { actor: FourArmyId };
const commandTypes = [
  'move',
  'wait',
  'attack',
  'merge',
  'capture',
  'produce',
  'embark',
  'disembark',
  'endTurn',
  'resume',
  'fortify',
  'recon',
  'ambush',
  'logistics',
  'repairReserve',
  'bridge',
  'destroyBridge',
];
const fail = (error: string): GameResult<never> => ({ ok: false, error });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every((k) => Object.hasOwn(v, k)) && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const army = (v: unknown): v is FourArmyId => FOUR_ARMY_IDS.includes(v as FourArmyId);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
const position = (v: unknown): v is Position => record(v) && keys(v, ['x', 'y']) && integer(v.x, 0, 31) && integer(v.y, 0, 31);
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Ephemeral actor-only projection. Enemy armies NEVER share a stored identity or turn. */
function project(state: FourArmyState, actor: FourArmyId, coalition = false): GameState {
  const friendly = (owner: FourArmyId) => owner === actor || (coalition && alliedArmies(state.match, actor, owner));
  return {
    board: {
      ...state.board,
      terrain: state.board.terrain.map((row) => row.map((tile) => ({ ...tile, owner: tile.owner === undefined ? undefined : friendly(tile.owner) ? 'red' : 'blue' }))),
    },
    units: state.units.map((u) => ({ ...u, owner: friendly(u.owner) ? 'red' : 'blue' })),
    ...(state.bridges ? { bridges: state.bridges.map((b) => ({ ...b, owner: b.owner === actor ? ('red' as const) : ('blue' as const) })) } : {}),
    players: { red: { ...state.players[actor] }, blue: { gold: 0, income: 0 } },
    activePlayer: 'red',
    turn: state.round.round,
    rngSeed: state.rngSeed,
    nextUnitId: state.nextUnitId,
    ...fourArmyRuleProjection(
      state.rules,
      state.extensions
        ? {
            recon: {
              ...state.extensions.recon[actor],
              centers: state.round.phase === 'active' && state.round.order[state.round.index] === actor ? state.extensions.recon[actor].centers : [],
            },
            fortifications: state.extensions.fortifications,
            repairReserve: state.extensions.repairReserve[actor],
            weatherSeed: state.extensions.weatherSeed,
          }
        : undefined,
      actor,
    ),
    ...(coalition && state.extensions
      ? { fortifications: state.extensions.fortifications.map((f) => ({ ...f, owner: friendly(f.owner) ? ('red' as const) : ('blue' as const) })) }
      : {}),
  };
}

function restore(before: FourArmyState, next: GameState, actor: FourArmyId): FourArmyState {
  const owners = new Map(before.units.map((u) => [u.id, u.owner]));
  // Legacy victory/scores are intentionally discarded; only the four-army adjudicator decides results.
  return clean({
    ...before,
    board: {
      ...next.board,
      terrain: next.board.terrain.map((row, y) =>
        row.map((tile, x) => ({
          ...tile,
          owner:
            tile.owner === 'red'
              ? isExpandedBattle(before.match) && before.board.terrain[y]![x]!.owner && alliedArmies(before.match, actor, before.board.terrain[y]![x]!.owner!)
                ? before.board.terrain[y]![x]!.owner
                : actor
              : tile.owner === 'blue'
                ? before.board.terrain[y]![x]!.owner
                : undefined,
        })),
      ),
    },
    units: next.units.map((u) => ({ ...u, owner: owners.get(u.id) ?? actor })),
    ...(before.bridges
      ? { bridges: (next.bridges ?? []).map((b) => ({ ...b, owner: before.bridges!.find((old) => positionKey(old.position) === positionKey(b.position))?.owner ?? actor })) }
      : {}),
    players: { ...before.players, [actor]: next.players.red },
    ...(before.extensions
      ? {
          extensions: {
            ...before.extensions,
            recon: { ...before.extensions.recon, [actor]: { remaining: next.recon!.remaining.red, centers: next.recon!.centers } },
            repairReserve: { ...before.extensions.repairReserve, [actor]: next.repairReserve?.red ?? 0 },
            fortifications: (next.fortifications ?? []).map((site) => ({
              ...site,
              owner: before.extensions!.fortifications.find((old) => positionKey(old.position) === positionKey(site.position))?.owner ?? actor,
            })),
          },
        }
      : {}),
    rngSeed: next.rngSeed,
    nextUnitId: next.nextUnitId,
  });
}

function settle(state: FourArmyState): FourArmyState {
  const result = resolveFourArmyEliminations(
    {
      alive: state.alive,
      units: state.units.map((u) => ({ id: u.id, army: u.owner, ...(u.embarkedIn ? { carrierId: u.embarkedIn } : {}) })),
      facilities: state.board.terrain.flatMap((row, y) =>
        row.flatMap((tile, x) =>
          isPropertyTerrainKind(tile.kind)
            ? [
                {
                  id: `p${x}_${y}`,
                  ...(tile.owner ? { owner: tile.owner } : {}),
                  ...Object.fromEntries(
                    fourArmyParticipants(state)
                      .filter((a) => positionKey(state.capitals[a]) === `${x},${y}`)
                      .map((a) => ['capitalOf', a]),
                  ),
                },
              ]
            : [],
        ),
      ),
    },
    fourArmyParticipants(state),
    matchTeams(state.match),
  );
  if (!result.ok) throw new Error(result.error); // Internal invariant; public entrypoints validate first.
  const { battlefield, outcome } = result.value;
  const kept = new Set(battlefield.units.map((u) => u.id));
  const removed = state.units.filter((u) => !kept.has(u.id) && u.position).map((u) => positionKey(u.position!));
  const owners = new Map(battlefield.facilities.map((f) => [f.id, f.owner]));
  return clean(
    updateFourArmyHold({
      ...state,
      alive: battlefield.alive,
      ...(state.extensions
        ? { extensions: { ...state.extensions, fortifications: state.extensions.fortifications.filter((site) => battlefield.alive.includes(site.owner)) } }
        : {}),
      outcome,
      eliminations: [...state.eliminations, ...state.alive.filter((a) => !battlefield.alive.includes(a)).map((army) => ({ army, round: state.round.round }))],
      units: state.units.filter((u) => kept.has(u.id)),
      board: {
        ...state.board,
        terrain: state.board.terrain.map((row, y) =>
          row.map((tile, x) =>
            isPropertyTerrainKind(tile.kind) ? { ...tile, owner: owners.get(`p${x}_${y}`), ...(removed.includes(`${x},${y}`) ? { capturePoints: 20 } : {}) } : tile,
          ),
        ),
      },
    }),
  );
}

/** Advance atomically through a start-of-turn fuel death, including skipped slots and round boundaries. */
function startNext(state: FourArmyState): GameResult<FourArmyState> {
  let next = state;
  for (let n = 0; n < 4; n++) {
    if (next.outcome.type !== 'ongoing') return { ok: true, value: next };
    const start = startFourArmyTurn(next.round, next.alive, fourArmyParticipants(next));
    if (!start.ok) return start;
    if (!start.value.applyStart) return { ok: true, value: next };
    const actor = start.value.army;
    next = { ...next, round: start.value.round };
    let view = project(next, actor);
    const income = incomePropertyCount(view, 'red') * 1000;
    view = {
      ...view,
      units: view.units.map((u) => {
        if (u.owner !== 'red') return u;
        const next = { ...u, hasMoved: false, hasActed: false };
        if (state.rules) delete next.ambush;
        return next;
      }),
      players: { ...view.players, red: { gold: view.players.red.gold + income, income } },
    };
    view = applyModernUpkeep(view, 'red', start.value.consumeStandingFuel);
    const dead = new Set(view.units.filter((u) => u.owner === 'red' && u.position && unitStats[u.kind].fuelPerTurn > 0 && u.fuel === 0).map((u) => u.id));
    view = { ...view, units: view.units.filter((u) => !dead.has(u.id) && (!u.embarkedIn || !dead.has(u.embarkedIn))) };
    next = settle(restore(next, view, actor));
    if (next.outcome.type !== 'ongoing' || next.alive.includes(actor)) return { ok: true, value: next };
    const advanced = advance(next);
    if (!advanced.ok || advanced.value.paused) return advanced;
    next = advanced.value;
  }
  return fail('4軍の手番を開始できません。');
}

function advance(state: FourArmyState): GameResult<FourArmyState> {
  if (state.extensions) {
    const actor = state.round.order[state.round.index]!;
    state = { ...state, extensions: { ...state.extensions, recon: { ...state.extensions.recon, [actor]: { ...state.extensions.recon[actor], centers: [] } } } };
  }
  const finished = finishFourArmyTurn(state.round, state.alive, fourArmyParticipants(state));
  if (!finished.ok) return finished;
  if (isExpandedBattle(state.match) && finished.value.completedRound !== undefined) {
    const adjudication = state.match.ending === 'short' && finished.value.completedRound === state.match.roundLimit;
    const arrived = adjudication ? state : enterReservedArmy(state, finished.value.round.round);
    const order = battleOrder(state.match, finished.value.round.round, arrived.arrivedAt);
    state = arrived;
    finished.value.round = { ...finished.value.round, order, index: order.findIndex((a) => state.alive.includes(a)) };
  }
  if (finished.value.completedRound !== undefined) {
    const atBoundary = updateFourArmyHold({ ...state, round: finished.value.round }, true);
    const won = heldObjectiveOutcome(atBoundary);
    if (won) return { ok: true, value: { ...atBoundary, outcome: won, paused: false } };
    state = atBoundary;
  }
  if (state.match?.ending === 'short' && finished.value.completedRound === state.match.roundLimit) {
    const decided = { ...state, round: finished.value.round, paused: false, decision: { round: state.match.roundLimit! } };
    return { ok: true, value: { ...decided, outcome: smallBattleDecision(decided) } };
  }
  return { ok: true, value: { ...state, round: finished.value.round, paused: finished.value.completedRound !== undefined && finished.value.completedRound % 100 === 0 } };
}

export function isFourArmyState(value: unknown): value is FourArmyState {
  if (
    !record(value) ||
    !keys(
      value,
      ['engineVersion', 'board', 'capitals', 'units', 'players', 'round', 'alive', 'eliminations', 'outcome', 'rngSeed', 'nextUnitId', 'paused'],
      ['setup', 'pathVersion', 'rules', 'extensions', 'match', 'decision', 'bridges', 'objectiveHold', 'arrivedAt'],
    ) ||
    ![1, 2, 3, 4, 5, 6].includes(value.engineVersion as number)
  )
    return false;
  if (value.engineVersion === 4 || value.engineVersion === 5 || value.engineVersion === 6) {
    if (!isSmallBattle(value.match) || value.match.version !== Number(value.engineVersion) - 3) return false;
  } else if (Object.hasOwn(value, 'match') || Object.hasOwn(value, 'decision') || Object.hasOwn(value, 'bridges')) return false;
  const participants = isSmallBattle(value.match) ? value.match.participants : FOUR_ARMY_IDS;
  if (
    !record(value.board) ||
    !keys(value.board, ['width', 'height', 'terrain']) ||
    !integer(value.board.width, 2, 32) ||
    !integer(value.board.height, 2, 32) ||
    !Array.isArray(value.board.terrain) ||
    value.board.terrain.length !== value.board.height
  )
    return false;
  if (
    Object.hasOwn(value, 'pathVersion') &&
    (Number(value.engineVersion) >= 5
      ? value.pathVersion !== 3
      : value.engineVersion === 4
        ? value.pathVersion !== 2
        : value.pathVersion !== 1 || (value.engineVersion !== 2 && value.engineVersion !== 3) || value.board.width !== 32 || value.board.height !== 32)
  )
    return false;
  const playerData = value.players;
  const capitalData = value.capitals;
  const roundData = value.round;
  const aliveData = value.alive;
  if (
    !record(playerData) ||
    !keys(playerData, [...participants]) ||
    !participants.every((a) => {
      const p = playerData[a];
      return record(p) && keys(p, ['gold', 'income']) && integer(p.gold, 0, 1e12) && integer(p.income, 0, 1_024_000);
    })
  )
    return false;
  if (!record(capitalData) || !keys(capitalData, [...participants]) || !participants.every((a) => position(capitalData[a]))) return false;
  if (new Set(Object.values(capitalData).map((p) => positionKey(p as Position))).size !== participants.length) return false;
  if (
    value.engineVersion === 1
      ? Object.hasOwn(value, 'setup')
      : !isFourArmySetup(value.setup, value.board as unknown as FourArmyMap['board'], capitalData as FourArmyMap['capitals'], participants)
  )
    return false;
  if (
    !isFourArmyRound(roundData, participants) ||
    !integer(roundData.round, 1, 1_000_000) ||
    typeof value.paused !== 'boolean' ||
    !integer(value.rngSeed, 0, 0xffff_ffff) ||
    !integer(value.nextUnitId, 1, 1e9)
  )
    return false;
  if (!Array.isArray(aliveData) || aliveData.length > 4 || !aliveData.every((a) => army(a) && participants.includes(a)) || new Set(aliveData).size !== aliveData.length)
    return false;
  const s = value as unknown as FourArmyState;
  const pending = fourArmyArrival(s.match)?.army;
  const awaiting = pending !== undefined && s.arrivedAt === undefined;
  if (!validArrivalProgress(s) || (awaiting && (s.players[pending].gold !== 0 || s.players[pending].income !== 0))) return false;
  if (
    !Array.isArray(value.eliminations) ||
    value.eliminations.length !== participants.length - aliveData.length - Number(awaiting) ||
    !value.eliminations.every(
      (e) =>
        record(e) &&
        keys(e, ['army', 'round']) &&
        army(e.army) &&
        participants.includes(e.army) &&
        !aliveData.includes(e.army) &&
        (!awaiting || e.army !== pending) &&
        integer(e.round, 1, roundData.round),
    ) ||
    new Set(value.eliminations.map((e) => e.army)).size !== value.eliminations.length
  )
    return false;
  if (s.engineVersion === 4 && (!s.match || s.pathVersion !== 2 || s.board.width !== 18 || s.board.height !== 14)) return false;
  if (s.engineVersion >= 5) {
    if (
      !isExpandedBattle(s.match) ||
      s.pathVersion !== 3 ||
      s.board.width !== (s.match.sourceMapId === 'frontier' ? 32 : s.match.sourceMapId === 'strait' ? 17 : 18) ||
      s.board.height !== (s.match.sourceMapId === 'frontier' ? 32 : s.match.sourceMapId === 'strait' ? 15 : 14) ||
      JSON.stringify(s.round.order) !== JSON.stringify(battleOrder(s.match, s.round.round, s.arrivedAt))
    )
      return false;
  } else if (Object.hasOwn(s, 'bridges')) return false;
  if (
    !s.board.terrain.every(
      (row) =>
        Array.isArray(row) &&
        row.length === s.board.width &&
        row.every(
          (t) =>
            record(t) && keys(t, ['kind'], ['owner', 'capturePoints']) && (t.owner === undefined || (army(t.owner) && s.alive.includes(t.owner) && isPropertyTerrainKind(t.kind))),
        ),
    )
  )
    return false;
  if (s.engineVersion >= 5) {
    if (
      !Array.isArray(s.bridges) ||
      s.bridges.length > 8 ||
      !s.bridges.every(
        (b) =>
          record(b) &&
          keys(b, ['owner', 'position']) &&
          participants.includes(b.owner as FourArmyId) &&
          position(b.position) &&
          bridgeBanks({ ...s.board, terrain: s.board.terrain.map((row) => row.map((t) => ({ kind: t.kind }))) }, b.position).length > 0,
      ) ||
      new Set(s.bridges.map((b) => positionKey(b.position))).size !== s.bridges.length ||
      participants.some((a) => s.bridges!.filter((b) => b.owner === a).length > 2)
    )
      return false;
  }
  if (
    s.board.terrain.flat().filter((t) => t.kind === 'capital').length !== participants.length ||
    !participants.every((a) => s.board.terrain[s.capitals[a].y]?.[s.capitals[a].x]?.kind === 'capital')
  )
    return false;
  if (
    !Array.isArray(s.units) ||
    s.units.length > 128 ||
    !s.units.every(record) ||
    !s.units.every(
      (u) =>
        record(u) &&
        keys(
          u,
          ['id', 'kind', 'owner', 'hp', 'hasMoved', 'hasActed'],
          [
            'position',
            'embarkedIn',
            'fuel',
            'ammo',
            'secondaryAmmo',
            'supplyStock',
            'experience',
            ...(value.engineVersion === 3 || ((value.engineVersion === 4 || Number(value.engineVersion) >= 5) && value.rules) ? ['ambush', 'logistics'] : []),
          ],
        ) &&
        id(u.id) &&
        integer(u.hp, 1, 100) &&
        (u.fuel === undefined || integer(u.fuel, 0, 1000)) &&
        army(u.owner) &&
        s.alive.includes(u.owner) &&
        (!u.position || position(u.position)) &&
        (!u.embarkedIn || s.units.some((c) => c.id === u.embarkedIn && c.owner === u.owner)) &&
        (!/^u[0-9]+$/.test(u.id) || Number(u.id.slice(1)) < s.nextUnitId),
    )
  )
    return false;
  if (s.setup && FOUR_ARMY_IDS.some((a) => s.units.filter((u) => u.owner === a).length > fourArmyUnitLimit(s.match, s.setup!.unitLimitPerArmy, a))) return false;
  if (
    s.engineVersion === 3 || ((s.engineVersion === 4 || s.engineVersion >= 5) && s.rules)
      ? !validFourArmyExtensions(s)
      : Object.hasOwn(s, 'rules') || Object.hasOwn(s, 'extensions')
  )
    return false;
  const validationView = project(s, participants[0]!);
  // The legacy validator caps two armies' fortifications; the real four-army bounds are checked above.
  if (!isGameState({ ...validationView, fortifications: undefined, bridges: undefined })) return false;
  if (s.units.some((u) => u.fuel !== undefined && u.fuel > unitStats[u.kind].fuel)) return false;
  if (
    s.units.some(
      (u) => u.position && !Number.isFinite(s.engineVersion >= 5 ? unitMovementCost(validationView, u.position, u.kind) : movementCost(validationView.board, u.position, u.kind)),
    )
  )
    return false;
  const resolved = resolveFourArmyEliminations(
    {
      alive: s.alive,
      units: s.units.map((u) => ({ id: u.id, army: u.owner, ...(u.embarkedIn ? { carrierId: u.embarkedIn } : {}) })),
      facilities: participants.map((a) => ({
        id: a,
        capitalOf: a,
        ...(s.board.terrain[s.capitals[a].y]![s.capitals[a].x]!.owner ? { owner: s.board.terrain[s.capitals[a].y]![s.capitals[a].x]!.owner } : {}),
      })),
    },
    participants,
    matchTeams(s.match),
  );
  const deadline =
    s.match?.ending === 'short' &&
    s.round.round === s.match.roundLimit! + 1 &&
    s.round.phase === 'pending' &&
    !s.paused &&
    s.alive.length >= 2 &&
    s.decision?.round === s.match.roundLimit &&
    Object.keys(s.decision!).join() === 'round';
  if (!isFourArmyHoldProgress(s) || (s.decision && !deadline)) return false;
  const held = heldObjectiveOutcome(s);
  if (s.decision && held) return false;
  if (deadline && s.match?.sourceMapId === 'tundra' && (!resolved.ok || resolved.value.outcome.type !== 'ongoing')) return false;
  if (s.match?.ending === 'short' && (s.round.round > s.match.roundLimit! + 1 || (s.round.round === s.match.roundLimit! + 1 && !deadline && !held))) return false;
  const expectedOutcome = held ?? (deadline ? smallBattleDecision(s) : resolved.ok ? resolved.value.outcome : undefined);
  if (
    !resolved.ok ||
    resolved.value.battlefield.alive.length !== s.alive.length ||
    !record(s.outcome) ||
    !keys(s.outcome, s.outcome.type === 'victory' ? ['type', 'winner'] : ['type']) ||
    expectedOutcome?.type !== s.outcome.type ||
    (expectedOutcome?.type === 'victory' && (s.outcome.type !== 'victory' || expectedOutcome.winner !== s.outcome.winner))
  )
    return false;
  return (
    s.outcome.type !== 'ongoing' ||
    (s.alive.includes(s.round.order[s.round.index]!) &&
      (s.round.phase === 'active' || s.paused) &&
      (!s.paused || (s.round.phase === 'pending' && s.round.round > 1 && (s.round.round - 1) % 100 === 0)))
  );
}

export function isFourArmyCommand(v: unknown): v is FourArmyCommand {
  if (!record(v) || !army(v.actor) || typeof v.type !== 'string' || !commandTypes.includes(v.type)) return false;
  const c = { ...v };
  delete c.actor;
  const fields: Record<string, string[]> = {
    move: ['unitId', 'destination'],
    wait: ['unitId'],
    attack: ['unitId', 'targetId'],
    merge: ['unitId', 'targetId'],
    capture: ['unitId'],
    produce: ['factory', 'kind'],
    embark: ['unitId', 'transportId'],
    disembark: ['transportId', 'destination'],
    endTurn: [],
    resume: [],
    fortify: ['unitId'],
    recon: ['center'],
    ambush: ['unitId'],
    logistics: ['unitId', 'order'],
    repairReserve: ['amount'],
    bridge: ['unitId', 'destination'],
    destroyBridge: ['unitId', 'destination'],
  };
  if (!keys(c, ['type', ...fields[String(c.type)]!], c.type === 'attack' || c.type === 'ambush' ? ['weaponSlot'] : [])) return false;
  if (['unitId', 'targetId', 'transportId'].some((k) => k in c && !id(c[k]))) return false;
  if (('destination' in c && !position(c.destination)) || ('factory' in c && !position(c.factory)) || ('center' in c && !position(c.center))) return false;
  return c.type === 'resume' || isGameCommand(c);
}

export function createFourArmyState(input: unknown): GameResult<FourArmyState> {
  if (!record(input) || !keys(input, ['id', 'board', 'capitals', 'units', 'players', 'order', 'seed'], ['setup', 'pathVersion', 'rules', 'match', 'bridges']) || !id(input.id))
    return fail('4軍マップが不正です。');
  if (Object.hasOwn(input, 'rules') && (!isFourArmyRules(input.rules) || !Object.hasOwn(input, 'setup'))) return fail('4軍の規則が不正です。');
  const map = input as unknown as FourArmyMap;
  if (!Array.isArray(map.units) || map.units.length > 128) return fail('4軍の部隊数が不正です。');
  if (Object.hasOwn(input, 'match') && !smallBattleMapShape(map)) return fail('小型マップの契約が不正です。');
  if (Object.hasOwn(input, 'bridges') && !isExpandedBattle(map.match)) return fail('従来の対局に橋は追加できません。');
  const participants = fourArmyParticipants(map);
  const reserve = fourArmyArrival(map.match);
  if (
    reserve &&
    isExpandedBattle(map.match) &&
    isAsymmetricSource(map.match.sourceMapId) &&
    !isCanonicalArrival(map, createAsymmetricLayout(map.match.sourceMapId, map.match, map.seed, map.rules))
  )
    return fail('参入予約の初期盤面が不正です。');
  const order = reserve && isExpandedBattle(map.match) ? battleOrder(map.match, 1) : map.order;
  const alive = reserve ? participants.filter((a) => a !== reserve.army) : [...participants];
  const round = createFourArmyRound(order, participants);
  const materialized = withoutReserve(map);
  if (!round.ok) return round;
  const numericIds = Array.isArray(map.units) ? map.units.filter((u) => record(u) && typeof u.id === 'string' && /^u[0-9]+$/.test(u.id)).map((u) => Number(u.id.slice(1))) : [];
  const initial = {
    ...(Object.hasOwn(input, 'pathVersion') ? { pathVersion: input.pathVersion } : {}),
    ...(map.match ? { match: map.match } : {}),
    ...(isExpandedBattle(map.match) ? { bridges: map.bridges ?? [] } : {}),
    engineVersion: isExpandedBattle(map.match) ? (reserve ? 6 : 5) : map.match ? 4 : map.rules ? 3 : Object.hasOwn(input, 'setup') ? 2 : 1,
    ...(map.rules ? { rules: map.rules, extensions: initialFourArmyExtensions(map.seed, participants) } : {}),
    ...(Object.hasOwn(input, 'setup') ? { setup: map.setup } : {}),
    board: materialized.board,
    capitals: map.capitals,
    units: materialized.units,
    players: materialized.players,
    round: { ...round.value, phase: 'active', startedArmies: [round.value.order[0]!] },
    alive,
    eliminations: [],
    outcome: { type: 'ongoing' },
    rngSeed: map.seed,
    nextUnitId: Math.max(0, ...numericIds) + 1,
    paused: false,
  };
  const prepared = updateFourArmyHold(initial as FourArmyState);
  if (
    !isFourArmyState(prepared) ||
    initial.units.some((u) => u.hasMoved || u.hasActed) ||
    (initial.setup &&
      initial.units.some((u) => !inFourArmyStartZone((u.position ?? initial.units.find((c) => c.id === u.embarkedIn)!.position)!, initial.setup!.startZones[u.owner]))) ||
    !alive.every((a) => initial.board.terrain[initial.capitals[a].y]![initial.capitals[a].x]!.owner === a)
  )
    return fail('4軍の初期盤面が不正です。');
  const started = startNext({ ...clean(prepared), round: round.value });
  return started.ok && !isFourArmyState(started.value) ? fail('4軍の初期状態上限を超えました。') : started;
}

/** Runtime boundary for actor-tagged commands. Failed commands leave the original state untouched. */
export function applyFourArmyCommand(input: unknown, command: unknown): GameResult<FourArmyState> {
  return resolveFourArmyCommand(input, command, false);
}
/** Transient resolved combat for presentation; never part of a state, save or observation. */
export function applyFourArmyCommandWithCombat(input: unknown, command: unknown): GameResult<FourArmyState> & { combat?: CombatSummary<FourArmyId> } {
  return resolveFourArmyCommand(input, command, true);
}
function resolveFourArmyCommand(input: unknown, command: unknown, includeCombat: boolean): GameResult<FourArmyState> & { combat?: CombatSummary<FourArmyId> } {
  if (!isFourArmyState(input) || !isFourArmyCommand(command)) return fail('4軍の状態または命令が不正です。');
  if (!input.rules && ['fortify', 'recon', 'ambush', 'logistics', 'repairReserve'].includes(command.type)) return fail('この対局の規則では使えない命令です。');
  if (['bridge', 'destroyBridge'].includes(command.type) && input.engineVersion < 5) return fail('この対局では架橋操作を使えません。');
  if (input.outcome.type !== 'ongoing') return fail('対局は終了しています。');
  if (command.actor !== input.round.order[input.round.index]) return fail('行動中の軍ではありません。');
  if (command.type === 'resume') return input.paused ? startNext({ ...structuredClone(input), paused: false }) : fail('一時停止していません。');
  if (input.paused) return fail('観戦を再開してください。');
  let next: GameResult<FourArmyState>;
  let combat: CombatSummary<FourArmyId> | undefined;
  if (command.type === 'endTurn') {
    const ended = advance(input);
    next = ended.ok && !ended.value.paused ? startNext(ended.value) : ended;
  } else {
    if (
      command.type === 'produce' &&
      (input.units.length >= 128 ||
        (input.setup && input.units.filter((u) => u.owner === command.actor).length >= fourArmyUnitLimit(input.match, input.setup.unitLimitPerArmy, command.actor)) ||
        !canProduceUnit(input.board.terrain[command.factory.y]?.[command.factory.x]?.kind ?? 'plain', command.kind, 'facility-v2', input.rules ? 14 : 12))
    )
      return fail('対応する生産施設または部隊枠が必要です。');
    const { actor, ...legacy } = command;
    if (input.engineVersion >= 5) {
      for (const key of ['unitId', 'transportId', ...(command.type === 'merge' ? ['targetId'] : [])]) {
        const value = (command as unknown as Record<string, unknown>)[key];
        if (value !== undefined && !input.units.some((u) => u.id === value && u.owner === actor)) return fail('自軍の部隊を指定してください。');
      }
      if (command.type === 'produce' && input.board.terrain[command.factory.y]?.[command.factory.x]?.owner !== actor) return fail('自軍の施設を指定してください。');
    }
    const view = project(input, actor, input.engineVersion >= 5 && command.type !== 'produce' && command.type !== 'fortify');
    const changed =
      command.type === 'move' && input.pathVersion !== undefined
        ? moveUnit(view, command.unitId, command.destination, (a, b) =>
            input.pathVersion === 2 || input.pathVersion === 3
              ? smallBattlePositionRank(input.board, input.capitals[actor], a, input.match?.participants.length === 3) -
                smallBattlePositionRank(input.board, input.capitals[actor], b, input.match?.participants.length === 3)
              : homePositionRank(input.capitals[actor], a) - homePositionRank(input.capitals[actor], b),
          )
        : applyGameCommand(view, legacy);
    if (!changed.ok) return changed;
    if (includeCombat && (command.type === 'attack' || command.type === 'move')) {
      const summary = combatSummaryForCommand(view, legacy, changed.value);
      const event = changed.value.tactics?.lastCombat;
      const attackerId = event?.attackerId ?? (command.type === 'attack' ? command.unitId : undefined);
      const defenderId = event?.defenderId ?? (command.type === 'attack' ? command.targetId : undefined);
      const attacker = input.units.find((u) => u.id === attackerId);
      const defender = input.units.find((u) => u.id === defenderId);
      if (summary && attacker && defender)
        combat = {
          ...summary,
          attacker: { ...summary.attacker, unitId: attacker.id, owner: attacker.owner },
          defender: { ...summary.defender, unitId: defender.id, owner: defender.owner },
        };
    }
    const settled = settle(restore(input, changed.value, actor));
    next =
      settled.outcome.type === 'ongoing' && !settled.alive.includes(actor)
        ? (() => {
            const a = advance(settled);
            return a.ok && !a.value.paused ? startNext(a.value) : a;
          })()
        : { ok: true, value: settled };
  }
  if (next.ok && !isFourArmyState(next.value)) return fail('4軍の状態上限を超えました。');
  return next.ok && combat ? { ...next, combat } : next;
}

/** Observations omit hidden contacts, enemy funds/cargo/logistics, and the combat RNG stream. */
export function observeFourArmy(input: unknown, viewer: FourArmyId): GameResult<FourArmyObservation> {
  if (!isFourArmyState(input) || !fourArmyParticipants(input).includes(viewer)) return fail('4軍の視点が不正です。');
  const view = project(input, viewer, isExpandedBattle(input.match));
  const contacts = new Set(visibleEnemies(view, 'red').map((u) => u.id));
  const visible = visiblePositions(view, 'red');
  const seen = new Set(visible.map(positionKey));
  return {
    ok: true,
    value: clean({
      viewer,
      ...(input.bridges ? { bridges: input.bridges } : {}),
      ...(input.match ? { match: input.match } : {}),
      ...(input.decision ? { decision: input.decision } : {}),
      ...(input.objectiveHold ? { objectiveHold: input.objectiveHold } : {}),
      ...(input.arrivedAt === undefined ? {} : { arrivedAt: input.arrivedAt }),
      ...(input.rules && input.extensions
        ? {
            rules: input.rules,
            extensions: {
              recon: {
                ...input.extensions.recon[viewer],
                centers: input.round.phase === 'active' && input.round.order[input.round.index] === viewer ? input.extensions.recon[viewer].centers : [],
              },
              fortifications: input.extensions.fortifications.filter((site) => alliedArmies(input.match, viewer, site.owner) || seen.has(positionKey(site.position))),
              repairReserve: input.extensions.repairReserve[viewer],
              weatherSeed: input.extensions.weatherSeed,
            },
          }
        : {}),
      ...(input.setup ? { unitLimitPerArmy: input.setup.unitLimitPerArmy } : {}),
      board: {
        ...input.board,
        terrain: input.board.terrain.map((row, y) => row.map((tile, x) => (!seen.has(`${x},${y}`) && tile.capturePoints !== undefined ? { ...tile, capturePoints: 20 } : tile))),
      },
      capitals: input.capitals,
      units: input.units
        .filter((u) => alliedArmies(input.match, viewer, u.owner) || contacts.has(u.id))
        .map((u) => (alliedArmies(input.match, viewer, u.owner) ? u : { ...observedEnemy({ ...u, owner: 'blue' }), owner: u.owner })),
      player: input.players[viewer],
      visible,
      round: input.round,
      alive: input.alive,
      outcome: input.outcome,
    }),
  };
}

function validFourArmyExtensions(s: FourArmyState): boolean {
  if (!isFourArmyRules(s.rules) || !record(s.extensions) || !keys(s.extensions, ['recon', 'fortifications', 'repairReserve', 'weatherSeed'])) return false;
  const e = s.extensions;
  const participants = fourArmyParticipants(s);
  if (
    !integer(e.weatherSeed, 0, 0xffffffff) ||
    !record(e.recon) ||
    !keys(e.recon, [...participants]) ||
    !record(e.repairReserve) ||
    !keys(e.repairReserve, [...participants]) ||
    !participants.every((a) => validRepairReserve(e.repairReserve[a]))
  )
    return false;
  if (
    !participants.every((a) => {
      const r = e.recon[a];
      return (
        record(r) &&
        keys(r, ['remaining', 'centers']) &&
        integer(r.remaining, 0, 2) &&
        Array.isArray(r.centers) &&
        r.centers.length <= 2 - r.remaining &&
        r.centers.every((p) => position(p) && p.x < s.board.width && p.y < s.board.height) &&
        new Set(r.centers.map(positionKey)).size === r.centers.length &&
        ((a === s.round.order[s.round.index] && s.round.phase === 'active') || r.centers.length === 0)
      );
    })
  )
    return false;
  if (!Array.isArray(e.fortifications) || e.fortifications.length > 16) return false;
  const sites = new Set<string>();
  const counts = Object.fromEntries(FOUR_ARMY_IDS.map((a) => [a, 0])) as Record<FourArmyId, number>;
  return e.fortifications.every((site) => {
    if (
      !record(site) ||
      !keys(site, ['owner', 'position']) ||
      !army(site.owner) ||
      !s.alive.includes(site.owner) ||
      !position(site.position) ||
      s.board.terrain[site.position.y]?.[site.position.x]?.kind !== 'plain' ||
      ++counts[site.owner] > 4 ||
      sites.has(positionKey(site.position))
    )
      return false;
    sites.add(positionKey(site.position));
    return !s.units.some(
      (u) =>
        !alliedArmies(s.match, u.owner, site.owner) &&
        u.position &&
        Object.hasOwn(unitStats, u.kind) &&
        isGroundUnit(u.kind) &&
        positionKey(u.position) === positionKey(site.position),
    );
  });
}
