import { forecastCombat, terrainDefenseReduction } from '../game/combat';
import { observeLogistics } from '../game/fog';
import { reachablePositionsForPlayer } from '../game/commands';
import { canProduceUnit, isPropertyTerrainKind, productionKindsForRule, unitLimit } from '../game/facilities';
import { visibleEnemies as getVisibleEnemies } from '../game/fog';
import { scenarioForState } from '../game/maps';
import { manhattanDistance, movementCost, terrainAt } from '../game/terrain';
import { isDeployedUnit, usesDecisionRules, usesModernRules, type Board, type DeployedUnit, type GameState, type PlayerId, type Position, type Unit, type UnitKind } from '../game/types';
import { adjacentToSupplyUnit, isGroundUnit, isServiceTile, REPAIR_HP_PER_TURN } from '../game/logistics';
import { isEmbarkableUnit, isMergeableUnit, isSupplyUnit, unitCategory, unitStats } from '../game/units';

/** The CPU does not use hidden randomness: the same state always gives the same order. */
export type CpuDifficulty = 'easy' | 'normal' | 'hard';

export interface CpuDifficultyConfig {
  /** Extra damage, over expected counter-damage, required before taking a non-lethal attack. */
  attackSafetyMargin: number;
  /** Whether a capital is preferred over other enemy objectives when moving. */
  prioritizeCapital: boolean;
  /** Multiplier for projected damage from visible enemy counterattacks. */
  threatAvoidanceWeight: number;
  /** Multiplier for the defensive value of destination terrain. */
  terrainDefenseWeight: number;
  /** Cost per tile remaining to an objective. */
  objectiveDistanceWeight: number;
  /** Extra preference for cover and safety when the unit is damaged. */
  lowHpRetreatWeight: number;
  /** Share of the CPU force limit this difficulty fields; the difficulty handicap. */
  forceLimitScale: number;
  /** How much move-then-attack planning (#122) this difficulty uses. */
  strikePlanning: StrikePlanning;
}

/**
 * - 'none': units only attack what they happen to end next to.
 * - 'lethal': units move to deliver finishing blows (and to stop captures).
 * - 'full': units also move for any favorable trade.
 */
export type StrikePlanning = 'none' | 'lethal' | 'full';

/**
 * Every difficulty uses the same decision weights: in CPU-versus-CPU
 * measurements (#119) these objective-driven weights beat every more cautious
 * variant, and weight differences alone produced unstable, even inverted,
 * difficulty orders. Difficulty is the size of the force the CPU fields
 * (easy and normal stop producing well below hard) and, since #122, how much
 * move-then-attack planning it uses (`strikePlanning`), the one decision
 * improvement that measurably wins for the side that has it.
 */
const sharedCpuWeights = {
  attackSafetyMargin: 20, prioritizeCapital: true, threatAvoidanceWeight: 0.35, terrainDefenseWeight: 0.5, objectiveDistanceWeight: 8, lowHpRetreatWeight: 0.25,
} as const;

export const cpuDifficultyConfig: Record<CpuDifficulty, CpuDifficultyConfig> = {
  easy: { ...sharedCpuWeights, forceLimitScale: 0.45, strikePlanning: 'none' },
  normal: { ...sharedCpuWeights, forceLimitScale: 0.7, strikePlanning: 'lethal' },
  hard: { ...sharedCpuWeights, forceLimitScale: 1, strikePlanning: 'full' },
};

/** A handicapped CPU still fields at least this many units. */
export const MIN_CPU_FORCE = 4;

export type CpuAction =
  | { type: 'capture'; unitId: string }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'merge'; unitId: string; targetId: string }
  | { type: 'produce'; factory: Position; kind: UnitKind }
  | { type: 'move'; unitId: string; destination: Position }
  | { type: 'wait'; unitId: string }
  | { type: 'embark'; unitId: string; transportId: string }
  | { type: 'disembark'; transportId: string; destination: Position }
  | { type: 'endTurn' };

/** Derived information shared by every decision stage within one CPU order. */
export interface CpuPlanningContext {
  visibleEnemies: readonly Unit[];
  targets: readonly Position[];
  /** Immutable terrain topology, shared by every transport/production choice. */
  landComponents: ReadonlyMap<string, number>;
}

type StandardProductionKind = Extract<UnitKind, 'infantry' | 'tank' | 'artillery'>;
const standardProductionKinds: readonly StandardProductionKind[] = ['infantry', 'tank', 'artillery'];

function orderedUnits(state: GameState, player: PlayerId): DeployedUnit[] {
  return state.units.filter((unit): unit is DeployedUnit => unit.owner === player && isDeployedUnit(unit)).sort((a, b) => a.id.localeCompare(b.id));
}

function canCapture(state: GameState, unit: DeployedUnit): boolean {
  const tile = terrainAt(state.board, unit.position);
  return !unit.hasActed && unitStats[unit.kind].capturePower > 0 && !!tile && isPropertyTerrainKind(tile.kind) && tile.owner !== unit.owner;
}

