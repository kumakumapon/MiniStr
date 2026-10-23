import { SUPPLY_CAPACITY, supplyStock } from '../game/supplyStock';
import { isEvacuationCondition, scenarioForState, type ScenarioDefinition } from '../game/maps';
import { manhattanDistance, positionKey } from '../game/terrain';
import { isDeployedUnit, usesFiniteSupplyRules, usesOperationsRules, type DeployedUnit, type GameState, type PlayerId, type Position, type Unit } from '../game/types';
import { damageMultiplier, isSupplyUnit, unitCategory, unitStats } from '../game/units';

export type CpuRole = 'frontline' | 'fireSupport' | 'supply' | 'airDefence' | 'transport' | 'mission';

interface TeamPlan {
  roles: Map<string, CpuRole>;
  frontline: DeployedUnit[];
  protectedIds: Set<string>;
  loaded: Set<string>;
  anchors: Map<string, DeployedUnit | null>;
}
const plans = new WeakMap<GameState, Map<PlayerId, TeamPlan>>();

interface MissionPlan {
  missionIds: Set<string>;
  protectedIds: Set<string>;
  exits: Map<string, Set<string>>;
  objectivePositions: Set<string>;
  opposingIds: Set<string>;
}
const emptyMission: MissionPlan = { missionIds: new Set(), protectedIds: new Set(), exits: new Map(), objectivePositions: new Set(), opposingIds: new Set() };
const missions = new WeakMap<ScenarioDefinition, Map<PlayerId, MissionPlan>>();

/** Authored orders stay immutable for the whole match, including across waits. */
function missionPlan(state: GameState, player: PlayerId): MissionPlan {
  if (!usesOperationsRules(state)) return emptyMission;
  const scenario = scenarioForState(state);
  if (!scenario) return emptyMission;
  let players = missions.get(scenario);
  if (!players) {
    players = new Map();
    missions.set(scenario, players);
  }
  const cached = players.get(player);
  if (cached) return cached;
  const own = player === 'red' ? scenario.victoryConditions : scenario.defeatConditions;
  const opposing = player === 'red' ? scenario.defeatConditions : scenario.victoryConditions;
  const objectives = own.filter(isEvacuationCondition);
  const exits = new Map<string, Set<string>>();
  for (const condition of objectives)
    for (const position of condition.positions) {
      const key = positionKey(position);
      const ids = exits.get(key) ?? new Set<string>();
      for (const id of condition.unitIds) ids.add(id);
      exits.set(key, ids);
    }
  const plan: MissionPlan = {
    missionIds: new Set(objectives.flatMap((condition) => condition.unitIds)),
    protectedIds: new Set(objectives.filter((condition) => condition.type === 'escort').flatMap((condition) => condition.unitIds)),
    exits,
    objectivePositions: new Set(
      own.flatMap((condition) => (condition.type === 'hold' || condition.type === 'control' || isEvacuationCondition(condition) ? condition.positions.map(positionKey) : [])),
    ),
    opposingIds: new Set(opposing.filter(isEvacuationCondition).flatMap((condition) => condition.unitIds)),
  };
  players.set(player, plan);
  return plan;
}

function teamPlan(state: GameState, player: PlayerId): TeamPlan {
  let players = plans.get(state);
  if (!players) {
    players = new Map();
    plans.set(state, players);
  }
  const cached = players.get(player);
  if (cached) return cached;
  const { missionIds: mission, protectedIds } = missionPlan(state, player);
  const loaded = new Set(state.units.filter((unit) => unit.owner === player && unit.embarkedIn !== undefined).map((unit) => unit.embarkedIn!));
  const own = state.units.filter((unit): unit is DeployedUnit => unit.owner === player && isDeployedUnit(unit));
  const roles = new Map(
    own.map(
      (unit) =>
        [
          unit.id,
          mission.has(unit.id)
            ? 'mission'
            : unit.kind === 'landingShip'
              ? 'transport'
              : isSupplyUnit(unit.kind)
                ? 'supply'
                : unit.kind === 'antiAir' || unit.kind === 'fighter'
                  ? 'airDefence'
                  : unitStats[unit.kind].indirect
                    ? 'fireSupport'
                    : 'frontline',
        ] as const,
    ),
  );
  const frontline = own.filter((unit) => roles.get(unit.id) === 'frontline' && unit.hp >= 40);
  const plan = { roles, frontline, protectedIds, loaded, anchors: new Map<string, DeployedUnit | null>() };
  players.set(player, plan);
  return plan;
}

export function cpuRole(state: GameState, player: PlayerId, unitId: string): CpuRole | undefined {
  return teamPlan(state, player).roles.get(unitId);
}

/** Public mission orders prioritize confirmed defenders and opposing evacuees. */
export function isPriorityTarget(state: GameState, player: PlayerId, target: Unit): boolean {
  if (!usesOperationsRules(state) || target.owner === player || !isDeployedUnit(target)) return false;
  const plan = missionPlan(state, player);
  return plan.objectivePositions.has(positionKey(target.position)) || plan.opposingIds.has(target.id);
}

