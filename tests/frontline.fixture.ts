import type { ScenarioData } from '../src/game';

export function frontlineScenarioData(): ScenarioData {
  return {
    id: 'frontline-browser',
    name: '前線補給・設営確認',
    briefing: '補給範囲を確認し、工兵で平原に陣地を設営する。',
    startingGold: 1000,
    productionRules: 'facility-v2',
    board: {
      width: 9,
      height: 5,
      cells: [
        [0, 0, 'factory', 'red'],
        [3, 1, 'supplyDepot', 'red'],
        [8, 4, 'capital', 'blue'],
      ],
    },
    initialUnits: [
      { kind: 'engineer', owner: 'red', x: 2, y: 1 },
      { kind: 'tank', owner: 'red', x: 3, y: 2 },
      { kind: 'infantry', owner: 'red', x: 1, y: 2 },
      { kind: 'tank', owner: 'blue', x: 8, y: 4 },
    ],
    victoryConditions: [{ type: 'captureCapital' }],
    defeatConditions: [{ type: 'eliminate' }],
  };
}
