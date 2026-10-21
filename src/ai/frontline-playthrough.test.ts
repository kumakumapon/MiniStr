import { describe, expect, it } from 'vitest';
import { createScenarioInitialState, scenarioById } from '../game';
import { valueOf } from '../game/operations.fixture';
import { simulateMatch } from './balance';

describe('frontline operation playthroughs', () => {
  it.each(['supply-contest', 'supply-ridge'])(
    'wins %s by its authored objective against easy',
    (id) => {
      const scenario = scenarioById(id)!;
      const result = valueOf(simulateMatch(scenario, 'hard', 'modern', createScenarioInitialState(scenario).rngSeed, 60, 'easy'));
      expect(result.winner).toBe('red');
      expect(result.reason).toBe(id === 'supply-contest' ? 'control' : 'hold');
      expect(result.turns).toBeLessThanOrEqual(60);
    },
    30_000,
  );
  it.each(['easy', 'normal', 'hard'] as const)(
    'completes legal %s mirror matches without exceeding the objective deadline',
    (difficulty) => {
      for (const id of ['supply-contest', 'supply-ridge']) {
        const scenario = scenarioById(id)!;
        const result = valueOf(simulateMatch(scenario, difficulty, 'modern', 7919, 60));
        expect(['red', 'blue']).toContain(result.winner);
        expect(result.reason).toBe(id === 'supply-contest' ? 'control' : 'hold');
      }
    },
    30_000,
  );
});
