import { forecastCombat, terrainDefenseReduction } from '../game/combat';
import { reachablePositionsForPlayer } from '../game/commands';
import { canProduceUnit, isPropertyTerrainKind, productionKindsForRule, unitLimit } from '../game/facilities';
import { visibleEnemies as getVisibleEnemies } from '../game/fog';
import { scenarioById } from '../game/maps';
import { manhattanDistance, movementCost, terrainAt } from '../game/terrain';
import { isDeployedUnit, usesDecisionRules, usesModernRules, type Board, type DeployedUnit, type GameState, type PlayerId, type Position, type Unit, type UnitKind } from '../game/types';
import { adjacentToSupplyUnit, isGroundUnit, isServiceTile, REPAIR_HP_PER_TURN } from '../game/logistics';
import { isEmbarkableUnit, isSupplyUnit, unitCategory, unitStats } from '../game/units';

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
}

export const cpuDifficultyConfig: Record<CpuDifficulty, CpuDifficultyConfig> = {
  // Easy CPUs push toward objectives and only weakly account for cover and threat.
  easy: { attackSafetyMargin: 20, prioritizeCapital: false, threatAvoidanceWeight: 0.35, terrainDefenseWeight: 0.5, objectiveDistanceWeight: 8, lowHpRetreatWeight: 0.25 },
  normal: { attackSafetyMargin: 0, prioritizeCapital: true, threatAvoidanceWeight: 1, terrainDefenseWeight: 1, objectiveDistanceWeight: 6, lowHpRetreatWeight: 1 },
  // Hard CPUs take calculated combat risks, but preserve damaged units and value cover.
  hard: { attackSafetyMargin: -15, prioritizeCapital: true, threatAvoidanceWeight: 1.6, terrainDefenseWeight: 1.35, objectiveDistanceWeight: 4, lowHpRetreatWeight: 2 },
};

export type CpuAction =
  | { type: 'capture'; unitId: string }
  | { type: 'attack'; unitId: string; targetId: string }
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
  return result.value.damageToDefender >= target.hp
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
        const lethal = Number(bForecast.ok && bForecast.value.damageToDefender >= b.hp) - Number(aForecast.ok && aForecast.value.damageToDefender >= a.hp);
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
      const productionRule = scenarioById(state.scenarioId)?.productionRules ?? 'legacy-factory-air';
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

/** Whether the CPU's own force is at its production limit. */
function atForceLimit(state: GameState, player: PlayerId): boolean {
  return state.units.filter(unit => unit.owner === player).length >= cpuForceLimit(state.board);
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
  // Transports and counters to confirmed threats are bounded one-of-a-kind orders;
  // only the bulk force mix stops at the limit.
  if (atForceLimit(state, player)) return undefined;
  const kind = preferredProduction(state, player);
  if (!kind) return undefined;
  const factory = emptyOwnedFacility(state, player, kind);
  return factory ? { type: 'produce', factory, kind } : undefined;
}

function objectives(state: GameState, player: PlayerId, config: CpuDifficultyConfig, visibleEnemies: readonly Unit[]): Position[] {
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
  const blocking = !needsSupply(unit) && unit.hp > 50 && blocksProduction(state, player, destination, knownEnemies) ? FACILITY_BLOCK_PENALTY : 0;
  const logistics = supplyVehicleValue(state, player, unit, destination);
  return defense + supply + response + retreatCover + logistics
    - distance * config.objectiveDistanceWeight
    - pressure * config.threatAvoidanceWeight * (1 - stalemateRelief(state))
    - retreatPressure
    - blocking;
}

/** Outweighs a three-star facility's cover so idle units step off production sites. */
export const FACILITY_BLOCK_PENALTY = 45;

/** Whether ending on `position` would occupy one of `player`'s production facilities. */
function blocksProduction(state: GameState, player: PlayerId, position: Position, knownEnemies: readonly Unit[]): boolean {
  const tile = terrainAt(state.board, position);
  if (tile?.owner !== player || atForceLimit(state, player)) return false;
  const productionRule = scenarioById(state.scenarioId)?.productionRules ?? 'legacy-factory-air';
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

/** Build immutable, fog-safe data once for the current CPU order. */
export function createCpuPlanningContext(state: GameState, player: PlayerId, config: CpuDifficultyConfig): CpuPlanningContext {
  const visibleEnemies = getVisibleEnemies(state, player);
  return { visibleEnemies, targets: objectives(state, player, config, visibleEnemies), landComponents: landComponents(state.board) };
}

/** Select the next legal high-level CPU order. The caller applies it with the game command layer. */
export function chooseCpuAction(state: GameState, difficulty: CpuDifficulty = 'normal', player: PlayerId = state.activePlayer): CpuAction {
  if (state.winner || player !== state.activePlayer) return { type: 'endTurn' };
  const config = cpuDifficultyConfig[difficulty];
  const capture = orderedUnits(state, player).find(unit => canCapture(state, unit));
  if (capture) return { type: 'capture', unitId: capture.id };
  const context = createCpuPlanningContext(state, player, config);
  return attackAction(state, player, config, context.visibleEnemies)
    ?? transportAction(state, player, context.targets, context.landComponents, context.visibleEnemies)
    ?? productionAction(state, player, config, context)
    ?? moveAction(state, player, config, context)
    ?? { type: 'endTurn' };
}
