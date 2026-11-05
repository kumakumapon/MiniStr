import { afterEach, describe, expect, it } from 'vitest';
import { createScenarioInitialState, trainingScenario, applyGameCommand, type GameCommand } from '../game';
import { BattleHistory } from '../game/battleHistory';
import { learningProgress, lessonProgress, renderLearning } from './learning';
import { emptyLearningProgress } from '../game/learningLog';
import { isLearningOperation, learningSteps } from './learningSteps';
import { tacticalScenario } from '../game/tacticalMaps';
import { setLocale } from './locale';
import { operationScenarios } from '../game/maps';

afterEach(() => setLocale('ja'));
const run = (commands: readonly GameCommand[]) => {
  const initial = createScenarioInitialState(trainingScenario);
  let state = initial;
  for (const c of commands) {
    const r = applyGameCommand(state, c);
    if (!r.ok) throw Error(r.error);
    state = r.value;
  }
  return { initial, state, history: new BattleHistory(initial, commands) };
};

describe('tutorial completion from legal own commands', () => {
  it('requires actual ownership change, not initial properties or starting capture', () => {
    const commands: GameCommand[] = [
      { type: 'move', unitId: 'r1', destination: { x: 0, y: 2 } },
      { type: 'capture', unitId: 'r1' },
    ];
    const first = run(commands);
    expect(first.state.board.terrain[0]![0]!.owner).toBe('red');
    expect(lessonProgress(first.initial, 'red', commands)[2]).toBe(false);
    commands.push({ type: 'endTurn' }, { type: 'endTurn' }, { type: 'capture', unitId: 'r1' });
    const second = run(commands);
    expect(second.state.board.terrain[2]![0]!.owner).toBe('red');
    expect(lessonProgress(second.initial, 'red', commands)[2]).toBe(true);
    expect(lessonProgress(second.initial, 'blue', commands)[2]).toBe(false);
  });
  it('requires the same own transport to unload and reconstructs after undo', () => {
    const commands: GameCommand[] = [
      { type: 'embark', unitId: 'r1', transportId: 'r2' },
      { type: 'endTurn' },
      { type: 'endTurn' },
      { type: 'disembark', transportId: 'r2', destination: { x: 0, y: 1 } },
    ];
    const { history } = run(commands);
    const full = history.learning(commands.length, 'red');
    expect(full.ok && full.value.disembark).toBe(true);
    const undone = history.learning(1, 'red');
    expect(undone.ok && undone.value.disembark).toBe(false);
    expect(lessonProgress(createScenarioInitialState(trainingScenario), 'blue', commands)[5]).toBe(false);
  });
  it('ignores enemy actions, refuses invalid prefixes and returns independent reports', () => {
    const commands: GameCommand[] = [{ type: 'endTurn' }, { type: 'move', unitId: 'b1', destination: { x: 4, y: 2 } }];
    const { initial, history } = run(commands);
    expect(learningProgress(initial, 'red', commands).move).toBe(false);
    expect(learningProgress(initial, 'blue', commands).move).toBe(true);
    expect(learningProgress(initial, 'red', [{ type: 'move', unitId: 'missing', destination: { x: 0, y: 0 } }])).toEqual(emptyLearningProgress());
    const value = history.learning(2, 'blue');
    if (!value.ok) throw Error(value.error);
    value.value.move = false;
    const again = history.learning(2, 'blue');
    expect(again.ok && again.value.move).toBe(true);
  });
  it('builds the comparison table only when open', () => {
    const state = createScenarioInitialState(trainingScenario),
      p = emptyLearningProgress();
    expect(renderLearning(state, 'red', p, false)).not.toContain('<table>');
    expect(renderLearning(state, 'red', p, true)).toContain('<table>');
  });
  it.each(['tactics-supply', 'tactics-crossing'])('localizes %s and does not show red instructions to blue', (id) => {
    const state = createScenarioInitialState(operationScenarios.find((m) => m.id === id)!);
    setLocale('en');
    const steps = learningSteps(state, 'red', emptyLearningProgress());
    expect(steps).toHaveLength(6);
    expect(JSON.stringify(steps)).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
    expect(learningSteps(state, 'blue', emptyLearningProgress())).toBeUndefined();
  });
  it('recognizes canonical and integrated exercises, and excludes an edited map with the same ID', () => {
    const canonical = operationScenarios.find((map) => map.id === 'tactics-supply')!;
    expect(isLearningOperation(createScenarioInitialState(canonical))).toBe(true);
    expect(isLearningOperation(createScenarioInitialState(tacticalScenario(canonical)))).toBe(true);
    const edited = structuredClone(canonical);
    edited.victoryConditions = [{ type: 'eliminate' }];
    expect(isLearningOperation(createScenarioInitialState(edited))).toBe(false);
    expect(learningSteps(createScenarioInitialState(edited), 'red', emptyLearningProgress())).toBeUndefined();
    const progress = emptyLearningProgress();
    progress.move = true;
    expect(renderLearning(createScenarioInitialState(canonical), 'red', progress, true)).toContain('1/6');
    expect(learningSteps(createScenarioInitialState(trainingScenario), 'red', progress)?.[0]?.done).toBe(true);
  });
});
