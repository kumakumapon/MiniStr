import { movementCosts, reachablePositionsForPlayer } from '../game/commands';
import { canEvacuateUnit, evacuationObjectives, isEvacuationTarget } from '../game/evacuation';
import { isPropertyTerrainKind } from '../game/facilities';
import { scenarioForState } from '../game/maps';
import { groundUnit, tacticalEnabled, zocTiles } from '../game/tactics';
import { manhattanDistance, positionKey, samePosition, terrainAt, unitMovementCost } from '../game/terrain';
import { isDeployedUnit, type DeployedUnit, type GameState, type PlayerId, type Position, type Unit } from '../game/types';
import { missionLaneSafeAt, usesMissionSafety } from './missionSafety';
import type { CpuAction } from './rules';

const neighbors = (p: Position): Position[] => [
  { x: p.x - 1, y: p.y },
  { x: p.x + 1, y: p.y },
  { x: p.x, y: p.y - 1 },
  { x: p.x, y: p.y + 1 },
];

/** Clear only an escorted supply unit's same-turn exit route. Never execute a hypothetical move. */
export function clearMissionExit(state: GameState, player: PlayerId, knownEnemies: readonly Unit[]): CpuAction | undefined {
  const own = state.units.filter((unit): unit is DeployedUnit => unit.owner === player && isDeployedUnit(unit));
  // Withdrawal already has its own required-survivor order. Preserve it rather
  // than letting this escort fix send a support unit ahead of those survivors.
  const escorts = evacuationObjectives(state, player).filter((condition) => condition.type === 'escort');
  const targets = own
    .filter(
      (unit) =>
        !unit.hasActed &&
        escorts.some((condition) => condition.unitIds.includes(unit.id)) &&
        usesMissionSafety(state, unit) &&
        !state.units.some((ally) => ally.embarkedIn === unit.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  if (!targets.length) return;
  // Hypothetical relocation must not discover hidden contacts or private resources.
  const known = new Set(knownEnemies.map((unit) => unit.id));
  state = { ...state, units: state.units.filter((unit) => unit.owner === player || known.has(unit.id)) };
  const scenario = scenarioForState(state);
  const conditions = player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions;
  const posts = conditions?.flatMap((condition) => (condition.type === 'hold' || condition.type === 'control' ? condition.positions : [])) ?? [];
  const movable = own.filter(
    (unit) =>
      !unit.hasMoved &&
      !unit.hasActed &&
      !isEvacuationTarget(state, unit.id, player) &&
      !state.units.some((ally) => ally.embarkedIn === unit.id) &&
      !isPropertyTerrainKind(terrainAt(state.board, unit.position)?.kind ?? 'plain') &&
      !posts.some((post) => samePosition(post, unit.position)),
  );
  const movableIds = new Set(movable.map((unit) => unit.id));
  for (const target of targets) {
    if (canEvacuateUnit(state, target.id)) return { type: 'evacuate', unitId: target.id };
    if (target.hasMoved) continue;
    const exits = evacuationObjectives(state, player)
      .filter((condition) => condition.unitIds.includes(target.id))
      .flatMap((condition) => condition.positions);
    const actual = movementCosts(state, target.id);
    const exitDistance = (p: Position) => Math.min(...exits.map((exit) => manhattanDistance(p, exit)));
    // A safe advance or an already open exit belongs to the existing escort
    // planner. Do not pull its screen away merely because the exit is nearby.
    if (
      [...actual.keys()].some((key) => {
        const [x, y] = key.split(',').map(Number);
        return exitDistance({ x: x!, y: y! }) < exitDistance(target.position);
      })
    )
      continue;
    // Borrow movable friendly occupancy only for planning; keep terrain, fuel,
    // visible enemies, their ZOC and every committed/spent ally in the graph.
    const planning = { ...state, units: state.units.filter((unit) => !movableIds.has(unit.id)) };
    const costs = movementCosts(planning, target.id);
    const zones = tacticalEnabled(planning, 'zoc') && groundUnit(target) ? zocTiles(planning, target, knownEnemies) : new Set<string>();
    for (const exit of [...exits].sort((a, b) => (costs.get(positionKey(a)) ?? Infinity) - (costs.get(positionKey(b)) ?? Infinity) || a.y - b.y || a.x - b.x)) {
      if (!costs.has(positionKey(exit))) continue;
      const route = [exit];
      while (!samePosition(route[route.length - 1]!, target.position)) {
        const at = route[route.length - 1]!;
        const previous = neighbors(at).find(
          (p) =>
            costs.get(positionKey(p)) === costs.get(positionKey(at))! - unitMovementCost(planning, at, target.kind) &&
            (samePosition(p, target.position) || !zones.has(positionKey(p))),
        );
        if (!previous) break;
        route.push(previous);
      }
      if (!samePosition(route[route.length - 1]!, target.position)) continue;
      const reserved = new Set([...route, ...exits].map(positionKey));
      const blockers = movable.filter((unit) => reserved.has(positionKey(unit.position)));
      const queue = [...blockers];
      const seen = new Set(queue.map((unit) => unit.id));
      for (let index = 0; index < queue.length; index++) {
        const unit = queue[index]!;
        const destinations = reachablePositionsForPlayer(state, unit.id, player)
          .filter((p) => !reserved.has(positionKey(p)) && !isPropertyTerrainKind(terrainAt(state.board, p)?.kind ?? 'plain') && !posts.some((post) => samePosition(post, p)))
          .sort((a, b) => manhattanDistance(a, unit.position) - manhattanDistance(b, unit.position) || a.y - b.y || a.x - b.x);
        const destination = destinations.find((p) => missionLaneSafeAt(state, unit, p, knownEnemies));
        if (destination) return { type: 'move', unitId: unit.id, destination };
        // A chain can be opened from its free end. Re-plan from the real state
        // after each move; no reservation or new occupancy rule is persisted.
        for (const ally of movable) {
          if (!seen.has(ally.id) && manhattanDistance(ally.position, unit.position) === 1 && Number.isFinite(unitMovementCost(state, ally.position, unit.kind))) {
            seen.add(ally.id);
            queue.push(ally);
          }
        }
      }
    }
  }
  return;
}
