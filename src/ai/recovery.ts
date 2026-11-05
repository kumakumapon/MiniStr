import { isEvacuationTarget } from '../game/evacuation';
import { affordableRepair, isServiceTile } from '../game/logistics';
import { positionKey } from '../game/terrain';
import { isDeployedUnit, usesModernRules, type DeployedUnit, type GameState, type PlayerId } from '../game/types';
import { crossingDistances } from './crossing';

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
  const result = distances?.has(positionKey(unit.position)) ? distances : undefined;
  cache.set(unit.id, result ?? null);
  return result;
}
