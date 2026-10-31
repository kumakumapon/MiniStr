import { expect, it } from 'vitest';
import { chooseCpuAction } from './rules';
import { operation, valueOf, force } from '../game/operations.fixture';
import { createScenarioInitialState, applyGameCommand } from '../game';

it.each(['balanced', 'offensive', 'defensive'] as const)('keeps %s decisions legal and does not inspect hidden enemies', (policy) => {
  const scenario = operation({ victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] });
  const initial = createScenarioInitialState(scenario);
  const hidden = { ...initial, units: [...initial.units, force('unseen', 'tank', 7, 0, { owner: 'blue' })] };
  expect(chooseCpuAction(hidden, 'normal', 'red', policy)).toEqual(chooseCpuAction(initial, 'normal', 'red', policy));
  let state = initial;
  for (let i = 0; i < 80 && !state.winner; i++) {
    const command = chooseCpuAction(state, 'normal', state.activePlayer, policy);
    state = valueOf(applyGameCommand(state, command));
  }
  expect(state.turn).toBeGreaterThan(1);
});

it('allows a bounded favorable defensive attack instead of waiting for a 30-point advantage', () => {
  const state = createScenarioInitialState(operation({ victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] }));
  state.units = [force('a', 'tank', 2, 1, { hp: 78 }), force('d', 'tank', 3, 1, { owner: 'blue' })];
  expect(chooseCpuAction(state, 'normal', 'red', 'defensive')).toEqual({ type: 'attack', unitId: 'a', targetId: 'd' });
  expect(chooseCpuAction({ ...state, ruleVersion: 11 }, 'normal', 'red', 'defensive')).toEqual(chooseCpuAction({ ...state, ruleVersion: 11 }, 'normal', 'red', 'balanced'));
});
