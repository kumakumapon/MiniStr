import { describe, expect, it } from 'vitest';
import { createBoard, createGameState } from '../game';
import { capturePointsLabel, observedCapturePoints } from './fogDisplay';
import { describeTileInspection, inspectTile } from './tileInspector';

describe('capture progress in fog (#125)', () => {
  it('reads the same for a fogged property whether or not someone is capturing it', () => {
    for (const owner of ['red', 'blue', undefined] as const) {
      const idle = observedCapturePoints({ kind: 'city', owner, capturePoints: 20 }, false);
      const underCapture = observedCapturePoints({ kind: 'city', owner, capturePoints: 12 }, false);
      expect(idle).toBe('unknown');
      expect(underCapture).toEqual(idle);
    }
  });

  it('shows the actual value on visible properties and nothing for other terrain', () => {
    expect(observedCapturePoints({ kind: 'factory', owner: 'blue', capturePoints: 12 }, true)).toBe(12);
    expect(observedCapturePoints({ kind: 'plain' }, false)).toBeUndefined();
    expect(capturePointsLabel('unknown')).toBe('不明');
    expect(capturePointsLabel(12)).toBe('12');
  });

  it('withholds the value in the tile inspector and its spoken summary, for either viewer', () => {
    const board = createBoard(3, 1);
    board.terrain[0]![2] = { kind: 'city', owner: 'red', capturePoints: 10 };
    const state = createGameState(board);
    for (const viewer of ['red', 'blue'] as const) {
      const fogged = inspectTile(state, { x: 2, y: 0 }, viewer, new Set())!;
      expect(fogged.rows).toContainEqual({ label: '占領値', value: '不明' });
      expect(describeTileInspection(fogged)).toContain('占領値 不明');
      expect(describeTileInspection(fogged)).not.toContain('占領値 10');
      const seen = inspectTile(state, { x: 2, y: 0 }, viewer, new Set(['2,0']))!;
      expect(seen.rows).toContainEqual({ label: '占領値', value: '10' });
    }
  });
});
