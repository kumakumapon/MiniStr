import { movementCosts, reachablePositionsForPlayer } from '../game/commands';
import { forecastCombat } from '../game/combat';
import { evacuationObjectives } from '../game/evacuation';
import { observedEnemy } from '../game/fog';
import { isGroundUnit } from '../game/logistics';
import { usesLogisticsOrders } from '../game/logisticsOrders';
import { tacticalEnabled, tacticalFeatures } from '../game/tactics';
import { manhattanDistance, positionKey, samePosition } from '../game/terrain';
import { isDeployedUnit, type DeployedUnit, type GameState, type Position, type Unit } from '../game/types';
import { isSupplyUnit, unitCategory, unitStats } from '../game/units';
import { weaponsForUnit } from '../game/weapons';

/** Preserve historical and tactics-OFF decisions, including naval/air missions. */
export function usesMissionSafety(state: GameState, unit: DeployedUnit): boolean {
  return (
    usesLogisticsOrders(state) &&
    tacticalFeatures.some((feature) => tacticalEnabled(state, feature)) &&
    isGroundUnit(unit.kind) &&
    isSupplyUnit(unit.kind) &&
    evacuationObjectives(state, unit.owner).some((condition) => {
      if (!condition.unitIds.includes(unit.id)) return false;
      if (condition.type === 'escort') return true;
      const escaped = (state.evacuatedUnits ?? []).filter((ally) => ally.owner === unit.owner && condition.unitIds.includes(ally.id)).length;
      const candidates = state.units.filter((ally) => ally.owner === unit.owner && condition.unitIds.includes(ally.id));
      const distance = (ally: Unit) => {
        const position = ally.position ?? state.units.find((transport) => transport.owner === unit.owner && transport.id === ally.embarkedIn)?.position;
        return position ? Math.min(...condition.positions.map((exit) => manhattanDistance(position, exit))) : Infinity;
      };
      candidates.sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id, 'en', { numeric: true }));
      return candidates.slice(0, Math.max(0, condition.required - escaped)).some((ally) => ally.id === unit.id);
    })
  );
}

interface Exposure {
  risks: Map<string, number>;
  current: number;
}
const exposures = new WeakMap<GameState, Map<string, Exposure>>();

/** Finish the guards' actual moves before committing a support evacuee. */
export function missionGuardsPending(state: GameState, unit: DeployedUnit): boolean {
  if (!usesMissionSafety(state, unit)) return false;
  const objectives = evacuationObjectives(state, unit.owner).filter((condition) => condition.unitIds.includes(unit.id));
  const exit = objectives
    .flatMap((condition) => condition.positions)
    .sort((a, b) => manhattanDistance(a, unit.position) - manhattanDistance(b, unit.position) || a.y - b.y || a.x - b.x)[0]!;
  // A retreat towards our public rear must lead its guards, rather than wait
  // for them to advance. The exposure check still protects its chosen move.
  if (
    objectives.every((condition) => condition.type === 'withdraw') &&
    state.board.terrain.some((row, y) =>
      row.some((tile, x) => tile.kind === 'capital' && tile.owner === unit.owner && manhattanDistance(exit, { x, y }) < manhattanDistance(unit.position, { x, y })),
    )
  )
    return false;
  return state.units.some(
    (ally) =>
      ally.owner === unit.owner &&
      ally.id !== unit.id &&
      isDeployedUnit(ally) &&
      !ally.hasMoved &&
      !ally.hasActed &&
      isGroundUnit(ally.kind) &&
      !isSupplyUnit(ally.kind) &&
      !unitStats[ally.kind].indirect,
  );
}

/**
 * Bound the next enemy turn using confirmed contacts, full public loadouts and
 * public terrain/weather. Other enemies may clear their lanes first. Their
 * maxima can overlap: this is a conservative bound, not a predicted battle.
 */
