import { describe, expect, it } from 'vitest';
import { createScenarioInitialState, loadScenarioDefinitions, scenarioDefinitionToData, scenarioById } from './maps';
import { operation, operationData, valueOf } from './operations.fixture';
import { endTurn, getConditionProgress, isGameState, describeVictoryCondition, victoryReason, evaluateScenario } from './index';
import { controlObjective, updateControlScores } from './control';
import { createDeploymentScenario } from './deployment';

const goal = {
  type: 'control' as const,
  positions: [
    { x: 2, y: 1 },
    { x: 5, y: 2 },
  ],
  target: 2,
};
const source = () =>
  operationData({
    board: {
      width: 8,
      height: 4,
      cells: [
        [2, 1, 'city', 'red'],
        [5, 2, 'city', 'blue'],
      ],
    },
    victoryConditions: [goal],
    defeatConditions: [goal],
  });
describe('simultaneous round-end control points', () => {
  it('scores ownership without a garrison, waits for both players, and continues ties', () => {
    const scenario = operation(source()),
      initial = createScenarioInitialState(scenario);
    expect(controlObjective(scenario)).toEqual(goal);
    expect(controlObjective(undefined)).toBeUndefined();
    expect(updateControlScores(initial, scenario)).toBe(initial);
    let state = endTurn(initial);
    expect(state.controlScores).toBeUndefined();
    state = endTurn(state);
    expect(state.controlScores).toEqual({ red: 1, blue: 1 });
    expect(state.winner).toBeUndefined();
    state = endTurn(endTurn(state));
    expect(state.controlScores).toEqual({ red: 2, blue: 2 });
    expect(state.winner).toBeUndefined();
    expect(evaluateScenario({ ...state, controlScores: { red: 3, blue: 2 } }, scenario, 'blue', false)).toBeUndefined();
    expect(evaluateScenario({ ...state, controlScores: { red: 3, blue: 2 } }, scenario, 'blue', true)).toBe('red');
    const switched = structuredClone(state);
    switched.board.terrain[2]![5]!.owner = 'red';
    const won = endTurn(endTurn(switched));
    expect(won.controlScores).toEqual({ red: 4, blue: 2 });
    expect(won.winner).toBe('red');
    expect(victoryReason(won, scenario)).toBe('control');
    expect(describeVictoryCondition(goal)).toContain('ラウンド終了');
    expect(isGameState(won)).toBe(true);
  });
  it('handles neutral ownership, blue wins and old rules without changing conventional scores', () => {
    const scenario = operation(source()),
      initial = createScenarioInitialState(scenario);
    const neutral = structuredClone(initial);
    delete neutral.board.terrain[1]![2]!.owner;
    const blue = endTurn(endTurn(endTurn(endTurn(neutral))));
    expect(blue.winner).toBe('blue');
    expect(blue.controlScores).toEqual({ red: 0, blue: 2 });
    expect(blue.scores).toBeUndefined();
    expect(getConditionProgress({ ...blue, ruleVersion: 6 }, goal, 'blue').complete).toBe(false);
    expect(updateControlScores({ ...initial, activePlayer: 'blue', ruleVersion: 6 }, scenario).controlScores).toBeUndefined();
    expect(updateControlScores(initial, operation()).controlScores).toBeUndefined();
    for (const scores of [{ red: -1 }, { red: 0.5 }, { other: 2 }, { red: Infinity }]) expect(isGameState({ ...initial, controlScores: scores })).toBe(false);
    expect(isGameState({ ...initial, ruleVersion: 6 })).toBe(false);
    expect(updateControlScores({ ...initial, activePlayer: 'blue', controlScores: { red: Number.MAX_SAFE_INTEGER } }, scenario).controlScores?.red).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('validates public property targets, mirrored goals, bounded scores and portable definitions', () => {
    for (const patch of [
      { victoryConditions: [{ ...goal, target: 0 }] },
      { victoryConditions: [{ ...goal, target: 100_001 }] },
      { victoryConditions: [{ ...goal, positions: [{ x: 0, y: 0 }] }] },
      { defeatConditions: [{ type: 'score', target: 2 }] },
      { defeatConditions: [{ ...goal, target: 3 }] },
      { defeatConditions: [goal, goal] },
      { victoryConditions: [goal, { type: 'score', target: 4 }] },
    ])
      expect(loadScenarioDefinitions([{ ...source(), ...patch }]).ok).toBe(false);
    const scenario = operation({ ...source(), defeatConditions: [{ ...goal, positions: [...goal.positions].reverse() }] });
    expect(valueOf(loadScenarioDefinitions([scenarioDefinitionToData(scenario)]))[0]?.victoryConditions).toEqual([goal]);
    for (const id of ['control-crossroads', 'control-coast']) {
      const operation = scenarioById(id)!;
      expect(operation).toBeDefined();
      const choices = operation.initialUnits.filter((unit) => unit.owner === 'red').map((unit) => (unit.kind === 'infantry' ? ('tank' as const) : unit.kind));
      expect(createDeploymentScenario(operation, choices).ok).toBe(false);
    }
  });
});
