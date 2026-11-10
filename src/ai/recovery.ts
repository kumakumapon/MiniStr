import { evacuationObjectives, isEvacuationTarget } from '../game/evacuation';
import { usesMissionSafety } from './missionSafety';
import { affordableRepair, isGroundUnit, isServiceTile } from '../game/logistics';
import { positionKey, samePosition, terrainAt } from '../game/terrain';
import { isDeployedUnit, usesModernRules, type DeployedUnit, type GameState, type PlayerId, type Unit } from '../game/types';
import { crossingDistances } from './crossing';
import { unitStats } from '../game/units';
import { scenarioForState } from '../game/maps';
import { forecastCombat } from '../game/combat';
import type { CpuAction } from './rules';
import { decisionRound } from '../game/victory';

/** Finish paid repair before returning; do not wait in an observed lethal firing lane. */
export function defensiveServiceWait(state: GameState, player: PlayerId, knownEnemies: readonly Unit[], unitId?: string): CpuAction | undefined {
  if (!usesModernRules(state)) return;
  for (const unit of state.units) {
    if (
      unit.owner !== player ||
      (unitId !== undefined && unit.id !== unitId) ||
      !isDeployedUnit(unit) ||
      unit.hasMoved ||
      unit.hasActed ||
      unit.hp >= 50 ||
      !isServiceTile(state, unit.position, unit.kind, player) ||
      affordableRepair(unit.kind, 100 - unit.hp, state.players[player].gold + state.players[player].income) === 0 ||
      (isEvacuationTarget(state, unit.id, player) &&
        !(usesMissionSafety(state, unit) && evacuationObjectives(state, player).some((condition) => condition.type === 'escort' && condition.unitIds.includes(unit.id)))) ||
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

/** A ready field gun may take a useful firing berth instead of another repair turn. */
export function canLeaveRepairForFire(state: GameState, player: PlayerId, unit: DeployedUnit, destination: { x: number; y: number }, knownEnemies: readonly Unit[]): boolean {
  if (
    !usesModernRules(state) ||
    unit.owner !== player ||
    unit.hasMoved ||
    unit.hasActed ||
    unit.hp <= 35 ||
    unit.hp >= 50 ||
    terrainAt(state.board, unit.position)?.kind === 'capital' ||
    !isGroundUnit(unit.kind) ||
    !unitStats[unit.kind].indirect ||
    samePosition(unit.position, destination)
  )
    return false;
  const scenario = scenarioForState(state);
  const conditions = player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions;
  if (conditions?.some((condition) => condition.type === 'hold' && condition.positions.some((position) => samePosition(unit.position, position)))) return false;
  // Projection must not discover hidden contacts from the proposed position.
  const known = new Set(knownEnemies.map((enemy) => enemy.id));
  const observed = { ...state, units: state.units.filter((other) => other.owner === player || known.has(other.id)) };
  if (knownEnemies.some((enemy) => forecastCombat(observed, unit, enemy).ok)) return false;
  const deployed = { ...unit, position: destination, hasMoved: false, hasActed: false };
  const projected = { ...observed, units: observed.units.map((other) => (other.id === unit.id ? deployed : other)) };
  const fire = knownEnemies.some((enemy) => {
    const shot = forecastCombat(projected, deployed, enemy, 0);
    return shot.ok && shot.value.outgoing.min > 0;
  });
  if (!fire) return false;
  const incoming = knownEnemies.reduce((sum, enemy) => {
    if (!isDeployedUnit(enemy)) return sum;
    const shot = forecastCombat(projected, { ...enemy, hasMoved: false, hasActed: false }, deployed);
    return sum + (shot.ok ? shot.value.outgoing.max : 0);
  }, 0);
  return incoming < unit.hp;
}

const routes = new WeakMap<GameState, Map<string, ReadonlyMap<string, number> | null>>();

/** Multi-turn recovery on public terrain, using friendly funds, berths and mission orders only. */
export function defensiveRepairRoute(state: GameState, player: PlayerId, unit: DeployedUnit, purpose: 'recovery' | 'relief' = 'recovery'): ReadonlyMap<string, number> | undefined {
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
  const cacheKey = `${unit.id}:${purpose}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached ?? undefined;
  if (isEvacuationTarget(state, unit.id, player) || state.units.some((ally) => ally.owner === player && ally.embarkedIn === unit.id)) {
    cache.set(cacheKey, null);
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
  // A new relief commitment needs fuel and an estimated round trip plus a
  // repair turn within the public mission budget. Keep the existing general
  // recovery order: service can still preserve unit value at adjudication.
  const fuel = unit.fuel ?? stats.fuel;
  const useful =
    distance !== undefined && (purpose === 'recovery' || (distance + Math.max(0, travelTurns - 1) * stats.fuelPerTurn <= fuel && state.turn + travelTurns * 2 + 1 < deadline));
  const result = useful ? distances : undefined;
  cache.set(cacheKey, result ?? null);
  return result;
}
