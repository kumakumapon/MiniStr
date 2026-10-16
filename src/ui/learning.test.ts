import { describe, expect, it } from 'vitest';
import { createBoard, createGameState } from '../game';
import { lessonProgress } from './learning';

describe('tutorial completion', () => {
  it('requires a completed capture and a matching embark/disembark pair', () => {
    const state = createGameState(createBoard(3, 2));
    const incomplete = [
      { type: 'capture', unitId: 'r1' },
      { type: 'embark', unitId: 'r1', transportId: 'r2' },
      { type: 'disembark', transportId: 'other', destination: { x: 1, y: 1 } },
    ] as const;
    expect(lessonProgress(state, 'red', incomplete)[2]).toBe(false);
    expect(lessonProgress(state, 'red', incomplete)[5]).toBe(false);

    state.board.terrain[0]![0] = {
      kind: 'city',
      owner: 'red',
      capturePoints: 20,
    };
    const complete = [...incomplete.slice(0, 2), { type: 'disembark', transportId: 'r2', destination: { x: 1, y: 1 } }] as const;
    expect(lessonProgress(state, 'red', complete)[2]).toBe(true);
    expect(lessonProgress(state, 'red', complete)[5]).toBe(true);
  });
});
