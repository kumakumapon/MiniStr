import { BRIDGE_COST, MAX_BRIDGES, bridgeBanks, bridgeDestinations, bridgeSites } from '../game/bridges';
import { reachablePositionsForPlayer } from '../game/commands';
import { isGroundUnit } from '../game/logistics';
import { scenarioForState } from '../game/maps';
import { hasBridge, manhattanDistance, positionKey, samePosition, unitMovementCost } from '../game/terrain';
import { isDeployedUnit, usesBridgeRules, type Board, type GameState, type PlayerId, type Position, type Unit, type UnitKind } from '../game/types';
import type { CpuAction } from './rules';
import { transportSafeAt } from './coordination';

const sites = new WeakMap<Board, Position[]>();
function waterSites(state: GameState): readonly Position[] {
  let result = sites.get(state.board);
  if (!result) {
    result = bridgeSites(state.board);
    sites.set(state.board, result);
  }
  return result;
}

const routing = new WeakMap<GameState, boolean>();
const distances = new WeakMap<GameState, Map<string, ReadonlyMap<string, number>>>();

/** Reverse weighted distances on public terrain. Occupants and private logistics are never read. */
export function crossingDistances(state: GameState, kind: UnitKind, targets: readonly Position[]): ReadonlyMap<string, number> {
  let cache = distances.get(state);
  if (!cache) {
    cache = new Map();
    distances.set(state, cache);
  }
  const key = `${kind}:${targets.map(positionKey).join(';')}`;
  const previous = cache.get(key);
  if (previous) return previous;
  const costs = new Map<string, number>();
  const queue: Position[] = [];
  for (const target of targets)
    if (Number.isFinite(unitMovementCost(state, target, kind))) {
      costs.set(positionKey(target), 0);
      queue.push(target);
    }
  for (let at = 0; at < queue.length; at++) {
    const current = queue[at]!;
    const nextCost = costs.get(positionKey(current))! + unitMovementCost(state, current, kind);
    for (const next of [
      { x: current.x - 1, y: current.y },
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y - 1 },
      { x: current.x, y: current.y + 1 },
    ]) {
      const nextKey = positionKey(next);
      if (Number.isFinite(unitMovementCost(state, next, kind)) && nextCost < (costs.get(nextKey) ?? Infinity)) {
        costs.set(nextKey, nextCost);
        queue.push(next);
      }
    }
  }
  cache.set(key, costs);
  return costs;
}

/** New routing is limited to v9 ground units on maps where a crossing is possible. */
export function crossingDistance(state: GameState, kind: UnitKind, from: Position, targets: readonly Position[]): number {
  if (!targets.length) return 0;
  const straight = Math.min(...targets.map((target) => manhattanDistance(from, target)));
  if (!usesBridgeRules(state) || !isGroundUnit(kind)) return straight;
  let enabled = routing.get(state);
  if (enabled === undefined) {
    const engineers =
      state.units.some((unit) => unit.owner === state.activePlayer && unit.kind === 'engineer') ||
      scenarioForState(state)?.initialUnits.some((unit) => unit.owner === state.activePlayer && unit.kind === 'engineer');
    enabled = !!(state.bridges?.length || engineers) && waterSites(state).length > 0;
    routing.set(state, enabled);
  }
  if (!enabled) return straight;
  const costs = crossingDistances(state, kind, targets);
  return costs.size ? (costs.get(positionKey(from)) ?? state.board.width * state.board.height * 3) : straight;
}

