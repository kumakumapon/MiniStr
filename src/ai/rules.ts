import { hasUsableWeapon, weaponAmmo, weaponsForUnit } from '../game/weapons';
import type { WeaponSlot } from '../game/units';
import { fortificationError, unitDefenseStars } from '../game/engineering';
import { usesFrontlineRules } from '../game/types';
import { forecastCombat, terrainDefenseReduction } from '../game/combat';
import { observeLogistics } from '../game/fog';
import { endTurn, reachablePositionsForPlayer } from '../game/commands';
import { canProduceUnit, isPropertyTerrainKind, productionKindsForRule, unitLimit } from '../game/facilities';
import { visibleEnemies as getVisibleEnemies } from '../game/fog';
import { scenarioForState, type EvacuationCondition } from '../game/maps';
import { manhattanDistance, movementCost, terrainAt } from '../game/terrain';
import { isDeployedUnit, usesDecisionRules, usesOperationsRules, usesModernRules, usesReconRules, type Board, type DeployedUnit, type GameState, type PlayerId, type Position, type Unit, type UnitKind } from '../game/types';
import { resupplyAvailable, isGroundUnit, isServiceTile, REPAIR_HP_PER_TURN } from '../game/logistics';
import { isEmbarkableUnit, isMergeableUnit, isSupplyUnit, remainingAmmo, unitCategory, unitStats } from '../game/units';
import { coordinatedOrder, coordinationValue, cpuRole, isPriorityTarget, transportSafeAt } from './coordination';
import { canEvacuateUnit, evacuationObjectives, isEvacuationTarget } from '../game/evacuation';
import { isEvacuationCondition } from '../game/maps';
import { bluePlanningState, rotatePosition } from './perspective';
import { chooseReconCenter } from './recon';

// Production IDs interleave between armies. Numeric ordering preserves each
// army's creation order instead of moving u10 ahead of u2.
const unitIdOrder = new Intl.Collator('en', { numeric: true });

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
  | { type: 'recon'; center: Position }
  | { type: 'fortify'; unitId: string }
  | { type: 'capture'; unitId: string }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'merge'; unitId: string; targetId: string }
  | { type: 'produce'; factory: Position; kind: UnitKind }
  | { type: 'move'; unitId: string; destination: Position }
  | { type: 'wait'; unitId: string }
  | { type: 'evacuate'; unitId: string }
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
  return state.units.filter((unit): unit is DeployedUnit => unit.owner === player && isDeployedUnit(unit)).sort((a, b) => unitIdOrder.compare(a.id, b.id));
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
  // A weak secondary shot at a serviced garrison would be healed away every
  // turn. Leave the action available for closing to primary range or resupply.
  if (result.value.attackWeapon === 1 && isDeployedUnit(target)
    && isServiceTile(state, target.position, target.kind, target.owner)
    && result.value.damageToDefender <= REPAIR_HP_PER_TURN && result.value.outgoing.min < target.hp) return false;
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
    if (attacker.hasActed || !hasUsableWeapon(state, attacker)) continue;
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
        const objective = Number(isPriorityTarget(state, player, b)) - Number(isPriorityTarget(state, player, a));
        return interruption || lethal || objective || bScore - aScore || a.hp - b.hp || unitIdOrder.compare(a.id, b.id);
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
      // Leave a berth for a nearby returning ship instead of filling the only
      // entrance with a new hull before the ship can reload.
      if (usesOperationsRules(state) && tile.kind === 'port' && state.units.some(unit =>
        unit.owner === player && isDeployedUnit(unit) && unitCategory[unit.kind] === 'sea' && needsSupply(unit)
        && manhattanDistance(unit.position, position) <= Math.min(2, unit.fuel ?? unitStats[unit.kind].fuel))) continue;
      const productionRule = scenarioForState(state)?.productionRules ?? 'legacy-factory-air';
      if (canProduceUnit(tile.kind, kind, productionRule, state.ruleVersion)) return position;
    }
  }
  return undefined;
}

