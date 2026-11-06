import { reachablePositionsForPlayer } from '../game/commands';
import { forecastCombat } from '../game/combat';
import { isGroundUnit } from '../game/logistics';
import { scenarioForState } from '../game/maps';
import { positionKey, samePosition, terrainAt } from '../game/terrain';
import { isDeployedUnit, usesOperationsRules, type DeployedUnit, type GameState, type PlayerId, type Unit } from '../game/types';
import { defensiveRepairRoute } from './recovery';
import type { CpuAction } from './rules';
import { isEvacuationTarget } from '../game/evacuation';

/** Public mission orders and observed units only. Re-plan after every legal move. */
export function defensiveHoldRelief(state: GameState, player: PlayerId, knownEnemies: readonly Unit[]): CpuAction | undefined {
  if (!usesOperationsRules(state)) return;
  // A projected retreat changes friendly sight. Do not let a hypothetical
  // position reveal contacts before the real move has actually discovered them.
  const known = new Set(knownEnemies.map((unit) => unit.id));
  state = { ...state, units: state.units.filter((unit) => unit.owner === player || known.has(unit.id)) };
  const scenario = scenarioForState(state);
  const conditions = player === 'red' ? scenario?.victoryConditions : scenario?.defeatConditions;
  const own = state.units.filter((unit): unit is DeployedUnit => unit.owner === player && isDeployedUnit(unit));
  const posts = conditions?.flatMap((condition) => (condition.type === 'hold' ? condition.positions : [])) ?? [];
  const ready = own.filter(
    (unit) =>
      unit.hp >= 60 &&
      !unit.hasMoved &&
      !unit.hasActed &&
      !posts.some((p) => samePosition(unit.position, p)) &&
      !isEvacuationTarget(state, unit.id, player) &&
      !state.units.some((ally) => ally.embarkedIn === unit.id),
  );
  if (!ready.length) return;
  const damageAt = (projected: GameState, unit: DeployedUnit): number =>
    knownEnemies.reduce((sum, enemy) => {
      if (!isDeployedUnit(enemy)) return sum;
      const shot = forecastCombat(projected, { ...enemy, hasMoved: false, hasActed: false }, unit);
      return sum + (shot.ok ? shot.value.outgoing.max : 0);
    }, 0);
  for (const condition of conditions ?? []) {
    if (condition.type !== 'hold') continue;
    for (const position of condition.positions) {
      if (condition.requireOwnership && terrainAt(state.board, position)?.owner !== player) continue;
      const holder = own.find((unit) => samePosition(unit.position, position));
      const eligible = ready.filter((unit) => (!condition.groundOnly || isGroundUnit(unit.kind)) && unit.id !== holder?.id);
      // Fill a vacated post before optional attacks or production. An aircraft
      // cannot relieve a ground-only objective, nor can a spent/damaged ally.
      if (!holder) {
        const relief = eligible.find(
          (unit) =>
            reachablePositionsForPlayer(state, unit.id, player).some((p) => samePosition(p, position)) &&
            damageAt({ ...state, units: state.units.map((ally) => (ally.id === unit.id ? { ...unit, position } : ally)) }, { ...unit, position }) < unit.hp,
        );
        if (relief) return { type: 'move', unitId: relief.id, destination: position };
        continue;
      }
      if (holder.hp > 35 || holder.hasMoved || holder.hasActed || !eligible.length) continue;
      const route = defensiveRepairRoute(state, player, holder, 'relief');
      const distance = route?.get(positionKey(position));
      if (distance === undefined) continue;
      const berths = reachablePositionsForPlayer(state, holder.id, player)
        .filter((p) => (route?.get(positionKey(p)) ?? Infinity) < distance)
        .sort((a, b) => route!.get(positionKey(a))! - route!.get(positionKey(b))! || a.y - b.y || a.x - b.x);
      for (const destination of berths) {
        const moved = { ...holder, position: destination, hasMoved: true };
        const projected = { ...state, units: state.units.map((unit) => (unit.id === holder.id ? moved : unit)) };
        if (damageAt(projected, moved) >= holder.hp) continue;
        if (
          eligible.some(
            (unit) =>
              reachablePositionsForPlayer(projected, unit.id, player).some((p) => samePosition(p, position)) &&
              damageAt({ ...projected, units: projected.units.map((ally) => (ally.id === unit.id ? { ...unit, position } : ally)) }, { ...unit, position }) < unit.hp,
          )
        )
          return { type: 'move', unitId: holder.id, destination };
      }
    }
  }
  return;
}
