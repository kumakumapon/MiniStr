import type { InitialUnit, ScenarioData } from './maps';
import type { PlayerId, TerrainKind } from './types';

type Cell = [number, number, TerrainKind, PlayerId?];
const harborCells: Cell[] = [];
for (let y = 0; y < 12; y++) for (let x = 0; x < 18; x++) if (y < 3 || y > 8) harborCells.push([x, y, 'sea']);
harborCells.push(
  [1, 6, 'capital', 'red'],
  [1, 5, 'factory', 'red'],
  [3, 6, 'airport', 'red'],
  [2, 3, 'port', 'red'],
  [16, 5, 'capital', 'blue'],
  [16, 6, 'factory', 'blue'],
  [14, 5, 'airport', 'blue'],
  [15, 8, 'port', 'blue'],
  [7, 3, 'port'],
  [10, 8, 'port'],
  [7, 5, 'forest'],
  [10, 6, 'forest'],
  [5, 7, 'city'],
  [12, 4, 'city'],
);
const harborRed: InitialUnit[] = [
  { kind: 'infantry', owner: 'red', x: 3, y: 4 },
  { kind: 'infantry', owner: 'red', x: 3, y: 7 },
  { kind: 'tank', owner: 'red', x: 4, y: 5 },
  { kind: 'artillery', owner: 'red', x: 2, y: 5 },
  { kind: 'apc', owner: 'red', x: 2, y: 6 },
  { kind: 'antiAir', owner: 'red', x: 2, y: 7 },
  { kind: 'battleship', owner: 'red', x: 6, y: 2 },
];
const gates: Cell[] = Array.from({ length: 12 }, (_, y) => [8, y, y === 3 || y === 8 ? 'road' : 'mountain']);

export const standaloneOperationData = [
  {
    id: 'harbor-seizure',
    name: '港湾争奪戦',
    theme: 'coastal',
    startingGold: 6000,
    secondPlayerBonus: 2000,
    turnLimit: 60,
    productionRules: 'facility-v2',
    briefing:
      '中央港 (8, 4) を歩兵で占領し、2回連続で自軍ターン終了時まで保持せよ。占領後は艦艇でも港を守れる。南側の中立港 (11, 9) も補給と増援に使える。艦砲と対空で歩兵を守り、港で弾薬と燃料を補充する。',
    board: { width: 18, height: 12, cells: harborCells },
    initialUnits: [...harborRed, ...harborRed.map((unit) => ({ ...unit, owner: 'blue' as const, x: 17 - unit.x, y: 11 - unit.y }))],
    victoryConditions: [{ type: 'hold', positions: [{ x: 7, y: 3 }], turns: 2, requireOwnership: true }],
    defeatConditions: [{ type: 'captureCapital' }, { type: 'eliminate' }],
  },
  {
    id: 'frontier-defense',
    name: '二つの要衝を守れ',
    theme: 'temperate',
    startingGold: 4000,
    turnLimit: 60,
    productionRules: 'facility-v2',
    briefing:
      '自軍都市 (6, 5)・(6, 8) を地上部隊で守り、両方を5回連続で自軍ターン終了時まで保持せよ。守備が途切れると連続保持はやり直し。補給車を両拠点の近くへ進め、二つの山間路から来る敵を砲撃で迎撃する。',
    board: {
      width: 16,
      height: 12,
      cells: [
        ...gates,
        [2, 5, 'capital', 'red'],
        [2, 6, 'factory', 'red'],
        [5, 4, 'city', 'red'],
        [5, 7, 'city', 'red'],
        [5, 5, 'forest'],
        [5, 6, 'forest'],
        [14, 5, 'capital', 'blue'],
        [14, 6, 'factory', 'blue'],
        [11, 4, 'city', 'blue'],
      ],
    },
    initialUnits: [
      { kind: 'infantry', owner: 'red', x: 5, y: 4 },
      { kind: 'infantry', owner: 'red', x: 5, y: 7 },
      { kind: 'tank', owner: 'red', x: 6, y: 3 },
      { kind: 'tank', owner: 'red', x: 6, y: 8 },
      { kind: 'artillery', owner: 'red', x: 4, y: 5 },
      { kind: 'apc', owner: 'red', x: 4, y: 6 },
      { kind: 'tank', owner: 'blue', x: 10, y: 3 },
      { kind: 'tank', owner: 'blue', x: 10, y: 8 },
      { kind: 'artillery', owner: 'blue', x: 11, y: 5 },
      { kind: 'infantry', owner: 'blue', x: 11, y: 4 },
      { kind: 'apc', owner: 'blue', x: 12, y: 6 },
    ],
    victoryConditions: [
      {
        type: 'hold',
        positions: [
          { x: 5, y: 4 },
          { x: 5, y: 7 },
        ],
        turns: 5,
        requireOwnership: true,
        groundOnly: true,
      },
    ],
    defeatConditions: [{ type: 'captureCapital' }, { type: 'eliminate' }],
  },
  {
    id: 'encirclement-breakout',
    name: '包囲網を突破せよ',
    theme: 'urban',
    startingGold: 2000,
    turnLimit: 60,
    productionRules: 'facility-v2',
    briefing:
      '指定部隊 r1・r2・r3 のうち2部隊を東側の脱出地点 (15, 5)・(15, 8) から撤退させよ。二つの通路を前衛で開き、補給しながら脱出する。移動後も未行動なら「撤退」を実行できる。生還可能な対象が2部隊未満になると敗北。',
    board: {
      width: 16,
      height: 12,
      cells: [
        ...gates,
        [2, 6, 'capital', 'red'],
        [2, 7, 'factory', 'red'],
        [6, 5, 'city', 'red'],
        [14, 1, 'capital', 'blue'],
        [14, 2, 'factory', 'blue'],
        [9, 3, 'forest'],
        [9, 8, 'forest'],
        [12, 6, 'city'],
      ],
    },
    initialUnits: [
      { kind: 'infantry', owner: 'red', x: 6, y: 4 },
      { kind: 'apc', owner: 'red', x: 6, y: 6 },
      { kind: 'tank', owner: 'red', x: 5, y: 7 },
      { kind: 'tank', owner: 'red', x: 7, y: 3 },
      { kind: 'tank', owner: 'red', x: 7, y: 8 },
      { kind: 'artillery', owner: 'red', x: 6, y: 7 },
      { kind: 'tank', owner: 'blue', x: 11, y: 3 },
      { kind: 'tank', owner: 'blue', x: 11, y: 8 },
      { kind: 'infantry', owner: 'blue', x: 12, y: 6 },
      { kind: 'artillery', owner: 'blue', x: 13, y: 5 },
    ],
    victoryConditions: [
      {
        type: 'withdraw',
        unitIds: ['r1', 'r2', 'r3'],
        positions: [
          { x: 14, y: 4 },
          { x: 14, y: 7 },
        ],
        required: 2,
      },
    ],
    defeatConditions: [{ type: 'captureCapital' }, { type: 'eliminate' }],
  },
] satisfies readonly ScenarioData[];