/** Production reacts only to confirmed units and board topology, never hidden enemies. */
function specialistProduction(state: GameState, player: PlayerId, visibleEnemies: readonly Unit[], remoteGround = false): CpuAction | undefined {
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
    if (remoteGround && isGroundUnit(kind) && !isEmbarkableUnit(kind)) continue;
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
  if (usesDecisionRules(state) && state.units.filter(unit => unit.owner === player).length >= unitLimit(state.board, state.ruleVersion)) return undefined;
  const { targets } = context;
  const hasRemoteInfantry = orderedUnits(state, player)
    .filter(unit => isEmbarkableUnit(unit.kind))
    .some(unit => targets.some(target => !sameLandComponent(context.landComponents, unit.position, target)));
  const hasLandingShip = state.units.some(unit => unit.owner === player && unit.kind === 'landingShip');
  const warships = state.units.filter(unit => unit.owner === player && (unit.kind === 'destroyer' || unit.kind === 'battleship')).length;
  const remoteGround = usesOperationsRules(state) && hasRemoteInfantry && !state.board.terrain.some((row, y) => row.some((tile, x) =>
    tile.kind === 'factory' && tile.owner === player && targets.some(target => sameLandComponent(context.landComponents, { x, y }, target))));
  // Once the service berth can be kept open, restore indirect fire support
  // before spending each income on another escort or stranded ground troops.
  if (usesOperationsRules(state) && hasRemoteInfantry && hasLandingShip
    && !state.units.some(unit => unit.owner === player && unit.kind === 'battleship')
    && state.board.terrain.some(row => row.some(tile => tile.kind === 'port' && tile.owner === player))) {
    const port = emptyOwnedFacility(state, player, 'battleship');
    if (port && state.players[player].gold >= unitStats.battleship.cost) return { type: 'produce', factory: port, kind: 'battleship' };
    return undefined;
  }
  if (hasRemoteInfantry && hasLandingShip && warships < 2 && state.board.terrain.some(row => row.some(tile => tile.kind === 'port' && tile.owner === player))) {
    const port = emptyOwnedFacility(state, player, 'destroyer');
    if (port && state.players[player].gold >= unitStats.destroyer.cost) return { type: 'produce', factory: port, kind: 'destroyer' };
    // Save for an escort instead of repeatedly spending every new income on an
    // unarmed replacement transport or on infantry stranded on the home island.
    return undefined;
  }
  if (hasRemoteInfantry && !hasLandingShip && state.board.terrain.some(row => row.some(tile => tile.kind === 'port' && tile.owner === player))) {
    const port = emptyOwnedFacility(state, player, 'landingShip');
    if (port && state.players[player].gold >= unitStats.landingShip.cost) return { type: 'produce', factory: port, kind: 'landingShip' };
    // Losing the transports must not start an endless queue of stranded ground
    // troops. Bank the replacement cost while movement clears the home port.
    return undefined;
  }
  if (usesFrontlineRules(state) && !atForceLimit(state, player, config) && !remoteGround
    && state.board.terrain.some(row => row.some(tile => tile.kind === 'supplyDepot'))
    && !state.units.some(unit => unit.owner === player && unit.kind === 'engineer')
    && (state.fortifications?.filter(site => site.owner === player).length ?? 0) < 2
    && state.players[player].gold >= unitStats.engineer.cost + 500) {
    const factory = emptyOwnedFacility(state, player, 'engineer');
    if (factory) return { type: 'produce', factory, kind: 'engineer' };
  }
  const specialist = specialistProduction(state, player, context.visibleEnemies, remoteGround);
  if (specialist) return specialist;
  const supplyNeeded = usesModernRules(state) && orderedUnits(state, player).filter(unit => isGroundUnit(unit.kind) && needsSupply(unit)).length >= 2;
  if (supplyNeeded && !state.units.some(unit => unit.owner === player && isSupplyUnit(unit.kind)) && state.players[player].gold >= unitStats.apc.cost) {
    const factory = emptyOwnedFacility(state, player, 'apc');
    if (factory) return { type: 'produce', factory, kind: 'apc' };
  }
  // Transports and counters to confirmed threats are bounded one-of-a-kind orders;
  // only the bulk force mix stops at the limit.
  if (atForceLimit(state, player, config) || remoteGround) return undefined;
  const kind = preferredProduction(state, player);
  if (!kind) return undefined;
  const factory = emptyOwnedFacility(state, player, kind);
  return factory ? { type: 'produce', factory, kind } : undefined;
}