function exposure(state: GameState, unit: DeployedUnit, destination: Position, known: readonly Unit[]): Exposure {
  let cache = exposures.get(state);
  if (!cache) {
    cache = new Map();
    exposures.set(state, cache);
  }
  const key = `${unit.id}:${positionKey(destination)}:${known.map((enemy) => enemy.id).join(',')}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const enemies = known
    .filter((enemy): enemy is DeployedUnit => enemy.owner !== unit.owner && isDeployedUnit(enemy))
    .map((enemy) => ({ ...observedEnemy(enemy), position: enemy.position }));
  const own = state.units.filter((ally) => ally.owner === unit.owner && ally.id !== unit.id);
  const view: GameState = {
    ...state,
    turn: state.turn + (unit.owner === 'blue' ? 1 : 0),
    activePlayer: unit.owner === 'red' ? 'blue' : 'red',
    recon: undefined,
    tactics: { ...state.tactics!, revealed: { red: [], blue: [] } },
    units: own,
  };
  const destinations = [unit.position, destination];
  const risks = new Map(destinations.map((position) => [positionKey(position), 0]));
  for (const enemy of enemies) {
    const range = Math.max(0, ...weaponsForUnit(enemy.kind, view).map((weapon) => weapon.range[1]));
    if (!range || destinations.every((position) => manhattanDistance(enemy.position, position) > unitStats[enemy.kind].movement + range)) continue;
    // Keep friendly blockers and their ZOC, but do not infer unseen enemy
    // blockers or depend on the opponent's private recon/reveals/resources.
    const movementView = { ...view, units: [...own, enemy] };
    const positions = [...movementCosts(movementView, enemy.id).keys()].map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x: x!, y: y! };
    });
    for (const destination of destinations) {
      const target = { ...unit, position: destination };
      const projected = { ...movementView, units: [...movementView.units, target] };
      let damage = 0;
      for (const position of positions) {
        if (samePosition(position, destination) || manhattanDistance(position, destination) > range) continue;
        const attacker = { ...enemy, position, hasMoved: !samePosition(position, enemy.position) };
        const shot = forecastCombat(projected, attacker, target);
        if (shot.ok) damage = Math.max(damage, shot.value.outgoing.max);
      }
      const key = positionKey(destination);
      risks.set(key, risks.get(key)! + damage);
    }
  }
  const result = { risks, current: risks.get(positionKey(unit.position))! };
  cache.set(key, result);
  return result;
}

/** Avoid a material increase in exposure; preserve advances and exits otherwise. */
export function missionSafeAt(state: GameState, unit: DeployedUnit, destination: Position, known: readonly Unit[]): boolean {
  if (!usesMissionSafety(state, unit) || samePosition(unit.position, destination)) return true;
  if (!reachablePositionsForPlayer(state, unit.id, unit.owner).some((position) => samePosition(position, destination))) return false;
  const { risks, current } = exposure(state, unit, destination, known);
  const risk = risks.get(positionKey(destination));
  if (risk! <= current + unit.hp / 10) return true;
  if (risk! >= unit.hp) return false;
  const guards = state.units.filter(
    (ally): ally is DeployedUnit =>
      ally.owner === unit.owner &&
      ally.id !== unit.id &&
      isDeployedUnit(ally) &&
      isGroundUnit(ally.kind) &&
      ally.hp >= 40 &&
      !isSupplyUnit(ally.kind) &&
      !unitStats[ally.kind].indirect &&
      unitStats[ally.kind].attack > 0,
  );
  if (
    guards.some((ally) => unitCategory[ally.kind] === 'armor' && manhattanDistance(ally.position, destination) <= 2) &&
    guards.some((ally) => manhattanDistance(ally.position, destination) <= 1)
  )
    return true;
  const ids = new Set(known.map((enemy) => enemy.id));
  const observed = { ...state, units: state.units.filter((ally) => ally.owner === unit.owner || ids.has(ally.id)) };
  const spent = movementCosts(observed, unit.id).get(positionKey(destination))!;
  const projected = {
    ...observed,
    turn: state.turn + 1,
    units: observed.units.map((ally) => (ally.id === unit.id ? { ...unit, position: destination, fuel: Math.max(0, (unit.fuel ?? unitStats[unit.kind].fuel) - spent) } : ally)),
  };
  const costs = movementCosts(projected, unit.id);
  return evacuationObjectives(state, unit.owner).some((condition) => condition.unitIds.includes(unit.id) && condition.positions.some((exit) => costs.has(positionKey(exit))));
}
