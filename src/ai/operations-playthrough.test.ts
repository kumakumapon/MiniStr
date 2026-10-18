import { describe, expect, it } from 'vitest';
import { simulateMatch } from './balance';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { valueOf } from '../game/operations.fixture';

describe('authored mission CPU playthroughs', () => {
  it.each(['easy', 'normal'] as const)(
    'escorts the actual convoy against %s without an automatic passenger detour',
    (blue) => {
      const scenario = scenarioById('convoy-escort')!;
      const result = valueOf(simulateMatch(scenario, 'hard', 'modern', createScenarioInitialState(scenario).rngSeed, 60, blue));
      expect(result.winner).toBe('red');
      expect(result.reason).toBe('escort');
      expect(result.turns).toBeLessThanOrEqual(scenario.turnLimit!);
    },
    30_000,
  );

  it('withdraws the required survivors from the actual operation against easy', () => {
    const scenario = scenarioById('fighting-withdrawal')!;
    const result = valueOf(simulateMatch(scenario, 'hard', 'modern', createScenarioInitialState(scenario).rngSeed, 60, 'easy'));
    expect(result.winner).toBe('red');
    expect(result.reason).toBe('withdraw');
    expect(result.turns).toBeLessThanOrEqual(scenario.turnLimit!);
  }, 30_000);
});