function objectives(state: GameState, player: PlayerId, config: CpuDifficultyConfig, visibleEnemies: readonly Unit[]): Position[] {
  const scenario = scenarioForState(state);
  const conditions = player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions;
  const controlTargets = conditions?.flatMap(condition => condition.type === 'control' ? condition.positions : []) ?? [];
  if (controlTargets.length) {
    const unowned = controlTargets.filter(p => terrainAt(state.board, p)?.owner !== player);
    return unowned.length ? unowned : controlTargets;
  }
  const holdTargets = conditions?.flatMap(condition => condition.type === 'hold' ? condition.positions : []) ?? [];
  if (holdTargets.length) return holdTargets;
  const ownExits = evacuationObjectives(state, player).flatMap(condition => condition.positions);
  if (ownExits.length) return ownExits;
  if (conditions?.every(condition => condition.type === 'survive')) {
    return state.board.terrain.flatMap((row, y) => row.flatMap((tile, x) => tile.owner === player && isPropertyTerrainKind(tile.kind) ? [{ x, y }] : []));
  }
  // The opponent's authored objectives are public orders, even in fog. Defend
  // them before expanding elsewhere; no hidden unit positions are consulted.
  const opposingConditions = player === 'red' ? scenario?.defeatConditions : scenario?.victoryConditions;
  const opposingEvacuation = opposingConditions?.filter(isEvacuationCondition) ?? [];
  if (opposingEvacuation.length) {
    const targets = visibleEnemies.filter(isDeployedUnit).filter(unit => opposingEvacuation.some(condition => condition.unitIds.includes(unit.id)));
    return targets.length ? targets.map(unit => unit.position) : opposingEvacuation.flatMap(condition => condition.positions);
  }
  const counterTargets = opposingConditions?.flatMap(condition => condition.type === 'hold' ? condition.positions : []) ?? [];
  if (counterTargets.length) return counterTargets;
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
    // Preserve the primary weapon's mission: an empty secondary alone should
    // not pull a fully armed ship or artillery battery away from its objective.
    || (stats.ammo > 0 && remainingAmmo(unit) <= Math.max(1, Math.floor(stats.ammo / 3)));
}

const supplyTargetCache = new WeakMap<GameState, Map<string, readonly Position[]>>();
function supplyTargets(state: GameState, player: PlayerId, unit: DeployedUnit): readonly Position[] {
  let cache = supplyTargetCache.get(state);
  if (!cache) { cache = new Map(); supplyTargetCache.set(state, cache); }
  const previous = cache.get(unit.id);
  if (previous) return previous;
  const positions = state.board.terrain.flatMap((row, y) => row.flatMap((_tile, x) => {
    const position = { x, y };
    return resupplyAvailable(state, position, unit.kind, player, unit.id) ? [position] : [];
  }));
  cache.set(unit.id, positions);
  return positions;
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
  const defense = unitDefenseStars(projected, moved) * 10 * unit.hp / 100 * 0.9 * config.terrainDefenseWeight;
  // Under modern rules only compatible facilities (or, for ground units, a supply vehicle) resupply.
  const resupplied = resupplyAvailable(state, destination, unit.kind, player, unit.id);
  const supply = needsSupply(unit) && resupplied ? 80 : 0;
  const serviceTargets = needsSupply(unit) ? supplyTargets(state, player, unit) : [];
  const serviceDistance = serviceTargets.length ? Math.min(...serviceTargets.map(position => manhattanDistance(destination, position))) : undefined;
  // A secondary gun can cover a retreat, but does not replace a depleted primary.
  const criticalSupply = remainingAmmo(unit) === 0 && unitStats[unit.kind].ammo > 0 || (unit.fuel ?? unitStats[unit.kind].fuel) <= unitStats[unit.kind].fuelPerTurn * 2;
  const distance = targets.length ? Math.min(...targets.map(target => manhattanDistance(destination, target))) : 0;
  const deployedEnemies = knownEnemies.filter(isDeployedUnit);
  const pressure = deployedEnemies.reduce((risk, enemy) => {
    const forecast = forecastCombat(projected, enemy, moved);
    return risk + (forecast.ok ? forecast.value.damageToDefender * 1.4 : 0);
  }, 0);
  // Indirect guns establish a firing position; driving onto the defended tile
  // makes them unable to fire and blocks the troops meant to capture it.
  const futureShooter = { ...moved, hasMoved: false, hasActed: false };
  const firePosition = unitStats[unit.kind].indirect && remainingAmmo(unit) > 0
    ? deployedEnemies.reduce((best, enemy) => {
      const forecast = forecastCombat(projected, futureShooter, enemy);
      return Math.max(best, forecast.ok ? forecast.value.damageToDefender * 1.4 : 0);
    }, 0) : 0;
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
  const holding = conditions?.find(condition => condition.type === 'hold' && condition.positions.some(p => p.x === destination.x && p.y === destination.y));
  const controlled = conditions?.some(condition => condition.type === 'control' && condition.positions.some(p => p.x === destination.x && p.y === destination.y));
  const mustCapture = terrain.owner !== player && (controlled || holding?.type === 'hold' && holding.requireOwnership
    || terrain.kind === 'capital' && terrain.owner !== undefined && conditions?.some(condition => condition.type === 'captureCapital'));
  // Occupying an enemy objective with armour/aircraft prevents our infantry
  // from capturing it. This applies to damaged units too: it is not a service tile.
  const blocksCapture = mustCapture && unitStats[unit.kind].capturePower === 0;
  const cannotHold = holding?.type === 'hold' && holding.groundOnly && !isGroundUnit(unit.kind);
  const hold = holding && !blocksCapture && !cannotHold ? 100 : 0;
  const opposingConditions = player === 'red' ? scenario?.defeatConditions : scenario?.victoryConditions;
  const contest = opposingConditions?.some(condition => condition.type === 'hold' && condition.positions.some(p => p.x === destination.x && p.y === destination.y)) ? 60 : 0;
  const score = conditions?.some(condition => condition.type === 'score') && isPropertyTerrainKind(terrain.kind) && terrain.owner !== player && unitStats[unit.kind].capturePower > 0 ? 35 : 0;
  // Healthy combat units leave uncaptured facilities open for the infantry.
  const captureLane = unit.hp > 50 && unitStats[unit.kind].capturePower === 0 && isPropertyTerrainKind(terrain.kind) && terrain.owner !== player ? 30 : 0;
  const control = controlled ? terrain.owner === player ? 20 : unitStats[unit.kind].capturePower > 0 ? 110 : -80 : 0;
  return coordinationValue(state, player, unit, destination, targets) + defense + supply + response + retreatCover + logistics + hold + contest + score + control + firePosition
    - (criticalSupply && serviceDistance !== undefined ? serviceDistance : distance) * config.objectiveDistanceWeight
    - pressure * config.threatAvoidanceWeight * (1 - stalemateRelief(state))
    - retreatPressure
    - captureLane
    - blocking
    - (blocksCapture || cannotHold ? 150 : 0);
}