function favorableAttack(state: GameState, attacker: DeployedUnit, target: Unit, config: CpuDifficultyConfig): boolean {
  const result = forecastCombat(state, attacker, target);
  // Hard difficulty accepts more retaliation risk, never an attack that cannot
  // damage its target. This also keeps the AI safe if future unit matchups have
  // a zero damage multiplier.
  if (!result.ok || result.value.damageToDefender <= 0) return false;
  // A certain destruction is always worthwhile. Otherwise difficulty controls accepted risk.
  // Long stalemates and sieges may accept extra retaliation, but never more than
  // MAX_ATTACK_LENIENCY in total, so leniencies cannot stack into suicide attacks.
  const leniency = Math.min(MAX_ATTACK_LENIENCY,
    stalemateRelief(state) * 25 + garrisonAllowance(state, attacker, target, result.value.damageToDefender, result.value.damageToAttacker));
  return result.value.outgoing.min >= target.hp
    || result.value.damageToDefender >= result.value.damageToAttacker + config.attackSafetyMargin - leniency;
}

/** Upper bound on the extra retaliation any leniency may accept. */
export const MAX_ATTACK_LENIENCY = 30;

/**
 * A defender on a property we need to capture heals and hides behind high cover,
 * so an even trade never looks favorable and sieges stall forever. Accept worse
 * trades to dislodge such garrisons, but only when the hit outpaces the garrison's
 * per-turn healing, costs less than twice what it deals, and one of our capturing
 * units is close enough to follow up;
 * otherwise the attacks would only feed units into a garrison that heals back.
 */
function garrisonAllowance(state: GameState, attacker: DeployedUnit, target: Unit, damage: number, counter: number): number {
  // The hit must make net progress against healing and cost less than twice what it deals.
  if (!isDeployedUnit(target) || damage <= REPAIR_HP_PER_TURN || damage * 2 <= counter) return 0;
  const tile = terrainAt(state.board, target.position);
  if (!tile || !isPropertyTerrainKind(tile.kind) || tile.owner === attacker.owner) return 0;
  const capturerNearby = orderedUnits(state, attacker.owner)
    .some(ally => unitStats[ally.kind].capturePower > 0 && manhattanDistance(ally.position, target.position) <= 3);
  if (!capturerNearby) return 0;
  return tile.kind === 'capital' ? 30 : 15;
}

function interruptsCapture(state: GameState, player: PlayerId, target: Unit): boolean {
  if (!isDeployedUnit(target) || unitStats[target.kind].capturePower <= 0) return false;
  const terrain = terrainAt(state.board, target.position);
  return !!terrain && isPropertyTerrainKind(terrain.kind) && terrain.owner === player && (terrain.capturePoints ?? 20) < 20;
}

function attackAction(state: GameState, player: PlayerId, config: CpuDifficultyConfig, visibleTargets: readonly Unit[]): CpuAction | undefined {
  for (const attacker of orderedUnits(state, player)) {
    if (attacker.hasActed || (unitStats[attacker.kind].indirect && attacker.hasMoved)) continue;
    const target = visibleTargets
      .filter(unit => favorableAttack(state, attacker, unit, config))
      .sort((a, b) => {
        const aForecast = forecastCombat(state, attacker, a);
        const bForecast = forecastCombat(state, attacker, b);
        const aScore = aForecast.ok ? aForecast.value.damageToDefender - aForecast.value.damageToAttacker : -Infinity;
        const bScore = bForecast.ok ? bForecast.value.damageToDefender - bForecast.value.damageToAttacker : -Infinity;
        const interruption = Number(interruptsCapture(state, player, b)) - Number(interruptsCapture(state, player, a));
        // Focus fire: finishing a unit removes its future attacks, so certain kills come first.
        const lethal = Number(bForecast.ok && bForecast.value.outgoing.min >= b.hp) - Number(aForecast.ok && aForecast.value.outgoing.min >= a.hp);
        return interruption || lethal || bScore - aScore || a.hp - b.hp || a.id.localeCompare(b.id);
      })[0];
    if (target) return { type: 'attack', unitId: attacker.id, targetId: target.id };
  }
  return undefined;
}

function preferredProduction(state: GameState, player: PlayerId): UnitKind | undefined {
  const gold = state.players[player].gold;
  const counts: Record<StandardProductionKind, number> = { infantry: 0, tank: 0, artillery: 0 };
  for (const unit of state.units) if (unit.owner === player && unit.kind in counts) counts[unit.kind as StandardProductionKind] += 1;
  // Fill the requested 2:2:1 force mix before starting the next batch.
  const weights: Record<StandardProductionKind, number> = { infantry: 2, tank: 2, artillery: 1 };
  return standardProductionKinds
    .filter(kind => unitStats[kind].cost <= gold)
    .sort((a, b) => (weights[b] - counts[b]) - (weights[a] - counts[a]) || unitStats[a].cost - unitStats[b].cost)[0];
}

