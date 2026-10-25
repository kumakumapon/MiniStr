import { reachablePositionsForPlayer } from '../game/commands';
import { isDeployedUnit, type GameState, type PlayerId, type Position, type Unit } from '../game/types';
import { isEmbarkableUnit, unitStats } from '../game/units';
import { manhattanDistance, unitMovementCost } from '../game/terrain';
import { transportSafeAt } from './coordination';
import type { CpuAction } from './rules';

/** Only own units, public objectives and confirmed enemies influence an airlift. */
export function chooseAirliftAction(
  state: GameState,
  player: PlayerId,
  targets: readonly Position[],
  components: ReadonlyMap<string, number>,
  enemies: readonly Unit[],
): CpuAction | undefined {
  const own = state.units.filter(isDeployedUnit).filter((unit) => unit.owner === player);
  const sameLand = (a: Position, b: Position) => components.has(`${a.x},${a.y}`) && components.get(`${a.x},${a.y}`) === components.get(`${b.x},${b.y}`);
  const occupied = (p: Position) => [...own, ...enemies].some((u) => isDeployedUnit(u) && u.position.x === p.x && u.position.y === p.y);
  const ordered = (from: Position, positions: readonly Position[]) =>
    [...positions].sort((a, b) => manhattanDistance(a, from) - manhattanDistance(b, from) || a.y - b.y || a.x - b.x);
  for (const transport of own.filter((u) => u.kind === 'transportHelicopter' && !u.hasMoved && !u.hasActed)) {
    // Let the normal logistics evaluation return a low-fuel helicopter to an airport.
    if ((transport.fuel ?? unitStats.transportHelicopter.fuel) <= 12) continue;
    const cargo = state.units.find((u) => u.embarkedIn === transport.id);
    const adjacent = [
      { x: transport.position.x - 1, y: transport.position.y },
      { x: transport.position.x + 1, y: transport.position.y },
      { x: transport.position.x, y: transport.position.y - 1 },
      { x: transport.position.x, y: transport.position.y + 1 },
    ];
    if (cargo) {
      const target = ordered(transport.position, targets)[0];
      if (!target) continue;
      const landing = ordered(
        target,
        adjacent.filter((p) => sameLand(p, target) && Number.isFinite(unitMovementCost(state, p, cargo.kind)) && !occupied(p)),
      )[0];
      if (landing && manhattanDistance(landing, target) <= 3) return { type: 'disembark', transportId: transport.id, destination: landing };
      // Keep the objective free for the passenger, and require a legal landing on that island.
      const destination = ordered(
        target,
        reachablePositionsForPlayer(state, transport.id, player).filter(
          (p) => transportSafeAt(state, transport, p, enemies) && manhattanDistance(p, target) < manhattanDistance(transport.position, target) && manhattanDistance(p, target) > 0,
        ),
      )[0];
      if (destination) return { type: 'move', unitId: transport.id, destination };
    } else {
      const waiting = own.filter((u) => isEmbarkableUnit(u.kind) && !u.hasActed && targets.some((t) => !sameLand(u.position, t) || manhattanDistance(u.position, t) > 6));
      const passenger = waiting.find((u) => manhattanDistance(u.position, transport.position) === 1);
      if (passenger) return { type: 'embark', unitId: passenger.id, transportId: transport.id };
      const rendezvous = ordered(
        transport.position,
        waiting.map((u) => u.position),
      )[0];
      if (!rendezvous) continue;
      const destination = ordered(
        rendezvous,
        reachablePositionsForPlayer(state, transport.id, player).filter((p) => manhattanDistance(p, rendezvous) < manhattanDistance(transport.position, rendezvous)),
      )[0];
      if (destination) return { type: 'move', unitId: transport.id, destination };
    }
  }
  return undefined;
}