/** Outweighs a three-star facility's cover so idle units step off production sites. */
export const FACILITY_BLOCK_PENALTY = 45;

/** Whether ending on `position` would occupy one of `player`'s production facilities. */
function blocksProduction(state: GameState, player: PlayerId, position: Position, knownEnemies: readonly Unit[], config: CpuDifficultyConfig): boolean {
  const tile = terrainAt(state.board, position);
  if (tile?.owner !== player) return false;
  // Ships and aircraft are bounded specialist orders even at the bulk-force
  // cap. Their facilities must stay open so a lost fleet can be rebuilt.
  if (atForceLimit(state, player, config) && tile.kind !== 'port' && tile.kind !== 'airport') return false;
  const productionRule = scenarioForState(state)?.productionRules ?? 'legacy-factory-air';
  const kinds = productionKindsForRule(productionRule, state.ruleVersion)[tile.kind] ?? [];
  if (!kinds.length) return false;
  // Reserve ports and airports before their expensive units are affordable;
  // otherwise cheap ground production can gridlock them before a fleet is lost.
  if (tile.kind !== 'port' && tile.kind !== 'airport'
    && !kinds.some(kind => unitStats[kind].cost <= state.players[player].gold)) return false;
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
  targets = targets.filter(target => components.has(`${target.x},${target.y}`));
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
      const destination = reachablePositionsForPlayer(state, transport.id, player).filter(p => transportSafeAt(state, transport, p, visibleEnemies) && manhattanDistance(p, target) < distance)
        .sort((a, b) => manhattanDistance(a, target) - manhattanDistance(b, target) || a.y - b.y || a.x - b.x)[0];
      if (destination) return { type: 'move', unitId: transport.id, destination };
    } else if (manhattanDistance(transport.position, target) > 6 && !isEvacuationTarget(state, transport.id, player)) {
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
    const nextTarget = nearestTarget(infantry.position, targets);
    const remoteObjective = nextTarget !== undefined && !sameLandComponent(components, infantry.position, nextTarget);
    if (!remoteObjective) continue;
    const transport = units.find(candidate => candidate.kind === 'landingShip' && !candidate.hasMoved && !candidate.hasActed
      && isAdjacent(infantry.position, candidate.position) && !state.units.some(unit => unit.embarkedIn === candidate.id));
    if (transport) return { type: 'embark', unitId: infantry.id, transportId: transport.id };
    if (infantry.hasMoved) continue;
    // Meet an idle ship at its current coast instead of letting the empty ship
    // sail away while the infantry walks toward an unreachable island.
    const meeting = units.filter(candidate => candidate.kind === 'landingShip' && !candidate.hasMoved && !candidate.hasActed
      && !state.units.some(unit => unit.embarkedIn === candidate.id))
      .flatMap(candidate => adjacentPositions(candidate.position))
      .filter(position => sameLandComponent(components, infantry.position, position));
    const currentDistance = meeting.length ? Math.min(...meeting.map(position => manhattanDistance(infantry.position, position))) : Infinity;
    const destination = reachablePositionsForPlayer(state, infantry.id, player)
      .map(position => ({ position, distance: meeting.length ? Math.min(...meeting.map(target => manhattanDistance(position, target))) : Infinity }))
      .filter(candidate => candidate.distance < currentDistance)
      .sort((a, b) => a.distance - b.distance || a.position.y - b.position.y || a.position.x - b.position.x)[0]?.position;
    if (destination) return { type: 'move', unitId: infantry.id, destination };
  }

  // Carry cargo toward the closest remote objective. This is finite because it only accepts a strict
  // Manhattan-distance improvement; otherwise normal actions/end-turn take over.
  for (const transport of units.filter(unit => unit.kind === 'landingShip' && !unit.hasMoved && !unit.hasActed)) {
    if (!state.units.some(unit => unit.embarkedIn === transport.id)) continue;
    const target = nearestTarget(transport.position, targets);
    if (!target) continue;
    const currentDistance = manhattanDistance(transport.position, target);
    const destination = reachablePositionsForPlayer(state, transport.id, player)
      .filter(position => transportSafeAt(state, transport, position, visibleEnemies) && manhattanDistance(position, target) < currentDistance
        && !(terrainAt(state.board, position)?.kind === 'port' && terrainAt(state.board, position)?.owner !== player))
      .sort((a, b) => manhattanDistance(a, target) - manhattanDistance(b, target) || a.y - b.y || a.x - b.x)[0];
    if (destination) return { type: 'move', unitId: transport.id, destination };
  }
  // Return empty ships to stranded troops instead of waiting forever on the
  // island where the last passenger was dropped (or lost).
  for (const transport of units.filter(unit => unit.kind === 'landingShip' && !unit.hasMoved && !unit.hasActed
    && !state.units.some(candidate => candidate.embarkedIn === unit.id))) {
    const waiting = units.filter(unit => isEmbarkableUnit(unit.kind) && targets.some(target => !sameLandComponent(components, unit.position, target)));
    if (!waiting.length) continue;
    const distance = (position: Position) => Math.min(...waiting.map(unit => manhattanDistance(position, unit.position)));
    const destination = reachablePositionsForPlayer(state, transport.id, player)
      .filter(position => distance(position) < distance(transport.position))
      .sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)[0];
    if (destination) return { type: 'move', unitId: transport.id, destination };
  }
  return undefined;
}

