import { expect, it } from 'vitest';
import { createScenarioInitialState, operationScenarios, scenarioDefinitionToData, loadScenarioDefinitions } from './maps';
import { inspectGeneratedMap } from './mapGenerator';
import { valueOf } from './operations.fixture';
import { createReplay } from './replay';
import { replayCommands } from './session';
import { ReplayTimeline } from './replayTimeline';
import type { GameCommand } from './session';

it('provides a connected, symmetric 32×32 operation with portable objectives', () => {
  const map = operationScenarios.find((map) => map.id === 'wide-front')!;
  expect(map.board).toMatchObject({ width: 32, height: 32 });
  expect(inspectGeneratedMap(map)).toEqual([]);
  expect(valueOf(loadScenarioDefinitions([scenarioDefinitionToData(map)]))[0]).toEqual(map);
  expect(map.decisionRound).toBe(90);
  expect(map.victoryConditions).toContainEqual({
    type: 'control',
    positions: [
      { x: 14, y: 15 },
      { x: 17, y: 16 },
    ],
    target: 20,
  });
});

it('bounds wide replay checkpoints and preserves seeks after eviction and caller mutation', () => {
  const original = operationScenarios.find((map) => map.id === 'wide-front')!;
  const map = { ...original, id: 'wide-long-test', turnLimit: 1000, victoryConditions: [{ type: 'eliminate' as const }], defeatConditions: [{ type: 'eliminate' as const }] };
  const initialState = createScenarioInitialState(map);
  const commands: GameCommand[] = Array.from({ length: 2000 }, () => ({ type: 'endTurn' }));
  const file = valueOf(createReplay({ mapId: map.id, difficulty: 'normal', initialState, commands }));
  const timeline = new ReplayTimeline(file);
  for (const index of [1200, 100, 1350, 300, 0, 1399]) {
    const actual = valueOf(timeline.seek(index));
    expect(actual).toEqual(valueOf(replayCommands(initialState, commands.slice(0, index))));
    actual.players.red.gold = -1;
    expect(valueOf(timeline.seek(index)).players.red.gold).toBeGreaterThanOrEqual(0);
    expect(timeline['checkpoints'].size).toBeLessThanOrEqual(8);
  }
});
