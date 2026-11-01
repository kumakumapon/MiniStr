import { describe, expect, it } from 'vitest';
import { chooseCpuAction } from './rules';
import { maps, operationScenarios, createScenarioInitialState } from '../game/maps';
import { tacticalScenario } from '../game/tacticalMaps';
import { applyGameCommand, isGameState } from '../game/session';
import { isGameOver } from '../game/types';

// Authored missions are asymmetric. These bounded runs verify legality and
// progress, rather than interpreting scenario wins as first/second fairness.
describe('combined tactics on all authored maps', () => {
  for (const scenario of [...maps, ...operationScenarios])
    it(`issues legal orders on ${scenario.id}`, () => {
      let state = createScenarioInitialState(tacticalScenario(scenario));
      let commands = 0,
        orders = 0;
      while (!isGameOver(state) && state.turn <= 8) {
        const action = chooseCpuAction(state, 'normal', state.activePlayer, state.activePlayer === 'red' ? 'balanced' : 'defensive');
        const next = applyGameCommand(state, action);
        expect(next.ok, JSON.stringify(action)).toBe(true);
        if (!next.ok) throw Error(next.error);
        state = next.value;
        if (action.type !== 'endTurn') orders++;
        if (++commands > 2000) throw Error('CPU did not finish its turn');
      }
      expect(orders).toBeGreaterThan(0);
      expect(isGameState(state)).toBe(true);
    });
});
