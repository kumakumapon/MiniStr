import { describe, expect, it } from 'vitest';
import { createScenarioInitialState, maps } from '../game/maps';
import { applyGameCommand, type GameCommand } from '../game/session';
import { UndoHistory } from './undoHistory';
import { StateMemo } from './stateMemo';

describe('bounded runtime retention', () => {
  it('reconstructs every evicted undo and supports branching without retaining full boards', () => {
    const initial = createScenarioInitialState(maps[0]!);
    const commands: GameCommand[] = [];
    const history = new UndoHistory(
      () => initial,
      () => commands,
    );
    let state = initial;
    const expected = [];
    for (let i = 0; i < 80; i++) {
      expected.push(state);
      history.push({ state, commandCount: commands.length });
      const command: GameCommand = { type: 'endTurn' };
      const next = applyGameCommand(state, command);
      if (!next.ok) throw Error(next.error);
      commands.push(command);
      state = next.value;
    }
    expect(history.retainedStates).toBeLessThanOrEqual(32);
    for (let i = 79; i >= 0; i--) {
      const entry = history.pop()!;
      expect(entry.state).toEqual(expected[i]);
      commands.length = entry.commandCount;
    }
    expect(history.pop()).toBeUndefined();
    expect(history.retainedStates).toBe(0);
    history.push({ state: initial, commandCount: 0 });
    expect(history.pop()?.state).toEqual(initial);
  });
  it('invalidates derived values on state replacement and separates views', () => {
    const memo = new StateMemo<object>();
    const state = {};
    let calls = 0;
    expect(memo.get(state, 'red', () => ++calls)).toBe(1);
    expect(memo.get(state, 'red', () => ++calls)).toBe(1);
    expect(memo.get(state, 'blue', () => ++calls)).toBe(2);
    expect(memo.get({}, 'red', () => ++calls)).toBe(3);
    expect(memo.get(state, 'red', () => ++calls)).toBe(4);
  });
});
