import { describe, expect, it } from 'vitest';
import { simulateMatch } from './balance';
import { createScenarioInitialState, scenarioById, saveCustomScenario, scenarioDefinitionToData } from '../game/maps';
import { valueOf } from '../game/operations.fixture';
import { generateSymmetricMap } from '../game/mapGenerator';

describe('new standalone operations and generated fronts', () => {
  it.each(['convoy-escort', 'fighting-withdrawal', 'harbor-seizure', 'frontier-defense', 'encirclement-breakout', 'control-crossroads', 'control-coast'] as const)(
    'completes %s against easy CPU',
    (id) => {
      const scenario = scenarioById(id)!;
      const result = valueOf(simulateMatch(scenario, 'hard', 'modern', createScenarioInitialState(scenario).rngSeed, 60, 'easy'));
      expect(result.winner).toBe('red');
      expect(result.reason).toBe(
        id.startsWith('control-') ? 'control' : id === 'convoy-escort' ? 'escort' : id === 'encirclement-breakout' || id === 'fighting-withdrawal' ? 'withdraw' : 'hold',
      );
      expect(result.turns).toBeLessThanOrEqual(scenario.turnLimit ?? 60);
    },
    30_000,
  );

  for (const size of [16, 20, 24, 32] as const)
    it.each(['none', 'coast', 'ocean'] as const)(
      `plays a generated ${size}/%s front with legal commands`,
      (sea) => {
        const generated = valueOf(generateSymmetricMap({ size, sea, seed: 'cpu-1' }));
        const scenario = valueOf(saveCustomScenario({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, scenarioDefinitionToData(generated)));
        for (const [red, blue] of [
          ['hard', 'normal'],
          ['normal', 'hard'],
        ] as const) {
          const result = simulateMatch(scenario, red, 'modern', createScenarioInitialState(scenario).rngSeed, 12, blue);
          expect(result.ok).toBe(true);
        }
      },
      60_000,
    );
});
