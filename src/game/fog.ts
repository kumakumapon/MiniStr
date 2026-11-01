import { detectedContact, visionRange } from './tactics';
import { manhattanDistance } from './terrain';
import { unitStats } from './units';
import { reconPositions } from './recon';
import { isDeployedUnit, type GameState, type PlayerId, type Position, type Unit } from './types';

/** Coordinates currently visible to a player.  This is kept separate from UI so AI and rendering agree. */
export function visiblePositions(state: GameState, player: PlayerId): Position[] {
  const visible = new Map<string, Position>();
  for (const unit of state.units.filter((candidate): candidate is typeof candidate & { position: Position } => candidate.owner === player && isDeployedUnit(candidate))) {
    const range = visionRange(state, unit);
    for (let y = Math.max(0, unit.position.y - range); y <= Math.min(state.board.height - 1, unit.position.y + range); y += 1)
      for (let x = Math.max(0, unit.position.x - range); x <= Math.min(state.board.width - 1, unit.position.x + range); x += 1) {
      const position = { x, y };
      if (manhattanDistance(unit.position, position) <= range) visible.set(`${x},${y}`, position);
    }
  }
  for (const position of reconPositions(state, player)) visible.set(`${position.x},${position.y}`, position);
  if (state.tactics) for (const unit of state.units) if (isDeployedUnit(unit) && state.tactics.revealed[player].includes(unit.id)) visible.set(`${unit.position.x},${unit.position.y}`, unit.position);
  return [...visible.values()];
}

export function visibleEnemies(state: GameState, player: PlayerId): Unit[] {
  const positions = new Set(visiblePositions(state, player).map(position => `${position.x},${position.y}`));
  return state.units.filter((unit): unit is typeof unit & { position: Position } => unit.owner !== player && isDeployedUnit(unit) && positions.has(`${unit.position.x},${unit.position.y}`) && detectedContact(state, player, unit));
}

/** Public enemy type/HP/rank/location; private logistics are conservatively full. */
export function observedEnemy(unit: Unit): Unit {
  const observed = { ...unit, fuel: unitStats[unit.kind].fuel, ammo: unitStats[unit.kind].ammo, hasMoved: false, hasActed: false };
  delete observed.supplyStock; // Enemy stock is private, including CPU planning.
  delete observed.ambush; delete observed.diveTurns;
  delete observed.secondaryAmmo; // Omission means full; never expose a private secondary magazine.
  return observed;
}

/** Hide logistics and funds even from heuristics which inspect the full state. */
export function observeLogistics(state: GameState, player: PlayerId): GameState {
  const enemy = player === 'red' ? 'blue' : 'red';
  return { ...state, units: state.units.map(unit => unit.owner === player ? unit : observedEnemy(unit)),
    players: { ...state.players, [enemy]: { gold: 0, income: 0 } } };
}

/** Event visibility uses contacts, not terrain alone (notably for submarines). */
export function observedCommand(before: GameState, after: GameState, command: import('./session').GameCommand, player: PlayerId): boolean {
  if (before.activePlayer === player || command.type === 'endTurn' || command.type === 'bridge' || command.type === 'destroyBridge' || command.type === 'recon') return true;
  const ids = 'unitId' in command ? [command.unitId] : 'transportId' in command ? [command.transportId] : [];
  if (command.type === 'produce') return after.units.some(u => u.owner !== player && isDeployedUnit(u) && u.position.x === command.factory.x && u.position.y === command.factory.y && visibleEnemies(after, player).some(e => e.id === u.id));
  const observed = (s: GameState) => visibleEnemies(s, player).some(u => ids.includes(u.id));
  return command.type === 'move' ? observed(before) && observed(after) : observed(before) || observed(after);
}
