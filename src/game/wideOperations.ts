import type { InitialUnit, ScenarioData } from './maps';
import type { PlayerId, TerrainKind } from './types';

const cells = new Map<string, [number, number, TerrainKind, PlayerId?]>();
function pair(x: number, y: number, kind: TerrainKind, owner?: PlayerId): void {
  cells.set(`${x},${y}`, owner ? [x, y, kind, owner] : [x, y, kind]);
  const opposite = owner === 'red' ? 'blue' : owner === 'blue' ? 'red' : undefined;
  cells.set(`${31 - x},${31 - y}`, opposite ? [31 - x, 31 - y, kind, opposite] : [31 - x, 31 - y, kind]);
}
for (let x = 2; x < 30; x++) pair(x, 15, 'road');
for (let y = 2; y < 30; y++) pair(4, y, 'road');
for (let x = 5; x < 15; x++) pair(x, 11, 'road');
for (let y = 11; y <= 15; y++) pair(14, y, 'road');
for (const [x, y] of [
  [8, 8],
  [9, 8],
  [10, 9],
  [12, 13],
  [16, 12],
  [17, 12],
] as const)
  pair(x, y, 'forest');
for (const [x, y] of [
  [10, 6],
  [11, 6],
  [18, 8],
] as const)
  pair(x, y, 'mountain');
pair(3, 3, 'capital', 'red');
pair(4, 3, 'factory', 'red');
pair(5, 3, 'airport', 'red');
pair(3, 4, 'city', 'red');
pair(8, 11, 'factory', 'red');
pair(4, 8, 'city');
pair(14, 11, 'city');
pair(14, 15, 'supplyDepot');
const red: InitialUnit[] = [
  { kind: 'infantry', owner: 'red', x: 10, y: 14 },
  { kind: 'infantry', owner: 'red', x: 12, y: 11 },
  { kind: 'tank', owner: 'red', x: 11, y: 15 },
  { kind: 'tank', owner: 'red', x: 10, y: 12 },
  { kind: 'recon', owner: 'red', x: 12, y: 14 },
  { kind: 'artillery', owner: 'red', x: 9, y: 15 },
  { kind: 'apc', owner: 'red', x: 9, y: 14 },
  { kind: 'engineer', owner: 'red', x: 11, y: 13 },
  { kind: 'antiAir', owner: 'red', x: 10, y: 13 },
];
const control = {
  type: 'control' as const,
  positions: [
    { x: 14, y: 15 },
    { x: 17, y: 16 },
  ],
  target: 20,
};

/** Front-line deployment keeps the square battlefield active from the opening. */
export const wideOperationData: readonly ScenarioData[] = [
  {
    id: 'wide-front',
    name: '広域戦線32',
    briefing:
      '32×32の広域戦線。中央の補給所2か所の所有で各ラウンド1点ずつ獲得し、20点で勝利。敵司令部の占領でも勝利する。前線工場から増援し、砲兵と補給車を連携させよ。両軍は180度回転対称、後攻補償+2000G。90ターン終了時に判定。',
    theme: 'temperate',
    board: { width: 32, height: 32, cells: [...cells.values()] },
    startingGold: 6000,
    secondPlayerBonus: 2000,
    decisionRound: 90,
    productionRules: 'facility-v2',
    initialUnits: [...red, ...red.map((unit) => ({ ...unit, owner: 'blue' as const, x: 31 - unit.x, y: 31 - unit.y }))],
    victoryConditions: [control, { type: 'captureCapital' }, { type: 'eliminate' }],
    defeatConditions: [control, { type: 'captureCapital' }, { type: 'eliminate' }],
  },
];
