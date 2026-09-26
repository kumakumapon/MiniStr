import { describe, expect, it } from 'vitest';
import { createScenarioInitialState, maps, type GameState } from '../game';
import { describeBuiltInScenarioRegression, playTurn } from './cpuSimulation.fixture';

// Normal and hard run from their own files so each worker stays responsive.
describeBuiltInScenarioRegression('easy');

describe('CPU-versus-CPU classic-rule regression', () => {
  // Built-in scenarios now start with modern rules; pre-Phase 9 saves still
  // continue under the classic rules, so the CPU must stay legal there too.
  it('runs classic-rule matches on land, naval, and transport maps without issuing illegal commands', () => {
    for (const scenario of maps.filter((candidate) => ['skirmish', 'islands', 'landing', 'marsh'].includes(candidate.id))) {
      let state: GameState = { ...createScenarioInitialState(scenario), ruleVersion: undefined };
      for (let round = 0; round < 40 && !state.winner; round += 1) {
        state = playTurn(state, 'normal');
        if (!state.winner) state = playTurn(state, 'normal');
      }
      expect(state.ruleVersion).toBeUndefined();
      expect(state.units.some((unit) => unit.experience !== undefined || ['mech', 'heavyTank', 'helicopter', 'battleship'].includes(unit.kind))).toBe(false);
    }
  }, 30_000);
});
