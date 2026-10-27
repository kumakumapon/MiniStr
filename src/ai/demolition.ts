import { destroyBridgeError } from '../game/bridges';
import { isDeployedUnit, type GameState, type PlayerId, type Unit } from '../game/types';
import { unitCategory } from '../game/units';
import { manhattanDistance } from '../game/terrain';
import type { GameCommand } from '../game/session';

/** Deny an enemy crossing only when no friendly ground unit needs its immediate banks. */
export function chooseDemolition(state: GameState, player: PlayerId, confirmedEnemies: readonly Unit[]): GameCommand | undefined {
  if (player !== state.activePlayer) return undefined;
  const own = state.units.filter(isDeployedUnit).filter((unit) => unit.owner === player);
  for (const site of state.bridges ?? []) {
    if (site.owner === player) continue;
    if (
      !confirmedEnemies.some(
        (enemy) => isDeployedUnit(enemy) && unitCategory[enemy.kind] !== 'air' && unitCategory[enemy.kind] !== 'sea' && manhattanDistance(enemy.position, site.position) <= 2,
      )
    )
      continue;
    for (const engineer of own.filter((unit) => unit.kind === 'engineer')) {
      if (destroyBridgeError(state, engineer.id, site.position)) continue;
      if (
        own.some(
          (ally) => ally.id !== engineer.id && unitCategory[ally.kind] !== 'air' && unitCategory[ally.kind] !== 'sea' && manhattanDistance(ally.position, site.position) <= 2,
        )
      )
        continue;
      return { type: 'destroyBridge', unitId: engineer.id, destination: { ...site.position } };
    }
  }
  return undefined;
}