/** Returns occupancy confirmed by the CPU's current observation, never hidden enemies. */
function knownUnitAt(state: GameState, player: PlayerId, position: Position, visibleEnemies: readonly Unit[]): boolean {
  return state.units.some(unit => isDeployedUnit(unit) && unit.position.x === position.x && unit.position.y === position.y
    && (unit.owner === player || visibleEnemies.some(enemy => enemy.id === unit.id)));
}

function emptyOwnedFacility(state: GameState, player: PlayerId, kind: UnitKind): Position | undefined {
  for (let y = 0; y < state.board.height; y += 1) for (let x = 0; x < state.board.width; x += 1) {
    const position = { x, y };
    const tile = terrainAt(state.board, position);
    // Whether one of our facilities is occupied is observable even through fog:
    // the command layer must reject production at every occupied tile. Do not
    // use the fog-limited `knownUnitAt` here, or a hidden enemy can make CPU
    // choose a guaranteed-invalid produce command.
    const occupied = state.units.some(unit => isDeployedUnit(unit)
      && unit.position.x === position.x && unit.position.y === position.y);
    if (tile?.owner === player && !occupied) {
      const productionRule = scenarioForState(state)?.productionRules ?? 'legacy-factory-air';
      if (canProduceUnit(tile.kind, kind, productionRule, state.ruleVersion)) return position;
    }
  }
  return undefined;
}

/** Production reacts only to confirmed units and board topology, never hidden enemies. */
function specialistProduction(state: GameState, player: PlayerId, visibleEnemies: readonly Unit[]): CpuAction | undefined {
  const gold = state.players[player].gold;
  const visible = visibleEnemies.filter(isDeployedUnit);
  const hasSea = state.board.terrain.some(row => row.some(tile => tile.kind === 'sea'));
  const ownKinds = new Set(state.units.filter(unit => unit.owner === player).map(unit => unit.kind));
  const candidates: UnitKind[] = [];
  if (hasSea && !ownKinds.has('destroyer') && (visible.some(unit => unit.kind === 'destroyer' || unit.kind === 'landingShip') || state.board.terrain.some(row => row.some(tile => tile.kind === 'port')))) candidates.push('destroyer');
  if (!ownKinds.has('antiAir') && visible.some(unit => unit.kind === 'fighter' || unit.kind === 'bomber')) candidates.push('antiAir');
  if (!ownKinds.has('fighter') && visible.some(unit => unit.kind === 'fighter' || unit.kind === 'bomber')) candidates.push('fighter');
  if (!ownKinds.has('bomber') && visible.some(unit => ['tank', 'artillery', 'rocket', 'destroyer'].includes(unit.kind))) candidates.push('bomber');
  if (usesModernRules(state)) {
    const ownCount = (kind: UnitKind) => state.units.filter(unit => unit.owner === player && unit.kind === kind).length;
    const airDefence = visible.some(unit => unit.kind === 'antiAir' || unit.kind === 'fighter');
    // Mech infantry answer confirmed armour cheaply and can still capture.
    if (ownCount('mech') < 2 && visible.some(unit => unitCategory[unit.kind] === 'armor')) candidates.push('mech');
    if (hasSea && !ownKinds.has('battleship')) candidates.push('battleship');
    if (!ownKinds.has('heavyTank') && gold >= unitStats.heavyTank.cost + unitStats.infantry.cost) candidates.push('heavyTank');
    if (!ownKinds.has('helicopter') && !airDefence) candidates.push('helicopter');
  }
  for (const kind of candidates) {
    if (unitStats[kind].cost > gold) continue;
    const factory = emptyOwnedFacility(state, player, kind);
    if (factory) return { type: 'produce', factory, kind };
  }
  return undefined;
}

/** Share of open land a CPU fills before it stops producing (see `cpuForceLimit`). */
export const CPU_FORCE_LAND_SHARE = 0.25;

/**
 * Unrestrained production gridlocks the board: in the Phase 10.1 baseline most
 * open tiles filled up and units could only wait. The CPU therefore stops
 * producing once its own force reaches a quarter of the non-sea, non-mountain
 * tiles. This uses only the CPU's own units and the public terrain.
 */
const forceLimitCache = new WeakMap<Board, number>();
export function cpuForceLimit(board: Board): number {
  const cached = forceLimitCache.get(board);
  if (cached !== undefined) return cached;
  const openLand = board.terrain.flat().filter(tile => tile.kind !== 'sea' && tile.kind !== 'mountain').length;
  const limit = Math.max(8, Math.floor(openLand * CPU_FORCE_LAND_SHARE));
  forceLimitCache.set(board, limit);
  return limit;
}

/** The force size at which this difficulty stops its bulk production. */
export function difficultyForceLimit(board: Board, config: CpuDifficultyConfig): number {
  return Math.max(MIN_CPU_FORCE, Math.floor(cpuForceLimit(board) * config.forceLimitScale));
}

/** Whether the CPU's own force is at this difficulty's production limit. */
function atForceLimit(state: GameState, player: PlayerId, config: CpuDifficultyConfig): boolean {
  return state.units.filter(unit => unit.owner === player).length >= difficultyForceLimit(state.board, config);
}

