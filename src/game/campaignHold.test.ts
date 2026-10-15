import { describe, expect, it } from 'vitest';
import {
  createGameState,
  createScenarioInitialState,
  describeVictoryCondition,
  getConditionProgress,
  holdConditionKey,
  loadScenarioDefinitions,
  scenarioDefinitionToData,
  updateScenarioProgress,
  type ScenarioData,
  type UnitKind,
  type VictoryCondition,
} from './index';

const hold = (patch: Partial<Extract<VictoryCondition, { type: 'hold' }>> = {}): Extract<VictoryCondition, { type: 'hold' }> => ({
  type: 'hold',
  positions: [{ x: 0, y: 0 }],
  turns: 2,
  ...patch,
});
const source = (condition: unknown): unknown => ({
  id: 'hold-check',
  name: 'Hold check',
  briefing: 'Hold',
  startingGold: 0,
  board: { width: 2, height: 1, cells: [[0, 0, 'port', 'blue']] },
  initialUnits: [],
  victoryConditions: [condition],
  defeatConditions: [{ type: 'eliminate' }],
});

describe('owned ground hold objectives', () => {
  it('round-trips optional booleans and rejects malformed flags and non-property ownership goals', () => {
    for (const condition of [hold(), hold({ requireOwnership: false, groundOnly: false }), hold({ requireOwnership: true, groundOnly: true })]) {
      const loaded = loadScenarioDefinitions([source(condition)]);
      if (!loaded.ok) throw new Error(loaded.error);
      expect(scenarioDefinitionToData(loaded.value[0]!).victoryConditions).toEqual([condition]);
      expect(createScenarioInitialState(loaded.value[0]!).scenarioSnapshot?.victoryConditions).toEqual([condition]);
    }
    for (const flag of ['requireOwnership', 'groundOnly'])
      for (const invalid of [1, 'true', null, {}]) {
        expect(loadScenarioDefinitions([source({ ...hold(), [flag]: invalid })]).ok).toBe(false);
      }
    const nonProperty = source(hold({ requireOwnership: true })) as ScenarioData;
    expect(loadScenarioDefinitions([{ ...nonProperty, board: { ...nonProperty.board, cells: [] } }]).ok).toBe(false);
  });

  it.each<UnitKind>(['infantry', 'tank', 'helicopter', 'landingShip'])('requires ownership and eligible ground troops for %s', (kind) => {
    const condition = hold({ requireOwnership: true, groundOnly: true });
    const loaded = loadScenarioDefinitions([source(condition)]);
    if (!loaded.ok) throw new Error(loaded.error);
    const definition = loaded.value[0]!;
    let state = createGameState(definition.board);
    state.units = [{ id: 'r', kind, owner: 'red', position: { x: 0, y: 0 }, hp: 100, hasMoved: false, hasActed: false }];
    state = updateScenarioProgress(state, definition, 'red');
    expect(getConditionProgress(state, condition, 'red').current).toBe(0);
    state = { ...state, board: { ...state.board, terrain: [[{ kind: 'port', owner: 'red' }, { kind: 'plain' }]] } };
    state = updateScenarioProgress(state, definition, 'red');
    const eligible = kind === 'infantry' || kind === 'tank';
    expect(getConditionProgress(state, condition, 'red').current).toBe(eligible ? 1 : 0);
    state = updateScenarioProgress(state, definition, 'red');
    expect(getConditionProgress(state, condition, 'red').complete).toBe(eligible);
    state = updateScenarioProgress({ ...state, units: [] }, definition, 'red');
    expect(getConditionProgress(state, condition, 'red').current).toBe(0);
    expect(describeVictoryCondition(condition)).toContain('地上部隊');
  });

  it('preserves legacy keys and aerial occupancy when the new flags are absent or false', () => {
    expect(holdConditionKey(hold())).toBe('hold:0,0:2');
    expect(holdConditionKey(hold({ requireOwnership: false, groundOnly: false }))).toBe('hold:0,0:2');
    expect(holdConditionKey(hold({ requireOwnership: true, groundOnly: true }))).toBe('hold:0,0:2:owned:ground');
    const loaded = loadScenarioDefinitions([source(hold())]);
    if (!loaded.ok) throw new Error(loaded.error);
    const definition = loaded.value[0]!;
    let state = createGameState(definition.board);
    state.units = [{ id: 'r', kind: 'helicopter', owner: 'red', position: { x: 0, y: 0 }, hp: 100, hasMoved: false, hasActed: false }];
    state = { ...state, objectiveHoldTurns: { red: { 'hold:0,0:2': 1 }, blue: { unrelated: 4 } } };
    state = updateScenarioProgress(state, definition, 'red');
    expect(getConditionProgress(state, hold(), 'red').complete).toBe(true);
    expect(state.objectiveHoldTurns?.blue).toEqual({ unrelated: 4 });
  });
});
