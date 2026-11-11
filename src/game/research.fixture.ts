import { createScenarioInitialState } from './maps';
import { operation, valueOf } from './operations.fixture';
import { createReplay, type ReplayFile } from './replay';
import type { GameCommand } from './session';

export function researchReplayFixture(ruleVersion = 14, width = 8): ReplayFile {
  const scenario = operation({
    id: 'research-fixture',
    board: { width, height: 4, cells: [] },
    initialUnits: [
      { kind: 'infantry', owner: 'red', x: 0, y: 1 },
      { kind: 'infantry', owner: 'blue', x: 7, y: 3 },
    ],
    victoryConditions: [{ type: 'withdraw', unitIds: ['r1'], positions: [{ x: 0, y: 2 }], required: 1 }],
  });
  const initialState = { ...createScenarioInitialState(scenario), ruleVersion };
  const commands: GameCommand[] = [
    { type: 'move', unitId: 'r1', destination: { x: 1, y: 1 } },
    { type: 'endTurn' },
    { type: 'endTurn' },
    { type: 'move', unitId: 'r1', destination: { x: 0, y: 2 } },
    { type: 'evacuate', unitId: 'r1' },
  ];
  return valueOf(createReplay({ mapId: scenario.id, difficulty: 'normal', redDifficulty: 'hard', initialState, commands }));
}
