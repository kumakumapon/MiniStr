import { evacuationObjectives } from '../game/evacuation';
import { manhattanDistance } from '../game/terrain';
import { isDeployedUnit, usesOperationsRules, type DeployedUnit, type GameState, type PlayerId, type Position, type Unit } from '../game/types';
import { isSupplyUnit, unitCategory, unitStats } from '../game/units';

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

/** Front units move first; support then follows their actual updated positions. */
export function coordinatedOrder(state: GameState, player: PlayerId, units: readonly DeployedUnit[]): DeployedUnit[] {
  if (!usesOperationsRules(state)) return [...units];
  const plan = teamPlan(state, player);
  const priority: Record<CpuRole, number> = { frontline: 0, fireSupport: 1, airDefence: 2, supply: 3, transport: 4, mission: 5 };
  return [...units].sort((a, b) => priority[plan.roles.get(a.id)!] - priority[plan.roles.get(b.id)!]);
}

/** Small positional incentives preserve the existing capture, fire and resupply priorities. */
export function coordinationValue(state: GameState, player: PlayerId, unit: DeployedUnit, destination: Position, targets: readonly Position[]): number {
  if (!usesOperationsRules(state)) return 0;
  const plan = teamPlan(state, player);
  const role = plan.roles.get(unit.id);
  if (!targets.length || role === 'mission') return 0;
  let anchor = plan.anchors.get(unit.id);
  if (!anchor) {
    anchor = plan.frontline
      .filter(
        (ally) =>
          ally.id !== unit.id &&
          (unitCategory[unit.kind] === 'sea' ? unitCategory[ally.kind] === 'sea' : unitCategory[ally.kind] !== 'sea') &&
          (!isSupplyUnit(unit.kind) || unitCategory[ally.kind] !== 'air'),
      )
      .sort((a, b) => manhattanDistance(a.position, unit.position) - manhattanDistance(b.position, unit.position))[0];
    if (!anchor) return 0;
    plan.anchors.set(unit.id, anchor);
  }
  const targetDistance = (position: Position) => Math.min(...targets.map((target) => manhattanDistance(position, target)));
  const gap = manhattanDistance(destination, anchor.position);
  const behind = targetDistance(destination) >= targetDistance(anchor.position);
  if (role === 'supply' || role === 'fireSupport' || role === 'airDefence') {
    return Math.max(-18, 12 - Math.abs(gap - 2) * 5) + (behind ? 4 : -12);
  }
  // Combat units can still break through; a dispersed formation merely gives
  // a modest preference to another equally good route near a friendly unit.
  return Math.max(-8, 4 - Math.max(0, gap - 3) * 2);
}

/** Loaded transports avoid confirmed threats until an armed escort can cover the move. */
export function transportSafeAt(state: GameState, transport: DeployedUnit, destination: Position, visibleEnemies: readonly Unit[]): boolean {
  if (!usesOperationsRules(state)) return true;
  const plan = teamPlan(state, transport.owner);
  if (!plan.protectedIds.has(transport.id) && !plan.loaded.has(transport.id)) return true;
  const threatened = visibleEnemies.some(
    (enemy) =>
      isDeployedUnit(enemy) &&
      unitStats[enemy.kind].attack > 0 &&
      manhattanDistance(enemy.position, destination) <= unitStats[enemy.kind].range[1] + Math.min(2, unitStats[enemy.kind].movement),
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
      manhattanDistance(ally.position, destination) <= 3,
  );
}
