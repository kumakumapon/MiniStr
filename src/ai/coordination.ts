import { evacuationObjectives } from '../game/evacuation';
import { isEvacuationCondition, scenarioForState } from '../game/maps';
import { manhattanDistance } from '../game/terrain';
import { isDeployedUnit, usesOperationsRules, type DeployedUnit, type GameState, type PlayerId, type Position, type Unit } from '../game/types';
import { damageMultiplier, isSupplyUnit, unitCategory, unitStats } from '../game/units';

export type CpuRole = 'frontline' | 'fireSupport' | 'supply' | 'airDefence' | 'transport' | 'mission';

interface TeamPlan {
  roles: Map<string, CpuRole>;
  frontline: DeployedUnit[];
  protectedIds: Set<string>;
  loaded: Set<string>;
  anchors: Map<string, DeployedUnit>;
}
const plans = new WeakMap<GameState, Map<PlayerId, TeamPlan>>();

function teamPlan(state: GameState, player: PlayerId): TeamPlan {
  let players = plans.get(state);
  if (!players) {
    players = new Map();
    plans.set(state, players);
  }
  const cached = players.get(player);
  if (cached) return cached;
  const objectives = evacuationObjectives(state, player);
  const mission = new Set(objectives.flatMap((condition) => condition.unitIds));
  const protectedIds = new Set(objectives.filter((condition) => condition.type === 'escort').flatMap((condition) => condition.unitIds));
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
  const plan = { roles, frontline, protectedIds, loaded, anchors: new Map<string, DeployedUnit>() };
  players.set(player, plan);
  return plan;
}

export function cpuRole(state: GameState, player: PlayerId, unitId: string): CpuRole | undefined {
  return teamPlan(state, player).roles.get(unitId);
}

/** Public mission orders prioritize confirmed defenders and opposing evacuees. */
export function isPriorityTarget(state: GameState, player: PlayerId, target: Unit): boolean {
  if (!usesOperationsRules(state) || target.owner === player || !isDeployedUnit(target)) return false;
  const scenario = scenarioForState(state);
  const own = player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions;
  const opposing = player === 'red' ? scenario?.defeatConditions : scenario?.victoryConditions;
  return (
    !!own?.some(
      (condition) =>
        (condition.type === 'hold' || isEvacuationCondition(condition)) &&
        condition.positions.some((position) => position.x === target.position.x && position.y === target.position.y),
    ) || !!opposing?.some((condition) => isEvacuationCondition(condition) && condition.unitIds.includes(target.id))
  );
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
  const exits = evacuationObjectives(state, player).filter((condition) => condition.positions.some((exit) => exit.x === destination.x && exit.y === destination.y));
  // Support should cover the exit from nearby tiles, leaving its single unit
  // slot available for the designated evacuees.
  if (exits.length && !exits.some((condition) => condition.unitIds.includes(unit.id))) return -150;
  if (unitCategory[unit.kind] === 'sea') return 0;
  const plan = teamPlan(state, player);
  const role = plan.roles.get(unit.id);
  if (!targets.length || role === 'mission' || role === 'frontline') return 0;
  let anchor = plan.anchors.get(unit.id);
  if (!anchor) {
    anchor = plan.frontline
      .filter((ally) => ally.id !== unit.id && unitCategory[ally.kind] !== 'sea' && (!isSupplyUnit(unit.kind) || unitCategory[ally.kind] !== 'air'))
      .sort((a, b) => manhattanDistance(a.position, unit.position) - manhattanDistance(b.position, unit.position))[0];
    if (!anchor) return 0;
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
  if (!plan.protectedIds.has(transport.id) && !plan.loaded.has(transport.id)) return true;
  const threatened = visibleEnemies.some(
    (enemy) =>
      isDeployedUnit(enemy) &&
      (unitStats[enemy.kind].attack * damageMultiplier[enemy.kind][unitCategory[transport.kind]] * enemy.hp) / 100 >= 30 &&
      manhattanDistance(enemy.position, destination) <= unitStats[enemy.kind].range[1] + (unitStats[enemy.kind].indirect ? 0 : Math.min(2, unitStats[enemy.kind].movement)),
  );
  if (!threatened) return true;
  return state.units.some(
    (ally) =>
      ally.owner === transport.owner &&
      ally.id !== transport.id &&
      isDeployedUnit(ally) &&
      unitStats[ally.kind].attack > 0 &&
      ally.hp >= 40 &&
      (unitCategory[transport.kind] === 'sea' ? unitCategory[ally.kind] === 'sea' || unitCategory[ally.kind] === 'air' : unitCategory[ally.kind] !== 'sea') &&
      manhattanDistance(ally.position, destination) <= Math.max(3, unitStats[ally.kind].range[1]),
  );
}
