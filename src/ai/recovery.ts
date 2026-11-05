import { isEvacuationTarget } from '../game/evacuation';
import { affordableRepair, isServiceTile } from '../game/logistics';
import { positionKey } from '../game/terrain';
import { isDeployedUnit, usesModernRules, type DeployedUnit, type GameState, type PlayerId, type Unit } from '../game/types';
import { crossingDistances } from './crossing';
import { unitStats } from '../game/units';
import { scenarioForState } from '../game/maps';
import { forecastCombat } from '../game/combat';
import type { CpuAction } from './rules';
import { decisionRound } from '../game/victory';

/** Finish paid repair before returning; do not wait in an observed lethal firing lane. */
export function defensiveServiceWait(state: GameState, player: PlayerId, knownEnemies: readonly Unit[]): CpuAction | undefined {
  if (!usesModernRules(state)) return;
  for (const unit of state.units) {
    if (
      unit.owner !== player ||
      !isDeployedUnit(unit) ||
      unit.hasMoved ||
      unit.hasActed ||
      unit.hp >= 60 ||
      !isServiceTile(state, unit.position, unit.kind, player) ||
      affordableRepair(unit.kind, 100 - unit.hp, state.players[player].gold + state.players[player].income) === 0 ||
      isEvacuationTarget(state, unit.id, player) ||
      state.units.some((ally) => ally.embarkedIn === unit.id)
    )
      continue;
    const incoming = knownEnemies.reduce((sum, enemy) => {
      if (!isDeployedUnit(enemy)) return sum;
      const shot = forecastCombat(state, { ...enemy, hasMoved: false, hasActed: false }, unit);
      return sum + (shot.ok ? shot.value.outgoing.max : 0);
    }, 0);
    if (incoming < unit.hp) return { type: 'wait', unitId: unit.id };
  }
  return;
}

const routes = new WeakMap<GameState, Map<string, ReadonlyMap<string, number> | null>>();

/** Multi-turn recovery on public terrain, using friendly funds, berths and mission orders only. */
export function defensiveRepairRoute(state: GameState, player: PlayerId, unit: DeployedUnit): ReadonlyMap<string, number> | undefined {
  if (
    !usesModernRules(state) ||
    unit.owner !== player ||
    unit.hp > 35 ||
    affordableRepair(unit.kind, 100 - unit.hp, state.players[player].gold + state.players[player].income) === 0
  )
    return;
  let cache = routes.get(state);
  if (!cache) {
    cache = new Map();
    routes.set(state, cache);
  }
  const cached = cache.get(unit.id);
  if (cached !== undefined) return cached ?? undefined;
  if (isEvacuationTarget(state, unit.id, player) || state.units.some((ally) => ally.owner === player && ally.embarkedIn === unit.id)) {
    cache.set(unit.id, null);
    return;
  }
  const occupied = new Set(state.units.filter((ally) => ally.owner === player && ally.id !== unit.id && isDeployedUnit(ally)).map((ally) => positionKey(ally.position!)));
  const targets = state.board.terrain.flatMap((row, y) =>
    row.flatMap((_tile, x) => {
      const position = { x, y };
      return !occupied.has(positionKey(position)) && isServiceTile(state, position, unit.kind, player) ? [position] : [];
    }),
  );
  const distances = targets.length ? crossingDistances(state, unit.kind, targets) : undefined;
  const distance = distances?.get(positionKey(unit.position));
  const stats = unitStats[unit.kind];
  const travelTurns = distance === undefined ? Infinity : Math.ceil(distance / stats.movement);
  const scenario = scenarioForState(state);
  const opposing = player === 'red' ? scenario?.defeatConditions : scenario?.victoryConditions;
  const deadline = Math.min(decisionRound(state, scenario) ?? Infinity, ...(opposing?.flatMap((condition) => (condition.type === 'survive' ? [condition.untilTurn] : [])) ?? []));
  // Do not order a journey that runs dry before servicing, or cannot bring
  // even one repaired turn back to the front before a public mission deadline.
  const fuel = unit.fuel ?? stats.fuel;
  const useful = distance !== undefined && distance + Math.max(0, travelTurns - 1) * stats.fuelPerTurn <= fuel && state.turn + travelTurns * 2 + 1 < deadline;
  const result = useful ? distances : undefined;
  cache.set(unit.id, result ?? null);
  return result;
}