function productionAction(state: GameState, player: PlayerId, config: CpuDifficultyConfig, context: CpuPlanningContext): CpuAction | undefined {
  // The rule-version-3 unit limit binds every order, including the exempt ones below.
  if (usesDecisionRules(state) && state.units.filter(unit => unit.owner === player).length >= unitLimit(state.board)) return undefined;
  const { targets } = context;
  const hasRemoteInfantry = orderedUnits(state, player)
    .filter(unit => isEmbarkableUnit(unit.kind))
    .some(unit => targets.some(target => !sameLandComponent(context.landComponents, unit.position, target)));
  const hasLandingShip = state.units.some(unit => unit.owner === player && unit.kind === 'landingShip');
  if (hasRemoteInfantry && !hasLandingShip && state.players[player].gold >= unitStats.landingShip.cost) {
    const port = emptyOwnedFacility(state, player, 'landingShip');
    if (port) return { type: 'produce', factory: port, kind: 'landingShip' };
  }
  const specialist = specialistProduction(state, player, context.visibleEnemies);
  if (specialist) return specialist;
  const supplyNeeded = usesModernRules(state) && orderedUnits(state, player).filter(unit => isGroundUnit(unit.kind) && needsSupply(unit)).length >= 2;
  if (supplyNeeded && !state.units.some(unit => unit.owner === player && isSupplyUnit(unit.kind)) && state.players[player].gold >= unitStats.apc.cost) {
    const factory = emptyOwnedFacility(state, player, 'apc');
    if (factory) return { type: 'produce', factory, kind: 'apc' };
  }
  // Transports and counters to confirmed threats are bounded one-of-a-kind orders;
  // only the bulk force mix stops at the limit.
  if (atForceLimit(state, player, config)) return undefined;
  const kind = preferredProduction(state, player);
  if (!kind) return undefined;
  const factory = emptyOwnedFacility(state, player, kind);
  return factory ? { type: 'produce', factory, kind } : undefined;
}

function objectives(state: GameState, player: PlayerId, config: CpuDifficultyConfig, visibleEnemies: readonly Unit[]): Position[] {
  const scenario = scenarioForState(state);
  const conditions = player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions;
  const holdTargets = conditions?.flatMap(condition => condition.type === 'hold' ? condition.positions : []) ?? [];
  if (holdTargets.length) return holdTargets;
  if (conditions?.every(condition => condition.type === 'survive')) {
    return state.board.terrain.flatMap((row, y) => row.flatMap((tile, x) => tile.owner === player && isPropertyTerrainKind(tile.kind) ? [{ x, y }] : []));
  }
  const capitals: Position[] = [];
  const properties: Position[] = [];
  for (let y = 0; y < state.board.height; y += 1) for (let x = 0; x < state.board.width; x += 1) {
    const tile = state.board.terrain[y]?.[x];
    if (!tile || tile.owner === player || !isPropertyTerrainKind(tile.kind)) continue;
    (tile.kind === 'capital' ? capitals : properties).push({ x, y });
  }
  // Enemy formations participate only after reconnaissance has revealed them.
  const enemies = visibleEnemies.filter(isDeployedUnit).map(unit => unit.position);
  return config.prioritizeCapital ? [...capitals, ...properties, ...enemies] : [...properties, ...capitals, ...enemies];
}

const adjacentPositions = (position: Position): Position[] => [
  { x: position.x + 1, y: position.y }, { x: position.x - 1, y: position.y },
  { x: position.x, y: position.y + 1 }, { x: position.x, y: position.y - 1 },
];

function isAdjacent(first: Position, second: Position): boolean {
  return manhattanDistance(first, second) === 1;
}

/**
 * Land components deliberately use infantry movement rules. This lets the CPU distinguish
 * a remote island from a route it can simply walk, without treating a port as open sea.
 */
const landComponentCache = new WeakMap<Board, ReadonlyMap<string, number>>();

/**
 * Terrain kinds never change during a match, so infantry-connected land areas can be
 * indexed once per board. Ownership changes do not invalidate this topology.
 */
function landComponents(board: Board): ReadonlyMap<string, number> {
  const cached = landComponentCache.get(board);
  if (cached) return cached;

  const components = new Map<string, number>();
  let componentId = 0;
  for (let y = 0; y < board.height; y += 1) for (let x = 0; x < board.width; x += 1) {
    const start = { x, y };
    const startKey = `${x},${y}`;
    if (components.has(startKey) || !Number.isFinite(movementCost(board, start, 'infantry'))) continue;
    const pending = [start];
    while (pending.length) {
      const current = pending.pop()!;
      const currentKey = `${current.x},${current.y}`;
      if (components.has(currentKey) || !Number.isFinite(movementCost(board, current, 'infantry'))) continue;
      components.set(currentKey, componentId);
      for (const next of adjacentPositions(current)) pending.push(next);
    }
    componentId += 1;
  }
  landComponentCache.set(board, components);
  return components;
}