/** Compare saved ground movement against construction and approach costs, with at most four nearby sites per engineer. */
export function chooseBridgeAction(state: GameState, player: PlayerId, targets: readonly Position[], enemies: readonly Unit[]): CpuAction | undefined {
  if (!usesBridgeRules(state) || !targets.length || state.players[player].gold < BRIDGE_COST || (state.bridges?.filter((site) => site.owner === player).length ?? 0) >= MAX_BRIDGES)
    return undefined;
  const allies = state.units.filter((unit) => unit.owner === player && isDeployedUnit(unit));
  let best: { value: number; action: CpuAction } | undefined;
  for (const engineer of allies) {
    if (!isDeployedUnit(engineer) || engineer.kind !== 'engineer' || engineer.hasMoved || engineer.hasActed) continue;
    const candidates = waterSites(state)
      .filter(
        (position) =>
          !hasBridge(state, position) &&
          manhattanDistance(position, engineer.position) <= 9 &&
          ![...allies, ...enemies].some((unit) => isDeployedUnit(unit) && samePosition(unit.position, position)),
      )
      .sort((a, b) => manhattanDistance(a, engineer.position) - manhattanDistance(b, engineer.position) || a.y - b.y || a.x - b.x)
      .slice(0, 4);
    const legal = bridgeDestinations(state, engineer.id);
    for (const position of candidates) {
      const projected = { ...state, bridges: [...(state.bridges ?? []), { owner: player, position }] };
      const relevant = allies.filter((unit) => isDeployedUnit(unit) && isGroundUnit(unit.kind) && manhattanDistance(unit.position, position) <= 10).slice(0, 8);
      const savings = relevant.reduce(
        (total, unit) =>
          total + Math.max(0, Math.min(20, crossingDistance(state, unit.kind, unit.position!, targets) - crossingDistance(projected, unit.kind, unit.position!, targets))),
        0,
      );
      const banks = bridgeBanks(state.board, position);
      const approach = crossingDistances(state, 'engineer', banks);
      const distance = approach.get(positionKey(engineer.position)) ?? Infinity;
      const value = savings - distance * 2 - 5;
      if (value <= 0 || (best && value <= best.value)) continue;
      if (legal.some((target) => samePosition(target, position))) {
        best = { value, action: { type: 'bridge', unitId: engineer.id, destination: position } };
        continue;
      }
      const destination = reachablePositionsForPlayer(state, engineer.id, player)
        .filter(
          (next) => (approach.get(positionKey(next)) ?? Infinity) < distance && !enemies.some((enemy) => isDeployedUnit(enemy) && manhattanDistance(enemy.position, next) <= 1),
        )
        .sort((a, b) => (approach.get(positionKey(a)) ?? Infinity) - (approach.get(positionKey(b)) ?? Infinity) || a.y - b.y || a.x - b.x)[0];
      if (destination) best = { value, action: { type: 'move', unitId: engineer.id, destination } };
    }
  }
  return best?.action;
}

/** Clear a completed crossing before moving the next evacuee into the same queue. */
export function clearBridgeLane(state: GameState, player: PlayerId, targets: readonly Position[], enemies: readonly Unit[]): CpuAction | undefined {
  if (!usesBridgeRules(state) || !state.bridges?.length || !targets.length) return undefined;
  const approaches = state.bridges.flatMap((site) => [site.position, ...bridgeBanks(state.board, site.position)]);
  const allies = state.units.filter((unit) => unit.owner === player && isDeployedUnit(unit));
  for (const blocker of allies) {
    if (
      !isDeployedUnit(blocker) ||
      blocker.hasMoved ||
      blocker.hasActed ||
      !approaches.some((position) => samePosition(position, blocker.position)) ||
      targets.some((target) => samePosition(target, blocker.position))
    )
      continue;
    const distance = crossingDistance(state, blocker.kind, blocker.position, targets);
    if (
      !allies.some(
        (unit) =>
          isDeployedUnit(unit) &&
          unit.id !== blocker.id &&
          isGroundUnit(unit.kind) &&
          !unit.hasMoved &&
          !unit.hasActed &&
          manhattanDistance(unit.position, blocker.position) === 1 &&
          crossingDistance(state, unit.kind, unit.position, targets) > distance,
      )
    )
      continue;
    const destination = reachablePositionsForPlayer(state, blocker.id, player)
      .filter(
        (position) =>
          !approaches.some((approach) => samePosition(approach, position)) &&
          crossingDistance(state, blocker.kind, position, targets) <= distance + 1 &&
          transportSafeAt(state, blocker, position, enemies),
      )
      .sort((a, b) => crossingDistance(state, blocker.kind, a, targets) - crossingDistance(state, blocker.kind, b, targets) || a.y - b.y || a.x - b.x)[0];
    if (destination) return { type: 'move', unitId: blocker.id, destination };
  }
  return undefined;
}
