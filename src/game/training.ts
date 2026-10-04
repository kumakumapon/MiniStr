import type { ScenarioData } from './maps';

/** A separate practice operation; it does not consume a custom catalog slot. */
export const trainingData: ScenarioData = {
  id: 'training',
  name: '基本操作の練習',
  briefing: '3〜5分を目安に、移動・攻撃・占領・生産・輸送を試しましょう。いつでもヒントを閉じられます。',
  startingGold: 12000,
  productionRules: 'facility-v2',
  theme: 'temperate',
  board: {
    width: 6,
    height: 5,
    cells: [
      [0, 0, 'capital', 'red'],
      [1, 0, 'factory', 'red'],
      [0, 2, 'city'],
      [5, 4, 'capital', 'blue'],
      [5, 0, 'factory', 'blue'],
    ],
  },
  initialUnits: [
    { kind: 'infantry', owner: 'red', x: 0, y: 1 },
    { kind: 'apc', owner: 'red', x: 1, y: 1 },
    { kind: 'tank', owner: 'red', x: 3, y: 1 },
    { kind: 'infantry', owner: 'blue', x: 4, y: 1 },
    { kind: 'infantry', owner: 'blue', x: 5, y: 4 },
  ],
  victoryConditions: [{ type: 'captureCapital' }, { type: 'eliminate' }],
  defeatConditions: [{ type: 'captureCapital' }, { type: 'eliminate' }],
};
