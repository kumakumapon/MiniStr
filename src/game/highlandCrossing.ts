import type { ScenarioData } from './maps';
import type { PlayerId, TerrainKind } from './types';

export const highlandCrossingId = 'highland-crossing';

function highlandCrossing(): ScenarioData {
  const cells: [number, number, TerrainKind, PlayerId?][] = [];
  const set = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => cells.push(owner ? [x, y, kind, owner] : [x, y, kind]);
  const crossings = [3, 9, 15];
  for (let x = 0; x < 18; x++) set(x, 5, crossings.includes(x) ? 'road' : 'sea');
  for (const x of crossings) for (const y of [3, 4, 6, 7, 8]) set(x, y, 'road');
  for (let x = 1; x < 17; x++) if (x !== 12) set(x, 9, 'road');
  for (const [x, y] of [
    [1, 1],
    [2, 2],
    [5, 1],
    [6, 3],
    [10, 1],
    [12, 3],
    [15, 1],
    [16, 2],
  ] as const)
    set(x, y, 'mountain');
  for (const [x, y] of [
    [2, 3],
    [4, 4],
    [7, 2],
    [8, 4],
    [10, 3],
    [13, 4],
    [16, 3],
    [2, 8],
    [11, 8],
    [14, 7],
  ] as const)
    set(x, y, 'forest');
  set(8, 1, 'capital', 'red');
  set(7, 1, 'factory', 'red');
  set(3, 2, 'factory');
  set(14, 2, 'airport');
  set(5, 2, 'city', 'red');
  set(13, 2, 'city', 'red');
  set(10, 10, 'capital', 'blue');
  set(6, 10, 'factory', 'blue');
  set(14, 10, 'factory', 'blue');
  set(11, 11, 'airport', 'blue');
  set(2, 10, 'city', 'blue');
  set(12, 9, 'city', 'blue');
  set(16, 10, 'city', 'blue');
  set(5, 4, 'city', 'red');
  set(12, 4, 'city');
  set(7, 6, 'city');
  return {
    id: highlandCrossingId,
    name: '高地と低地の渡河',
    briefing:
      '赤軍は北岸の高地に工場1か所と対空車両を持ち、近くの中立工場と空港を確保できる。青軍は南岸の平野に工場2か所と空港を持つ。渡河路は3か所。どちらの軍も敵司令部の占領または敵部隊の全滅で勝利する。',
    theme: 'temperate',
    startingGold: 5000,
    firstPlayerBonus: 6000,
    decisionRound: 40,
    productionRules: 'facility-v2',
    victoryConditions: [{ type: 'eliminate' }, { type: 'captureCapital' }],
    defeatConditions: [{ type: 'eliminate' }, { type: 'captureCapital' }],
    board: { width: 18, height: 12, cells },
    initialUnits: [
      { owner: 'red', kind: 'antiAir', x: 7, y: 3 },
      { owner: 'red', kind: 'infantry', x: 3, y: 2 },
      { owner: 'red', kind: 'infantry', x: 14, y: 2 },
      { owner: 'red', kind: 'engineer', x: 9, y: 2 },
      { owner: 'red', kind: 'artillery', x: 8, y: 2 },
      { owner: 'red', kind: 'tank', x: 10, y: 2 },
      { owner: 'blue', kind: 'infantry', x: 3, y: 9 },
      { owner: 'blue', kind: 'infantry', x: 15, y: 9 },
      { owner: 'blue', kind: 'engineer', x: 8, y: 9 },
      { owner: 'blue', kind: 'artillery', x: 9, y: 10 },
      { owner: 'blue', kind: 'tank', x: 11, y: 10 },
    ],
  };
}

export const highlandCrossingData = highlandCrossing();
