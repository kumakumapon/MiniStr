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

  it('ignores a hidden enemy that would be a better target', () => {
    const base = strikeState([unit('red-tank', 'tank', 'red', 1, 2), unit('blue-infantry', 'infantry', 'blue', 4, 2)], candidate => {
      candidate.board.terrain[1]![4] = { kind: 'forest' };
    });
    const expected = chooseCpuAction(base, 'hard');
    // An unseen artillery piece next to reachable tiles would be the more valuable target.
    const betterTarget = { ...base, units: [...base.units, unit('hidden-artillery', 'artillery', 'blue', 6, 3)] };
    expect(chooseCpuAction(betterTarget, 'hard')).toEqual(expected);
  });

  it('plans the same strike through a hidden blocker and stops on contact', () => {
    // A 1-row corridor: the spotter reveals the target at x=6, but x=4 on the
    // tank's only route is outside every red unit's vision.
    const board = createBoard(10, 1);
    board.terrain[0]![9] = { kind: 'capital', owner: 'blue', capturePoints: 20 };
    const base: GameState = { ...createGameState(board), units: [
      unit('red-spotter', 'infantry', 'red', 8, 0), unit('red-tank', 'tank', 'red', 0, 0), unit('blue-infantry', 'infantry', 'blue', 6, 0),
    ] };
    const expected = chooseCpuAction(base, 'hard');
    expect(expected).toEqual({ type: 'move', unitId: 'red-tank', destination: { x: 5, y: 0 } });

    const blocked = { ...base, units: [...base.units, unit('hidden-blocker', 'infantry', 'blue', 4, 0)] };
    expect(chooseCpuAction(blocked, 'hard')).toEqual(expected);
    const moved = applyGameCommand(blocked, expected);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.units.find(candidate => candidate.id === 'red-tank')).toMatchObject({ position: { x: 3, y: 0 }, hasMoved: true });
    // The blocker is adjacent and now visible; whatever comes next must be a legal order.
    expect(applyGameCommand(moved.value, chooseCpuAction(moved.value, 'hard')).ok).toBe(true);
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

  it('keeps a unit guarding the capital against a visible capturer unless it can finish a target', () => {
    const state = strikeState([unit('red-tank', 'tank', 'red', 0, 0), unit('blue-mech', 'mech', 'blue', 3, 0)]);
    expect(chooseCpuAction(state, 'hard')).toEqual(chooseCpuAction(state, 'easy'));
    const weakened = strikeState([unit('red-tank', 'tank', 'red', 0, 0), unit('blue-mech', 'mech', 'blue', 3, 0, 10)]);
    expect(chooseCpuAction(weakened, 'hard')).not.toEqual(chooseCpuAction(weakened, 'easy'));
  });

  it('moves in to interrupt a capture even on normal, without a kill', () => {
    const state = strikeState([unit('red-tank', 'tank', 'red', 1, 2), unit('blue-mech', 'mech', 'blue', 4, 2)], candidate => {
      candidate.board.terrain[2]![4] = { kind: 'city', owner: 'red', capturePoints: 10 };
    });
    const move = chooseCpuAction(state, 'normal');
    expect(move.type).toBe('move');
    if (move.type !== 'move') return;
    expect(manhattanDistance(move.destination, { x: 4, y: 2 })).toBe(1);
    const moved = applyGameCommand(state, move);
    expect(moved.ok && chooseCpuAction(moved.value, 'normal')).toEqual({ type: 'attack', unitId: 'red-tank', targetId: 'blue-mech' });
  });

  it('never sends a capturer onto a capturable property to strike, since it would capture instead', () => {
    const state = strikeState([unit('red-infantry', 'infantry', 'red', 1, 2), unit('blue-infantry', 'infantry', 'blue', 3, 2, 10)], candidate => {
      candidate.board.terrain[2]![2] = { kind: 'city', capturePoints: 20 };
    });
    const move = chooseCpuAction(state, 'hard');
    expect(move.type).toBe('move');
    if (move.type !== 'move') return;
    expect(move.destination).not.toEqual({ x: 2, y: 2 });
    expect(manhattanDistance(move.destination, { x: 3, y: 2 })).toBe(1);
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
