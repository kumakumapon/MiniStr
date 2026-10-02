import { manhattanDistance } from './terrain';
import { unitStats } from './units';
import { isDeployedUnit, type GameState, type PlayerId, type Position, type Unit } from './types';

/** Coordinates currently visible to a player.  This is kept separate from UI so AI and rendering agree. */
export function visiblePositions(state: GameState, player: PlayerId): Position[] {
  const visible = new Map<string, Position>();
  for (const unit of state.units.filter((candidate): candidate is typeof candidate & { position: Position } => candidate.owner === player && isDeployedUnit(candidate))) {
    const range = unitStats[unit.kind].vision;
    for (let y = Math.max(0, unit.position.y - range); y <= Math.min(state.board.height - 1, unit.position.y + range); y += 1)
      for (let x = Math.max(0, unit.position.x - range); x <= Math.min(state.board.width - 1, unit.position.x + range); x += 1) {
      const position = { x, y };
      if (manhattanDistance(unit.position, position) <= range) visible.set(`${x},${y}`, position);
    }
  }
  return [...visible.values()];
}

export function visibleEnemies(state: GameState, player: PlayerId): Unit[] {
  const positions = new Set(visiblePositions(state, player).map(position => `${position.x},${position.y}`));
  return state.units.filter((unit): unit is typeof unit & { position: Position } => unit.owner !== player && isDeployedUnit(unit) && positions.has(`${unit.position.x},${unit.position.y}`));
}

/** Public enemy type/HP/rank/location; private logistics are conservatively full. */
export function observedEnemy(unit: Unit): Unit {
  return { ...unit, fuel: unitStats[unit.kind].fuel, ammo: unitStats[unit.kind].ammo, hasMoved: false, hasActed: false };
}

/** Hide logistics and funds even from heuristics which inspect the full state. */
export function observeLogistics(state: GameState, player: PlayerId): GameState {
  const enemy = player === 'red' ? 'blue' : 'red';
  return { ...state, units: state.units.map(unit => unit.owner === player ? unit : observedEnemy(unit)),
    players: { ...state.players, [enemy]: { gold: 0, income: 0 } } };
}