function sameLandComponent(components: ReadonlyMap<string, number>, first: Position, second: Position): boolean {
  const firstComponent = components.get(`${first.x},${first.y}`);
  return firstComponent !== undefined && firstComponent === components.get(`${second.x},${second.y}`);
}

function nearestTarget(position: Position, targets: readonly Position[]): Position | undefined {
  return [...targets].sort((a, b) => manhattanDistance(position, a) - manhattanDistance(position, b) || a.y - b.y || a.x - b.x)[0];
}

function needsSupply(unit: DeployedUnit): boolean {
  const stats = unitStats[unit.kind];
  const fuel = unit.fuel ?? stats.fuel;
  const fuelTurnsRemaining = stats.fuelPerTurn > 0 ? Math.ceil(fuel / stats.fuelPerTurn) : Infinity;
  return fuelTurnsRemaining <= 2
    || fuel <= Math.max(6, Math.floor(stats.fuel / 3))
    // Only armed kinds track ammunition; an empty magazine needs resupply most of all.
    || (stats.ammo > 0 && (unit.ammo ?? stats.ammo) <= Math.max(1, Math.floor(stats.ammo / 3)));
}

/**
 * Scores a legal destination from knowledge available to the CPU.  Visible opponents
 * contribute counterattack risk; unseen units are intentionally absent from this function.
 */
export function evaluateCpuPosition(
  state: GameState,
  player: PlayerId,
  unit: DeployedUnit,
  destination: Position,
  targets: readonly Position[],
  config: CpuDifficultyConfig,
  knownEnemies: readonly Unit[],
): number {
  const terrain = terrainAt(state.board, destination);
  if (!terrain) return Number.NEGATIVE_INFINITY;
  const moved: DeployedUnit = { ...unit, position: { ...destination } };
  const projected = { ...state, units: state.units.map(candidate => candidate.id === unit.id ? moved : candidate) };
  // Keep the positional value tied to the same HP-scaled mitigation used by combat.
  // At 100 HP, each star is worth 10% mitigation and 9 position points.
  const defense = terrainDefenseReduction(terrain, unit.hp) * 0.9 * config.terrainDefenseWeight;
  // Under modern rules only compatible facilities (or, for ground units, a supply vehicle) resupply.
  const resupplied = isServiceTile(state, destination, unit.kind, player)
    || (usesModernRules(state) && isGroundUnit(unit.kind) && adjacentToSupplyUnit(state, destination, player, unit.id));
  const supply = needsSupply(unit) && resupplied ? 80 : 0;
  const distance = targets.length ? Math.min(...targets.map(target => manhattanDistance(destination, target))) : 0;
  const deployedEnemies = knownEnemies.filter(isDeployedUnit);
  const pressure = deployedEnemies.reduce((risk, enemy) => {
    const forecast = forecastCombat(projected, enemy, moved);
    return risk + (forecast.ok ? forecast.value.damageToDefender * 1.4 : 0);
  }, 0);
  const captureThreat = deployedEnemies
    .filter(enemy => interruptsCapture(state, player, enemy))
    .reduce((best, enemy) => Math.min(best, manhattanDistance(destination, enemy.position)), Infinity);
  const response = Number.isFinite(captureThreat) ? Math.max(0, 36 - captureThreat * 7) : 0;
  // Below 50 HP, increasing pressure is especially undesirable while cover becomes
  // more valuable. This creates a genuine retreat preference without hiding the
  // normal objective and resupply incentives from damaged units.
  const lowHpRatio = Math.max(0, 50 - unit.hp) / 50;
  const retreatCover = lowHpRatio * config.lowHpRetreatWeight * terrainDefenseReduction(terrain, unit.hp) * 1.2;
  const retreatPressure = lowHpRatio * config.lowHpRetreatWeight * pressure;
  // Parking on an owned factory/airport/port blocks production there. Units that
  // came to be serviced (low supplies or heavy damage) are exempt.
  const blocking = !needsSupply(unit) && unit.hp > 50 && blocksProduction(state, player, destination, knownEnemies, config) ? FACILITY_BLOCK_PENALTY : 0;
  const logistics = supplyVehicleValue(state, player, unit, destination);
  const scenario = scenarioForState(state);
  const conditions = player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions;
  const hold = conditions?.some(condition => condition.type === 'hold' && condition.positions.some(p => p.x === destination.x && p.y === destination.y)) ? 100 : 0;
  const score = conditions?.some(condition => condition.type === 'score') && isPropertyTerrainKind(terrain.kind) && terrain.owner !== player && unitStats[unit.kind].capturePower > 0 ? 35 : 0;
  return defense + supply + response + retreatCover + logistics + hold + score
    - distance * config.objectiveDistanceWeight
    - pressure * config.threatAvoidanceWeight * (1 - stalemateRelief(state))
    - retreatPressure
    - blocking;
}

/** Outweighs a three-star facility's cover so idle units step off production sites. */
export const FACILITY_BLOCK_PENALTY = 45;