function moveAction(state: GameState, player: PlayerId, config: CpuDifficultyConfig, context: CpuPlanningContext): CpuAction | undefined {
  const { targets } = context;
  if (!targets.length) return undefined;
  const evacuation = evacuationObjectives(state, player);
  for (const unit of coordinatedOrder(state, player, orderedUnits(state, player))) {
    if (unit.hasMoved || unit.hasActed) continue;
    const mission = evacuation.find(condition => condition.unitIds.includes(unit.id));
    if (mission) {
      const escape = moveToEvacuationExit(state, player, unit, mission);
      if (escape) return escape;
    }
    if (unit.kind === 'landingShip' && !mission && !state.units.some(candidate => candidate.embarkedIn === unit.id)) {
      const tile = terrainAt(state.board, unit.position);
      if (tile?.kind === 'port' && tile.owner === player) {
        const berth = reachablePositionsForPlayer(state, unit.id, player)
          .filter(position => terrainAt(state.board, position)?.kind === 'sea' && manhattanDistance(unit.position, position) <= 2)
          .sort((a, b) => manhattanDistance(a, unit.position) - manhattanDistance(b, unit.position) || a.y - b.y || a.x - b.x)[0];
        if (berth) return { type: 'move', unitId: unit.id, destination: berth };
      }
      return { type: 'wait', unitId: unit.id };
    }
    const openTargets = targets.filter(target => !state.units.some(ally => ally.owner === player && ally.id !== unit.id
      && isDeployedUnit(ally) && ally.position.x === target.x && ally.position.y === target.y));
    const assignedTargets = mission?.positions ?? (openTargets.length ? openTargets : targets);
    const scenario = scenarioForState(state);
    const conditions = player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions;
    const opposingConditions = player === 'red' ? scenario?.defeatConditions : scenario?.victoryConditions;
    const defending = conditions?.some(condition => condition.type === 'hold') || conditions?.every(condition => condition.type === 'survive')
      || opposingConditions?.some(condition => condition.type === 'hold');
    const combatTargets = assignedTargets.filter(target => {
      const tile = terrainAt(state.board, target);
      return tile?.kind === 'capital' && tile.owner !== undefined && tile.owner !== player
        || context.visibleEnemies.some(enemy => isDeployedUnit(enemy) && enemy.position.x === target.x && enemy.position.y === target.y);
    });
    const unitTargets = unitStats[unit.kind].capturePower > 0 || defending || !combatTargets.length ? assignedTargets : combatTargets;
    // Advance across the unit's whole movement range (Dijkstra reachability), weighing cover,
    // resupply and visible counterattack risk instead of raw distance alone.
    // Include the current position as an explicit wait order. Unlike a zero-cost
    // move, waiting is legal even when a ground unit has no fuel left.
    const destination = [unit.position, ...reachablePositionsForPlayer(state, unit.id, player)]
      .filter(position => transportSafeAt(state, unit, position, context.visibleEnemies))
      .map(position => ({ position, score: evaluateCpuPosition(state, player, unit, position, unitTargets, config, context.visibleEnemies) }))
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
    if (unit.hasMoved || unit.hasActed || !hasUsableWeapon(state, unit, true)) continue;
    const directWeapons = weaponsForUnit(unit.kind, state).filter((weapon, slot) => !weapon.indirect && weaponAmmo(unit, slot as WeaponSlot) > 0);
    const maximumRange = Math.max(...directWeapons.map(weapon => weapon.range[1]));
    const targets = visibleTargets.filter((target): target is DeployedUnit => isDeployedUnit(target)
      && manhattanDistance(unit.position, target.position) <= stats.movement + maximumRange);
    if (!targets.length) continue;
    // Units with another job (capturing, supplying, resupplying, holding the
    // capital against a visible capturer) leave it only for a finishing blow.
    const finishingOnly = config.strikePlanning === 'lethal' || stats.indirect || stats.capturePower > 0 || isSupplyUnit(unit.kind) || needsSupply(unit)
      || guardsCapital(state, player, unit, visibleTargets);
    for (const destination of reachablePositionsForPlayer(state, unit.id, player)) {
      const inRange = targets.filter(target => {
        const distance = manhattanDistance(destination, target.position);
        return directWeapons.some(weapon => distance >= weapon.range[0] && distance <= weapon.range[1]);
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
          + (isPriorityTarget(state, player, target) ? STRIKE_OBJECTIVE_BONUS : 0)
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
/** Prefer opening an authored mission objective over an otherwise similar trade. */
const STRIKE_OBJECTIVE_BONUS = 1200;
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
  const action = chooseOrientedCpuAction(player === 'blue' ? bluePlanningState(state) : state, difficulty, player);
  if (player !== 'blue') return action;
  if (action.type === 'move' || action.type === 'disembark') return { ...action, destination: rotatePosition(action.destination, state.board) };
  if (action.type === 'produce') return { ...action, factory: rotatePosition(action.factory, state.board) };
  if (action.type === 'recon') return { ...action, center: rotatePosition(action.center, state.board) };
  return action;
}

/** Open a chain of friendly blockers so a capturer can reach its objective. */
function clearCaptureLane(state: GameState, player: PlayerId, blocker: DeployedUnit, allies: readonly DeployedUnit[]): CpuAction | undefined {
  const queue = [blocker];
  const seen = new Set([blocker.id]);
  for (let index = 0; index < queue.length; index++) {
    const unit = queue[index]!;
    const distance = manhattanDistance(unit.position, blocker.position);
    const destination = reachablePositionsForPlayer(state, unit.id, player)
      .filter(position => manhattanDistance(position, unit.position) === 1
        && manhattanDistance(position, blocker.position) > distance
        && !isPropertyTerrainKind(terrainAt(state.board, position)?.kind ?? 'plain'))
      .sort((a, b) => a.y - b.y || a.x - b.x)[0];
    if (destination) return { type: 'move', unitId: unit.id, destination };
    for (const ally of allies) {
      if (seen.has(ally.id) || ally.hasMoved || ally.hasActed || !isAdjacent(unit.position, ally.position)
        || !Number.isFinite(movementCost(state.board, ally.position, unit.kind))) continue;
      seen.add(ally.id);
      queue.push(ally);
    }
  }
  return undefined;
}

/** Reaching an exit permits evacuation immediately, before any enemy response. */
function moveToEvacuationExit(state: GameState, player: PlayerId, unit: DeployedUnit, condition: EvacuationCondition): CpuAction | undefined {
  if (state.units.some(candidate => candidate.embarkedIn === unit.id)) return undefined;
  const destination = reachablePositionsForPlayer(state, unit.id, player)
    .find(position => condition.positions.some(exit => exit.x === position.x && exit.y === position.y));
  return destination && { type: 'move', unitId: unit.id, destination };
}

function evacuationAction(state: GameState, player: PlayerId, config: CpuDifficultyConfig, context: CpuPlanningContext): CpuAction | undefined {
  const exits = evacuationObjectives(state, player);
  if (!exits.length) return undefined;
  const withdrawing = new Map<(typeof exits)[number], Set<string>>();
  for (const condition of exits) {
    if (condition.type !== 'withdraw') continue;
    const escaped = (state.evacuatedUnits ?? []).filter(unit => unit.owner === player && condition.unitIds.includes(unit.id)).length;
    const candidates = state.units.filter(unit => unit.owner === player && condition.unitIds.includes(unit.id));
    const distance = (unit: Unit) => {
      const position = unit.position ?? state.units.find(transport => transport.id === unit.embarkedIn)?.position;
      return position ? Math.min(...condition.positions.map(exit => manhattanDistance(position, exit))) : Infinity;
    };
    candidates.sort((a, b) => distance(a) - distance(b) || unitIdOrder.compare(a.id, b.id));
    withdrawing.set(condition, new Set(candidates.slice(0, Math.max(0, condition.required - escaped)).map(unit => unit.id)));
  }
  for (const unit of orderedUnits(state, player)) {
    if (canEvacuateUnit(state, unit.id)) return { type: 'evacuate', unitId: unit.id };
    if (unit.hasMoved || unit.hasActed) continue;
    // Escort targets follow the normal front/support order. A withdrawal sends
    // only the required nearest survivors first, leaving spare units able to fight.
    const condition = exits.find(candidate => withdrawing.get(candidate)?.has(unit.id));
    if (!condition) continue;
    const escape = moveToEvacuationExit(state, player, unit, condition);
    if (escape) return escape;
    const destination = [unit.position, ...reachablePositionsForPlayer(state, unit.id, player)]
      .filter(position => transportSafeAt(state, unit, position, context.visibleEnemies))
      .map(position => ({ position, score: evaluateCpuPosition(state, player, unit, position, condition.positions, config, context.visibleEnemies)
        // Under v7, new sight must not tempt withdrawing units into firing or service positions away from their exit.
        - (usesReconRules(state) ? Math.min(...condition.positions.map(exit => manhattanDistance(position, exit))) * 100 : 0) }))
      .sort((a, b) => b.score - a.score || a.position.y - b.position.y || a.position.x - b.position.x)[0]?.position;
    if (destination && (destination.x !== unit.position.x || destination.y !== unit.position.y)) return { type: 'move', unitId: unit.id, destination };
    if (usesReconRules(state)) {
      const exitDistance = (p: Position) => Math.min(...condition.positions.map(exit => manhattanDistance(p, exit)));
      const blocker = orderedUnits(state, player).find(ally => ally.id !== unit.id && !ally.hasMoved && !ally.hasActed
        && isAdjacent(ally.position, unit.position) && exitDistance(ally.position) < exitDistance(unit.position));
      if (blocker) {
        const clear = clearCaptureLane(state, player, blocker, orderedUnits(state, player));
        if (clear) return clear;
      }
    }
  }
  return undefined;
}

/** Unjam a port's one-tile mouth so a returning ship can reload there. */
function clearNavalServiceLane(state: GameState, player: PlayerId, units: readonly DeployedUnit[]): CpuAction | undefined {
  if (!usesOperationsRules(state)) return undefined;
  for (const unit of units) {
    if (unitCategory[unit.kind] !== 'sea' || unit.hasMoved || unit.hasActed || !needsSupply(unit)) continue;
    const blocker = units.find(ally => ally.id !== unit.id && !ally.hasMoved && !ally.hasActed && !needsSupply(ally)
      && isAdjacent(unit.position, ally.position) && terrainAt(state.board, ally.position)?.kind === 'port'
      && terrainAt(state.board, ally.position)?.owner === player);
    if (!blocker) continue;
    const clear = clearCaptureLane(state, player, blocker, units);
    if (clear) return clear;
  }
  return undefined;
}

function engineeringAction(state: GameState, player: PlayerId, context: CpuPlanningContext): CpuAction | undefined {
  if (!usesFrontlineRules(state)) return undefined;
  // Only establish cover near a public objective and a confirmed approaching enemy.
  // Captures and attacks have priority; repeated rebuilding cannot delay progress.
  const scenario = scenarioForState(state);
  const publicTargets = scenario ? [...scenario.victoryConditions, ...scenario.defeatConditions].flatMap(condition => condition.type === 'control' || condition.type === 'hold' ? condition.positions : []) : [];
  const sites = publicTargets.length ? publicTargets : state.board.terrain.flatMap((row, y) => row.flatMap((tile, x) => tile.kind === 'supplyDepot' ? [{ x, y }] : []));
  const engineer = orderedUnits(state, player).find(unit => !fortificationError(state, unit.id)
    && sites.some(target => manhattanDistance(unit.position, target) <= 2)
    && context.visibleEnemies.some(enemy => isDeployedUnit(enemy) && manhattanDistance(unit.position, enemy.position) >= 2
      && manhattanDistance(unit.position, enemy.position) <= 5)
    && !orderedUnits(state, player).some(ally => ally.id !== unit.id && ally.hasMoved === false
      && manhattanDistance(ally.position, unit.position) === 1 && unitStats[ally.kind].capturePower > 0));
  return engineer ? { type: 'fortify', unitId: engineer.id } : undefined;
}

function chooseOrientedCpuAction(state: GameState, difficulty: CpuDifficulty, player: PlayerId): CpuAction {
  if (state.winner || player !== state.activePlayer) return { type: 'endTurn' };
  state = observeLogistics(state, player);
  // Never abandon a win secured by ending this turn (notably a completed hold
  // objective) in order to seek an optional attack or move.
  if (endTurn(state).winner === player) return { type: 'endTurn' };
  const config = cpuDifficultyConfig[difficulty];
  const readyUnits = orderedUnits(state, player);
  const replacementFor = (unit: DeployedUnit) => readyUnits.some(ally => ally.id !== unit.id && unitStats[ally.kind].capturePower > 0
    && !ally.hasMoved && !ally.hasActed && ally.hp >= Math.max(60, unit.hp + 30)
    && manhattanDistance(ally.position, unit.position) <= unitStats[ally.kind].movement);
  const capture = readyUnits.find(unit => !isEvacuationTarget(state, unit.id, player) && canCapture(state, unit) && (unit.hp >= 35 || !replacementFor(unit)));
  if (capture) return { type: 'capture', unitId: capture.id };
  const scan = chooseReconCenter(state, player);
  if (scan) return { type: 'recon', center: scan };
  const context = createCpuPlanningContext(state, player, config);
  const evacuation = evacuationAction(state, player, config, context);
  if (evacuation) return evacuation;
  const capturers = orderedUnits(state, player).filter(unit => unitStats[unit.kind].capturePower > 0 && !unit.hasActed);
  const obstructing = readyUnits.filter(unit => !unit.hasActed && !unit.hasMoved
    && terrainAt(state.board, unit.position)?.owner !== player
    && isPropertyTerrainKind(terrainAt(state.board, unit.position)?.kind ?? 'plain')
    && (unitStats[unit.kind].capturePower === 0
      && capturers.some(ally => manhattanDistance(ally.position, unit.position) <= unitStats[ally.kind].movement)
      || unit.hp < 35 && canCapture(state, unit) && replacementFor(unit)))
    .sort((a, b) => Number(terrainAt(state.board, b.position)?.kind === 'capital') - Number(terrainAt(state.board, a.position)?.kind === 'capital'))[0];
  if (obstructing) {
    const destination = reachablePositionsForPlayer(state, obstructing.id, player)
      .filter(position => manhattanDistance(position, obstructing.position) === 1)
      .sort((a, b) => evaluateCpuPosition(state, player, obstructing, b, context.targets, config, context.visibleEnemies)
        - evaluateCpuPosition(state, player, obstructing, a, context.targets, config, context.visibleEnemies))[0];
    if (destination) return { type: 'move', unitId: obstructing.id, destination };
    const clear = clearCaptureLane(state, player, obstructing, readyUnits);
    if (clear) return clear;
  }
  return attackAction(state, player, config, context.visibleEnemies)
    ?? strikeAction(state, player, config, context.visibleEnemies)
    ?? engineeringAction(state, player, context)
    ?? mergeAction(state, player)
    ?? clearNavalServiceLane(state, player, readyUnits)
    ?? transportAction(state, player, context.targets, context.landComponents, context.visibleEnemies)
    ?? productionAction(state, player, config, context)
    ?? moveAction(state, player, config, context)
    ?? { type: 'endTurn' };
}

/** Merge badly damaged peers only when no immediate attack was selected. */
function mergeAction(state: GameState, player: PlayerId): CpuAction | undefined {
  const damaged = orderedUnits(state, player).filter(unit => !unit.hasActed && unit.hp <= 50 && isMergeableUnit(unit.kind) && !isEvacuationTarget(state, unit.id, player));
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
  return { action, reason: action.type, role: unit ? cpuRole(observed, player, unit.id) : undefined, visibleEnemies: context.visibleEnemies.length, evaluation };
}