/** Front units move first; support then follows their actual updated positions. */
export function coordinatedOrder(state: GameState, player: PlayerId, units: readonly DeployedUnit[]): DeployedUnit[] {
  if (!usesOperationsRules(state)) return [...units];
  const plan = teamPlan(state, player);
  const priority: Record<CpuRole, number> = { frontline: 0, fireSupport: 1, airDefence: 2, supply: 3, transport: 4, mission: 5 };
  // Naval guns and escorts already use firing and landing routes. Keep their
  // existing slots and order rather than fitting them into a land formation.
  const land = units.filter((unit) => unitCategory[unit.kind] !== 'sea').sort((a, b) => priority[plan.roles.get(a.id)!] - priority[plan.roles.get(b.id)!]);
  let index = 0;
  return units.map((unit) => (unitCategory[unit.kind] === 'sea' ? unit : land[index++]!));
}

/** Small positional incentives preserve the existing capture, fire and resupply priorities. */
export function coordinationValue(state: GameState, player: PlayerId, unit: DeployedUnit, destination: Position, targets: readonly Position[]): number {
  if (!usesOperationsRules(state)) return 0;
  const exits = missionPlan(state, player).exits.get(positionKey(destination));
  // Support should cover the exit from nearby tiles, leaving its single unit
  // slot available for the designated evacuees.
  if (exits && !exits.has(unit.id)) return -150;
  if (unitCategory[unit.kind] === 'sea' || (usesFiniteSupplyRules(state) && isSupplyUnit(unit.kind) && supplyStock(unit) <= SUPPLY_CAPACITY / 3)) return 0;
  const plan = teamPlan(state, player);
  const role = plan.roles.get(unit.id);
  if (!targets.length || role === 'mission' || role === 'frontline') return 0;
  let anchor = plan.anchors.get(unit.id);
  if (anchor === null) return 0;
  if (!anchor) {
    anchor = plan.frontline
      .filter((ally) => ally.id !== unit.id && unitCategory[ally.kind] !== 'sea' && (!isSupplyUnit(unit.kind) || unitCategory[ally.kind] !== 'air'))
      .sort((a, b) => manhattanDistance(a.position, unit.position) - manhattanDistance(b.position, unit.position))[0];
    if (!anchor) {
      plan.anchors.set(unit.id, null);
      return 0;
    }
    plan.anchors.set(unit.id, anchor);
  }
  const targetDistance = (position: Position) => Math.min(...targets.map((target) => manhattanDistance(position, target)));
  const gap = manhattanDistance(destination, anchor.position);
  const behind = targetDistance(destination) >= targetDistance(anchor.position);
  return Math.max(-18, 12 - Math.abs(gap - 2) * 5) + (behind ? 4 : -12);
}

/** Loaded transports avoid confirmed threats until an armed escort can cover the move. */
export function transportSafeAt(state: GameState, transport: DeployedUnit, destination: Position, visibleEnemies: readonly Unit[]): boolean {
  if (!usesOperationsRules(state)) return true;
  const plan = teamPlan(state, transport.owner);
  const protectedTarget = plan.protectedIds.has(transport.id);
  const missionTarget = plan.roles.get(transport.id) === 'mission';
  if (!missionTarget && !plan.loaded.has(transport.id)) return true;
  let incoming = 0;
  for (const enemy of visibleEnemies) {
    if (!isDeployedUnit(enemy)) continue;
    const potential = (unitStats[enemy.kind].attack * damageMultiplier[enemy.kind][unitCategory[transport.kind]] * enemy.hp) / 100;
    if (
      potential < (missionTarget ? Math.min(30, transport.hp) : 30) ||
      manhattanDistance(enemy.position, destination) > unitStats[enemy.kind].range[1] + (unitStats[enemy.kind].indirect ? 0 : Math.min(2, unitStats[enemy.kind].movement))
    )
      continue;
    incoming += potential;
    if (!missionTarget) break;
  }
  if (missionTarget && incoming >= transport.hp) return false;
  const threatened = incoming > 0;
  if (!threatened && !protectedTarget) return true;
  const escorts = state.units.filter(
    (ally): ally is DeployedUnit =>
      ally.owner === transport.owner &&
      ally.id !== transport.id &&
      isDeployedUnit(ally) &&
      unitStats[ally.kind].attack > 0 &&
      ally.hp >= 40 &&
      (unitCategory[transport.kind] === 'sea' ? unitCategory[ally.kind] === 'sea' || unitCategory[ally.kind] === 'air' : unitCategory[ally.kind] !== 'sea'),
  );
  // An escort convoy must not outrun its own guards merely because the next
  // enemy is still in fog. An isolated survivor can proceed when no threat is known.
  if (!threatened && !escorts.length) return true;
  return escorts.some((ally) => manhattanDistance(ally.position, destination) <= Math.max(3, unitStats[ally.kind].range[1]));
}
