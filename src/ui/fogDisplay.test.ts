import { describe, expect, it } from 'vitest';
import { createBoard, createGameState, type PropertyTerrainKind } from '../game';
import { capturePointsLabel, displayedPositions, isPropertyDisplayed, observedCapturePoints } from './fogDisplay';
import { describeTileInspection, inspectTile } from './tileInspector';

describe('capture progress in fog (#125)', () => {
  it('reads the same for a fogged property whether or not someone is capturing it', () => {
    for (const owner of ['red', 'blue', undefined] as const) {
      const idle = observedCapturePoints({ kind: 'city', owner, capturePoints: 20 }, false);
      const underCapture = observedCapturePoints({ kind: 'city', owner, capturePoints: 12 }, false);
      expect(idle).toBe('unknown');
      expect(underCapture).toEqual(idle);
    }
    const kinds: PropertyTerrainKind[] = ['city', 'factory', 'airport', 'port', 'capital'];
    for (const kind of kinds) {
      for (const viewer of ['red', 'blue'] as const) {
        for (const owner of ['red', 'blue', undefined] as const) {
          const tile = { kind, owner, capturePoints: 12 };
          expect(isPropertyDisplayed(tile, viewer, false)).toBe(owner === viewer);
          expect(isPropertyDisplayed(tile, viewer, true)).toBe(true);
          expect(observedCapturePoints(tile, false)).toBe('unknown');
        }
      }
    }
  });

  it('shows the actual value on visible properties and nothing for other terrain', () => {
    expect(observedCapturePoints({ kind: 'factory', owner: 'blue', capturePoints: 12 }, true)).toBe(12);
    expect(observedCapturePoints({ kind: 'plain' }, false)).toBeUndefined();
    expect(isPropertyDisplayed({ kind: 'plain' }, 'red', true)).toBe(false);
    expect(capturePointsLabel('unknown')).toBe('不明');
    expect(capturePointsLabel(12)).toBe('12');
  });

  it('withholds the value in the tile inspector and its spoken summary, for either viewer', () => {
    const board = createBoard(3, 1);
    board.terrain[0]![2] = { kind: 'city', owner: 'red', capturePoints: 10 };
    const state = createGameState(board);
    state.units.push({ id: 'b1', kind: 'infantry', owner: 'blue', hp: 100, position: { x: 2, y: 0 }, hasMoved: false, hasActed: false });
    for (const viewer of ['red', 'blue'] as const) {
      const fogged = inspectTile(state, { x: 2, y: 0 }, viewer, new Set())!;
      expect(fogged.unit).toBeUndefined();
      expect(fogged.rows).toContainEqual({ label: '占領値', value: '不明' });
      expect(describeTileInspection(fogged)).toContain('占領値 不明');
      expect(describeTileInspection(fogged)).not.toContain('占領値 10');
      const seen = inspectTile(state, { x: 2, y: 0 }, viewer, new Set(['2,0']))!;
      expect(seen.rows).toContainEqual({ label: '占領値', value: '10' });
      expect(seen.unit).toBeDefined();
    }
  });
});

describe('whole-board spectating view (#133)', () => {
  const state = () => {
    const game = createGameState(createBoard(20, 3));
    game.units.push(
      { id: 'r1', kind: 'infantry', owner: 'red', hp: 100, position: { x: 0, y: 1 }, hasMoved: false, hasActed: false },
      { id: 'b1', kind: 'infantry', owner: 'blue', hp: 100, position: { x: 19, y: 1 }, hasMoved: false, hasActed: false },
    );
    return game;
  };
  const has = (positions: readonly { x: number; y: number }[], x: number, y: number) => positions.some((position) => position.x === x && position.y === y);

  it('keeps the viewer’s fog unless the whole board is requested', () => {
    const fogged = displayedPositions(state(), 'red', false);
    expect(has(fogged, 0, 1)).toBe(true);
    expect(has(fogged, 19, 1)).toBe(false);
  });

  it('lists every tile exactly once when the whole board is shown', () => {
    const whole = displayedPositions(state(), 'red', true);
    expect(whole).toHaveLength(60);
    expect(new Set(whole.map((position) => `${position.x},${position.y}`)).size).toBe(60);
    expect(has(whole, 19, 1)).toBe(true);
  });
});
