import { createBoard, createGameState } from './state';
import { combinedTactics, initialTactics } from './tactics';
import { unitStats } from './units';
import type { GameResult, GameState, PlayerId, Unit, UnitKind } from './types';

export function tacticalUnit(kind: UnitKind, owner: PlayerId, x: number, y: number, id = owner === 'red' ? 'r1' : 'b1'): Unit {
  return { id, kind, owner, position: { x, y }, hp: 100, ammo: unitStats[kind].ammo, fuel: unitStats[kind].fuel, hasMoved: false, hasActed: false };
}
export function tacticalState(units: Unit[]): GameState {
  return {
    ...createGameState(createBoard(9, 6, { kind: 'road' }), 9),
    ruleVersion: 13,
    units,
    recon: { remaining: { red: 0, blue: 0 }, centers: [] },
    tactics: initialTactics({ ...combinedTactics }, 1),
  };
}
export function tacticalOk<T>(result: GameResult<T>): T {
  if (!result.ok) throw Error(result.error);
  return result.value;
}
