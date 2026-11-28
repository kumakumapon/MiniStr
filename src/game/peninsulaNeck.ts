import type { ScenarioData } from './maps';
import type { PlayerId, TerrainKind } from './types';

export const peninsulaNeckId = 'peninsula-neck';
export const peninsulaMainlandEdge = 9;
export const peninsulaNeckBriefing =
  '赤軍は西の半島に港湾2か所と工場を持ち、輸送艦で海から回り込める。青軍は東の大陸に工場2か所と空港を持ち、輸送ヘリで地峡を越えられる。陸路は中央の細い地峡。地峡と海岸の中立都市から補給線を伸ばし、敵司令部の占領か敵部隊の全滅を目指す。';

function peninsulaNeck(): ScenarioData {
  const terrain = new Map<string, [number, number, TerrainKind, PlayerId?]>();
  const set = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => terrain.set(`${x},${y}`, owner ? [x, y, kind, owner] : [x, y, kind]);
  for (let y = 3; y <= 8; y++) for (let x = 1; x <= 5; x++) set(x, y, 'plain');
  for (let y = 1; y <= 10; y++) for (let x = peninsulaMainlandEdge; x <= 16; x++) set(x, y, 'plain');
  for (let x = 4; x <= 15; x++) set(x, 5, 'road');
  for (const x of [6, 7, 8]) set(x, 6, 'mountain');
  for (const [x, y] of [
    [2, 4],
    [4, 7],
    [10, 3],
    [11, 7],
    [13, 4],
    [14, 7],
    [16, 2],
    [16, 8],
  ] as const)
    set(x, y, 'forest');
  for (const y of [3, 4, 6, 7, 8]) set(12, y, 'road');
  set(2, 5, 'capital', 'red');
  set(3, 5, 'factory', 'red');
  set(3, 3, 'port', 'red');
  set(3, 8, 'port', 'red');
  set(4, 3, 'city', 'red');
  set(4, 8, 'city', 'red');
  set(14, 4, 'capital', 'blue');
  set(14, 5, 'factory', 'blue');
  set(15, 8, 'factory', 'blue');
  set(14, 3, 'airport', 'blue');
  set(11, 2, 'city');
  set(15, 3, 'city', 'blue');
  set(16, 6, 'city', 'blue');
  set(16, 9, 'city', 'blue');
  set(9, 2, 'port');
  set(9, 1, 'city');
  set(10, 2, 'factory');
  set(11, 4, 'city');
  set(10, 8, 'city');
  set(10, 10, 'port');
  set(7, 5, 'city');
  return {
    id: peninsulaNeckId,
    name: '半島の付け根',
    briefing: peninsulaNeckBriefing,
    startingGold: 6000,
    firstPlayerBonus: 8000,
    decisionRound: 32,
    theme: 'coastal',
    productionRules: 'facility-v2',
    victoryConditions: [{ type: 'eliminate' }, { type: 'captureCapital' }],
    defeatConditions: [{ type: 'eliminate' }, { type: 'captureCapital' }],
    board: { width: 18, height: 12, fill: 'sea', cells: [...terrain.values()] },
    initialUnits: [
      { owner: 'red', kind: 'infantry', x: 3, y: 4 },
      { owner: 'red', kind: 'infantry', x: 5, y: 5 },
      { owner: 'red', kind: 'heavyTank', x: 4, y: 5 },
      { owner: 'red', kind: 'rocket', x: 5, y: 4 },
      { owner: 'red', kind: 'antiAir', x: 4, y: 6 },
      { owner: 'red', kind: 'mech', x: 5, y: 6 },
      { owner: 'red', kind: 'landingShip', x: 3, y: 3 },
      { owner: 'red', kind: 'battleship', x: 7, y: 2 },
      { owner: 'blue', kind: 'infantry', x: 12, y: 4 },
      { owner: 'blue', kind: 'infantry', x: 13, y: 3 },
      { owner: 'blue', kind: 'tank', x: 12, y: 5 },
      { owner: 'blue', kind: 'recon', x: 13, y: 5 },
      { owner: 'blue', kind: 'transportHelicopter', x: 14, y: 3 },
      { owner: 'blue', kind: 'antiAir', x: 15, y: 6 },
    ],
  };
}

export const peninsulaNeckData = peninsulaNeck();
