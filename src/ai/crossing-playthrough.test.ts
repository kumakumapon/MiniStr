import { expect, it } from 'vitest';
import { createScenarioInitialState, scenarioById } from '../game';
import { valueOf } from '../game/operations.fixture';
import { simulateMatch } from './balance';

it.each(['bridgehead', 'river-withdrawal'])(
  'clears %s with its authored goal against easy CPU',
  (id) => {
    const scenario = scenarioById(id)!;
    const result = valueOf(simulateMatch(scenario, 'hard', 'modern', createScenarioInitialState(scenario).rngSeed, 60, 'easy'));
    expect(result.winner).toBe('red');
    expect(result.reason).toBe(id === 'bridgehead' ? 'hold' : 'withdraw');
    expect(result.turns).toBeLessThanOrEqual(60);
  },
  30_000,
);