/** Whether ending on `position` would occupy one of `player`'s production facilities. */
function blocksProduction(state: GameState, player: PlayerId, position: Position, knownEnemies: readonly Unit[], config: CpuDifficultyConfig): boolean {
  const tile = terrainAt(state.board, position);
  if (tile?.owner !== player || atForceLimit(state, player, config)) return false;
  const productionRule = scenarioForState(state)?.productionRules ?? 'legacy-factory-air';
  const kinds = productionKindsForRule(productionRule, state.ruleVersion)[tile.kind] ?? [];
  // Only a facility we could actually use this turn is being blocked.
  if (!kinds.some(kind => unitStats[kind].cost <= state.players[player].gold)) return false;
  // Holding the facility is the right call when a visible enemy capturer could take it.
  return !knownEnemies.some(enemy => isDeployedUnit(enemy) && unitStats[enemy.kind].capturePower > 0 && manhattanDistance(enemy.position, position) <= 2);
}

/**
 * Long matches gradually lower the weight of visible counterattack risk so both
 * sides stop trading turns out of range. It uses only the public round number.
 */
export function stalemateRelief(state: Pick<GameState, 'turn'>): number {
  return Math.min(0.6, Math.max(0, (state.turn - 20) / 25));
}

/** Modern rules: a supply vehicle is worth more next to allied ground units that need resupply. */
function supplyVehicleValue(state: GameState, player: PlayerId, unit: DeployedUnit, destination: Position): number {
  if (!usesModernRules(state) || !isSupplyUnit(unit.kind)) return 0;
  const served = orderedUnits(state, player).filter(ally => ally.id !== unit.id && isGroundUnit(ally.kind)
    && manhattanDistance(ally.position, destination) === 1 && needsSupply(ally)).length;
  return Math.min(2, served) * 30;
}

/** Choose one transport step before ordinary movement so island objectives are never stranded. */
function transportAction(state: GameState, player: PlayerId, targets: readonly Position[], components: ReadonlyMap<string, number>, visibleEnemies: readonly Unit[]): CpuAction | undefined {
  if (!targets.length) return undefined;
  const units = orderedUnits(state, player);

  // Land transports unload near an objective, then become mobile suppliers.
  for (const transport of units.filter(unit => unit.kind === 'apc' && !unit.hasMoved && !unit.hasActed)) {
    const cargo = state.units.find(unit => unit.embarkedIn === transport.id);
    const target = nearestTarget(transport.position, targets);
    if (!target) continue;
    if (cargo) {
      const distance = manhattanDistance(transport.position, target);
      if (distance <= 3) {
        const destination = adjacentPositions(transport.position).filter(p => Number.isFinite(movementCost(state.board, p, cargo.kind)) && !knownUnitAt(state, player, p, visibleEnemies))
          .sort((a, b) => manhattanDistance(a, target) - manhattanDistance(b, target) || a.y - b.y || a.x - b.x)[0];
        if (destination) return { type: 'disembark', transportId: transport.id, destination };
      }
      const destination = reachablePositionsForPlayer(state, transport.id, player).filter(p => manhattanDistance(p, target) < distance)
        .sort((a, b) => manhattanDistance(a, target) - manhattanDistance(b, target) || a.y - b.y || a.x - b.x)[0];
      if (destination) return { type: 'move', unitId: transport.id, destination };
    } else if (manhattanDistance(transport.position, target) > 6) {
      const passenger = units.find(unit => isEmbarkableUnit(unit.kind) && !unit.hasActed && isAdjacent(unit.position, transport.position));
      if (passenger) return { type: 'embark', unitId: passenger.id, transportId: transport.id };
    }
  }

  // An unloaded ship gets priority: landing the cargo is the only way it can capture remote properties.
  for (const transport of units.filter(unit => unit.kind === 'landingShip' && !unit.hasMoved && !unit.hasActed)) {
    const cargo = state.units.find(unit => unit.embarkedIn === transport.id);
    if (!cargo) continue;
    const destination = adjacentPositions(transport.position)
      .filter(position => Number.isFinite(movementCost(state.board, position, 'infantry')) && !knownUnitAt(state, player, position, visibleEnemies)
        && targets.some(target => sameLandComponent(components, position, target)))
      .map(position => ({ position, target: nearestTarget(position, targets) }))
      .filter((candidate): candidate is { position: Position; target: Position } => candidate.target !== undefined)
      .sort((a, b) => manhattanDistance(a.position, a.target) - manhattanDistance(b.position, b.target)
        || a.position.y - b.position.y || a.position.x - b.position.x)[0]?.position;
    if (destination) return { type: 'disembark', transportId: transport.id, destination };
  }

  // Board an infantry unit only if an objective lies on a different land component.
  for (const infantry of units.filter(unit => isEmbarkableUnit(unit.kind) && !unit.hasActed)) {
    const remoteObjective = targets.some(target => !sameLandComponent(components, infantry.position, target));
    if (!remoteObjective) continue;
    const transport = units.find(candidate => candidate.kind === 'landingShip' && !candidate.hasMoved && !candidate.hasActed
      && isAdjacent(infantry.position, candidate.position) && !state.units.some(unit => unit.embarkedIn === candidate.id));
    if (transport) return { type: 'embark', unitId: infantry.id, transportId: transport.id };
  }

  // Carry cargo toward the closest remote objective. This is finite because it only accepts a strict
  // Manhattan-distance improvement; otherwise normal actions/end-turn take over.
  for (const transport of units.filter(unit => unit.kind === 'landingShip' && !unit.hasMoved && !unit.hasActed)) {
    if (!state.units.some(unit => unit.embarkedIn === transport.id)) continue;
    const target = nearestTarget(transport.position, targets);
    if (!target) continue;
    const currentDistance = manhattanDistance(transport.position, target);
    const destination = reachablePositionsForPlayer(state, transport.id, player)
      .filter(position => manhattanDistance(position, target) < currentDistance)
      .sort((a, b) => manhattanDistance(a, target) - manhattanDistance(b, target) || a.y - b.y || a.x - b.x)[0];
    if (destination) return { type: 'move', unitId: transport.id, destination };
  }
  return undefined;
}

