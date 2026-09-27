import { describe, expect, it } from 'vitest';
import { applyGameCommand, createBoard, createGameState, manhattanDistance, type GameState, type Unit } from '../game';
import { chooseCpuAction } from './rules';

/** 9×5 plain board with both capitals in far corners, red to move. */
function strikeState(units: Unit[], customize?: (state: GameState) => void): GameState {
  const board = createBoard(9, 5);
  board.terrain[0]![0] = { kind: 'capital', owner: 'red', capturePoints: 20 };
  board.terrain[4]![8] = { kind: 'capital', owner: 'blue', capturePoints: 20 };
  const state: GameState = { ...createGameState(board), units };
  customize?.(state);
  return state;
}

const unit = (id: string, kind: Unit['kind'], owner: 'red' | 'blue', x: number, y: number, hp = 100): Unit =>
  ({ id, kind, owner, position: { x, y }, hp, hasMoved: false, hasActed: false });

describe('CPU strike planning (#122)', () => {
  it('moves a unit onto the best-covered tile from which it can attack, then attacks from there', () => {
    const state = strikeState([unit('red-tank', 'tank', 'red', 1, 2), unit('blue-infantry', 'infantry', 'blue', 4, 2)], candidate => {
      candidate.board.terrain[1]![4] = { kind: 'forest' };
    });
    const move = chooseCpuAction(state, 'hard');
    expect(move).toEqual({ type: 'move', unitId: 'red-tank', destination: { x: 4, y: 1 } });
    const moved = applyGameCommand(state, move);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(chooseCpuAction(moved.value, 'hard')).toEqual({ type: 'attack', unitId: 'red-tank', targetId: 'blue-infantry' });
  });

  it('ignores hidden enemies, whether they would be better targets or block the route', () => {
    const base = strikeState([unit('red-tank', 'tank', 'red', 1, 2), unit('blue-infantry', 'infantry', 'blue', 4, 2)], candidate => {
      candidate.board.terrain[1]![4] = { kind: 'forest' };
    });
    const expected = chooseCpuAction(base, 'hard');
    // An unseen artillery piece next to reachable tiles would be the more valuable target.
    const betterTarget = { ...base, units: [...base.units, unit('hidden-artillery', 'artillery', 'blue', 6, 3)] };
    expect(chooseCpuAction(betterTarget, 'hard')).toEqual(expected);
    // An unseen unit on the route stops the move on contact without revealing itself in the order.
    const blocker = { ...base, units: [...base.units, unit('hidden-blocker', 'infantry', 'blue', 4, 0)] };
    expect(chooseCpuAction(blocker, 'hard')).toEqual(expected);
    expect(applyGameCommand(blocker, expected).ok).toBe(true);
  });

  it('keeps capturers on their objectives for non-lethal hits but sends them in for a kill', () => {
    const healthy = strikeState([unit('red-infantry', 'infantry', 'red', 1, 2), unit('blue-infantry', 'infantry', 'blue', 3, 2)]);
    expect(chooseCpuAction(healthy, 'hard')).toEqual(chooseCpuAction(healthy, 'easy'));

    const weakened = strikeState([unit('red-infantry', 'infantry', 'red', 1, 2), unit('blue-infantry', 'infantry', 'blue', 3, 2, 10)]);
    const move = chooseCpuAction(weakened, 'hard');
    expect(move).toMatchObject({ type: 'move', unitId: 'red-infantry' });
    const moved = applyGameCommand(weakened, move);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(chooseCpuAction(moved.value, 'hard')).toEqual({ type: 'attack', unitId: 'red-infantry', targetId: 'blue-infantry' });
  });

  it('never moves in for an unfavorable trade', () => {
    const state = strikeState([unit('red-infantry', 'infantry', 'red', 1, 2), unit('blue-tank', 'tank', 'blue', 3, 2)]);
    expect(chooseCpuAction(state, 'hard')).toEqual(chooseCpuAction(state, 'easy'));
  });

  it('leaves indirect units to the ordinary movement stage', () => {
    const state = strikeState([unit('red-artillery', 'artillery', 'red', 1, 2), unit('blue-infantry', 'infantry', 'blue', 4, 2)]);
    expect(chooseCpuAction(state, 'hard')).toEqual(chooseCpuAction(state, 'easy'));
  });

  it('lets normal difficulty move in only for finishing blows', () => {
    const healthy = strikeState([unit('red-tank', 'tank', 'red', 1, 2), unit('blue-tank', 'tank', 'blue', 4, 2)]);
    expect(chooseCpuAction(healthy, 'normal')).toEqual(chooseCpuAction(healthy, 'easy'));
    expect(chooseCpuAction(healthy, 'hard')).not.toEqual(chooseCpuAction(healthy, 'easy'));

    const weakened = strikeState([unit('red-tank', 'tank', 'red', 1, 2), unit('blue-tank', 'tank', 'blue', 4, 2, 20)]);
    const move = chooseCpuAction(weakened, 'normal');
    expect(move.type).toBe('move');
    if (move.type !== 'move') return;
    expect(manhattanDistance(move.destination, { x: 4, y: 2 })).toBe(1);
  });

  it('does not strike from one of its own production facilities it could still use this turn', () => {
    // A recon cannot capture, so nothing justifies holding the factory (see blocksProduction).
    const state = strikeState([unit('red-tank', 'tank', 'red', 1, 2), unit('blue-recon', 'recon', 'blue', 4, 2)], candidate => {
      candidate.board.terrain[2]![3] = { kind: 'factory', owner: 'red', capturePoints: 20 };
      candidate.players.red.gold = 10_000;
    });
    const move = chooseCpuAction(state, 'hard');
    expect(move.type).toBe('move');
    if (move.type !== 'move') return;
    expect(move.destination).not.toEqual({ x: 3, y: 2 });
    expect(manhattanDistance(move.destination, { x: 4, y: 2 })).toBe(1);
  });
});
