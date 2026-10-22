import type { ScenarioData } from '../src/game';

export function crossingScenarioData(): ScenarioData {
  return {
    id: 'crossing-browser',
    name: '仮設橋の建設確認',
    briefing: '工兵で水域に架橋し、部隊を対岸へ送る。',
    startingGold: 2000,
    productionRules: 'facility-v2',
    board: { width: 9, height: 5, cells: [[0, 0, 'factory', 'red'], [8, 4, 'capital', 'blue'], ...Array.from({ length: 5 }, (_, y) => [4, y, 'sea'] as const)] },
    initialUnits: [
      { kind: 'engineer', owner: 'red', x: 3, y: 2 },
      { kind: 'tank', owner: 'red', x: 2, y: 2 },
      { kind: 'infantry', owner: 'red', x: 1, y: 1 },
      { kind: 'tank', owner: 'blue', x: 8, y: 4 },
    ],
    victoryConditions: [{ type: 'captureCapital' }],
    defeatConditions: [{ type: 'eliminate' }],
  };
}