function moveAction(state: GameState, player: PlayerId, config: CpuDifficultyConfig, context: CpuPlanningContext): CpuAction | undefined {
  const { targets } = context;
  if (!targets.length) return undefined;
  for (const unit of orderedUnits(state, player)) {
    if (unit.hasMoved || unit.hasActed) continue;
    // Advance across the unit's whole movement range (Dijkstra reachability), weighing cover,
    // resupply and visible counterattack risk instead of raw distance alone.
    // Include the current position as an explicit wait order. Unlike a zero-cost
    // move, waiting is legal even when a ground unit has no fuel left.
    const destination = [unit.position, ...reachablePositionsForPlayer(state, unit.id, player)]
      .map(position => ({ position, score: evaluateCpuPosition(state, player, unit, position, targets, config, context.visibleEnemies) }))
      .sort((a, b) => b.score - a.score || a.position.y - b.position.y || a.position.x - b.position.x)[0]?.position;
    if (destination) {
      if (destination.x === unit.position.x && destination.y === unit.position.y)
        return { type: 'wait', unitId: unit.id };
      return { type: 'move', unitId: unit.id, destination };
    }
  }
  return undefined;
}

/**
 * Move-then-attack planning (#122): picks the unit, destination and visible
 * target with the best expected trade, and moves there; the next CPU step's
 * `attackAction` then attacks from the new position. Only visible enemies and
 * the fog-safe movement preview are used. A move stopped short by a hidden
 * enemy leaves the unit where it stopped: it attacks only if something is in
 * range there. Each step re-plans on the updated state, so a unit damaged by
 * one strike becomes a finishing-blow target for the next.
 */
function strikeAction(state: GameState, player: PlayerId, config: CpuDifficultyConfig, visibleTargets: readonly Unit[]): CpuAction | undefined {
  if (config.strikePlanning === 'none') return undefined;
  let best: { score: number; unitId: string; destination: Position } | undefined;
  for (const unit of orderedUnits(state, player)) {
    const stats = unitStats[unit.kind];
    if (unit.hasMoved || unit.hasActed || stats.indirect || stats.attack <= 0 || (unit.ammo ?? stats.ammo) <= 0) continue;
    const [minimumRange, maximumRange] = stats.range;
    const targets = visibleTargets.filter((target): target is DeployedUnit => isDeployedUnit(target)
      && manhattanDistance(unit.position, target.position) <= stats.movement + maximumRange);
    if (!targets.length) continue;
    // Units with another job (capturing, supplying, resupplying, holding the
    // capital against a visible capturer) leave it only for a finishing blow.
    const finishingOnly = config.strikePlanning === 'lethal' || stats.capturePower > 0 || isSupplyUnit(unit.kind) || needsSupply(unit)
      || guardsCapital(state, player, unit, visibleTargets);
    for (const destination of reachablePositionsForPlayer(state, unit.id, player)) {
      const inRange = targets.filter(target => {
        const distance = manhattanDistance(destination, target.position);
        return distance >= minimumRange && distance <= maximumRange;
      });
      if (!inRange.length) continue;
      // A capturer on a capturable property would capture instead of attacking.
      const tile = terrainAt(state.board, destination);
      if (!tile || (stats.capturePower > 0 && isPropertyTerrainKind(tile.kind) && tile.owner !== player)) continue;
      if (blocksProduction(state, player, destination, visibleTargets, config)) continue;
      const moved: DeployedUnit = { ...unit, position: { ...destination }, hasMoved: true };
      const projected = { ...state, units: state.units.map(candidate => candidate.id === unit.id ? moved : candidate) };
      for (const target of inRange) {
        if (!favorableAttack(projected, moved, target, config)) continue;
        const forecast = forecastCombat(projected, moved, target);
        if (!forecast.ok) continue;
        const lethal = forecast.value.outgoing.min >= target.hp;
        const interruption = interruptsCapture(state, player, target);
        if (finishingOnly && !lethal && !interruption) continue;
        const targetCost = unitStats[target.kind].cost;
        const score = Math.min(target.hp, forecast.value.damageToDefender) * targetCost / 100
          - forecast.value.damageToAttacker * stats.cost / 100
          + (lethal ? targetCost * STRIKE_LETHAL_BONUS : 0)
          + (interruption ? STRIKE_INTERRUPT_BONUS : 0)
          + terrainDefenseReduction(tile, unit.hp) * STRIKE_COVER_VALUE;
        // Strictly better only: ties keep the first candidate in unit-id,
        // movement-preview and unit-list order, which is deterministic.
        if (!best || score > best.score) best = { score, unitId: unit.id, destination };
      }
    }
  }
  return best && { type: 'move', unitId: best.unitId, destination: best.destination };
}

/** Removing a unit is worth half its cost on top of the damage value. */
const STRIKE_LETHAL_BONUS = 0.5;
/** Stopping a capture of our property outweighs any ordinary trade. */
const STRIKE_INTERRUPT_BONUS = 3000;
/** Value of each percent of terrain mitigation at the attack position. */
const STRIKE_COVER_VALUE = 10;

/** Whether `unit` holds our capital while a visible enemy capturer could reach it. */
function guardsCapital(state: GameState, player: PlayerId, unit: DeployedUnit, visibleEnemies: readonly Unit[]): boolean {
  const tile = terrainAt(state.board, unit.position);
  if (tile?.kind !== 'capital' || tile.owner !== player) return false;
  return visibleEnemies.some(enemy => isDeployedUnit(enemy) && unitStats[enemy.kind].capturePower > 0
    && manhattanDistance(enemy.position, unit.position) <= unitStats[enemy.kind].movement + 1);
}

/** Build immutable, fog-safe data once for the current CPU order. */
export function createCpuPlanningContext(state: GameState, player: PlayerId, config: CpuDifficultyConfig): CpuPlanningContext {
  const visibleEnemies = getVisibleEnemies(state, player);
  return { visibleEnemies, targets: objectives(state, player, config, visibleEnemies), landComponents: landComponents(state.board) };
}

/** Select the next legal high-level CPU order. The caller applies it with the game command layer. */
export function chooseCpuAction(state: GameState, difficulty: CpuDifficulty = 'normal', player: PlayerId = state.activePlayer): CpuAction {
  if (state.winner || player !== state.activePlayer) return { type: 'endTurn' };
  state = observeLogistics(state, player);
  const config = cpuDifficultyConfig[difficulty];
  const capture = orderedUnits(state, player).find(unit => canCapture(state, unit));
  if (capture) return { type: 'capture', unitId: capture.id };
  const context = createCpuPlanningContext(state, player, config);
  return attackAction(state, player, config, context.visibleEnemies)
    ?? strikeAction(state, player, config, context.visibleEnemies)
    ?? mergeAction(state, player)
    ?? transportAction(state, player, context.targets, context.landComponents, context.visibleEnemies)
    ?? productionAction(state, player, config, context)
    ?? moveAction(state, player, config, context)
    ?? { type: 'endTurn' };
}

/** Merge badly damaged peers only when no immediate attack was selected. */
function mergeAction(state: GameState, player: PlayerId): CpuAction | undefined {
  const damaged = orderedUnits(state, player).filter(unit => !unit.hasActed && unit.hp <= 50 && isMergeableUnit(unit.kind));
  for (const unit of damaged) {
    const target = damaged.find(ally => ally.id !== unit.id && ally.kind === unit.kind && isAdjacent(unit.position, ally.position));
    if (target) return { type: 'merge', unitId: unit.id, targetId: target.id };
  }
  return undefined;
}

/** Opt-in development trace; contains no hidden enemy logistics or positions. */
export function explainCpuAction(state: GameState, difficulty: CpuDifficulty = 'normal') {
  const player = state.activePlayer;
  const observed = observeLogistics(state, player);
  const config = cpuDifficultyConfig[difficulty];
  const context = createCpuPlanningContext(observed, player, config);
  const action = chooseCpuAction(state, difficulty);
  const unit = 'unitId' in action ? observed.units.find(candidate => candidate.id === action.unitId) : undefined;
  const destination = action.type === 'move' ? action.destination : unit?.position;
  const evaluation = unit && isDeployedUnit(unit) && destination ? {
    total: evaluateCpuPosition(observed, player, unit, destination, context.targets, config, context.visibleEnemies),
    distanceToGoal: context.targets.length ? Math.min(...context.targets.map(target => manhattanDistance(destination, target))) : 0,
    defensePercent: terrainDefenseReduction(terrainAt(state.board, destination)!, unit.hp),
    supplyValue: supplyVehicleValue(observed, player, unit, destination),
  } : undefined;
  return { action, reason: action.type, visibleEnemies: context.visibleEnemies.length, evaluation };
}
