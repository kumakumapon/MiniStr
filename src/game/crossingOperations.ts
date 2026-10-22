import type { InitialUnit, ScenarioData } from './maps';
import type { PlayerId, TerrainKind } from './types';

function crossing(withdrawal: boolean): ScenarioData {
  const cells = new Map<string, [number, number, TerrainKind, PlayerId?]>();
  const put = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => cells.set(`${x},${y}`, owner ? [x, y, kind, owner] : [x, y, kind]);
  for (let y = 1; y < 13; y++) put(9, y, 'sea');
  for (let x = 1; x < 18; x++) {
    put(x, 0, 'road');
    put(x, 13, 'road');
    if (x !== 9) {
      put(x, 5, 'road');
      put(x, 8, 'road');
    }
  }
  put(2, 4, 'capital', 'red');
  put(16, 9, 'capital', 'blue');
  put(2, 5, 'factory', 'red');
  put(16, 8, 'factory', 'blue');
  put(3, 4, 'city', 'red');
  put(15, 9, 'city', 'blue');
  put(11, 5, 'supplyDepot');
  put(7, 8, 'supplyDepot');
  put(6, 4, 'forest');
  put(12, 9, 'forest');
  const red: InitialUnit[] = [
    { kind: 'engineer', owner: 'red', x: 8, y: 5 },
    { kind: 'infantry', owner: 'red', x: 7, y: 5 },
    { kind: 'tank', owner: 'red', x: 7, y: 4 },
    { kind: 'artillery', owner: 'red', x: 6, y: 5 },
    { kind: 'apc', owner: 'red', x: 7, y: 6 },
    { kind: 'infantry', owner: 'red', x: 6, y: 6 },
    { kind: 'recon', owner: 'red', x: 6, y: 3 },
  ];
  const blue = red.map((unit) => ({ ...unit, owner: 'blue' as const, x: 18 - unit.x, y: 13 - unit.y }));
  if (withdrawal) for (const unit of blue) unit.x += 2;
  return {
    id: withdrawal ? 'river-withdrawal' : 'bridgehead',
    name: withdrawal ? '対岸への撤退' : '橋頭堡を確保せよ',
    theme: 'coastal',
    startingGold: 5000,
    secondPlayerBonus: withdrawal ? 0 : 2000,
    turnLimit: 60,
    productionRules: 'facility-v2',
    briefing:
      (withdrawal
        ? '指定部隊 r2・r3・r5 のうち2部隊を対岸の出口 (12, 4)・(12, 7) から撤退させよ。対象が2部隊未満になると敗北。'
        : '補給所 (12, 6) を占領し、地上部隊で2ターン連続保持せよ。敵は補給所 (8, 9) の2ターン保持を狙う。') +
      '工兵は隣接する1マス幅の水域に1000Gで仮設橋を建設できる（各軍2か所、未移動・未行動）。橋は両軍が利用でき、完成位置は公開される。上端と下端に迂回路もある。工兵・渡河部隊を護衛し、補給と陣地を活用せよ。期限は60ターン。',
    board: { width: 19, height: 14, cells: [...cells.values()] },
    initialUnits: [...red, ...blue],
    victoryConditions: withdrawal
      ? [
          {
            type: 'withdraw',
            unitIds: ['r2', 'r3', 'r5'],
            positions: [
              { x: 11, y: 3 },
              { x: 11, y: 6 },
            ],
            required: 2,
          },
        ]
      : [{ type: 'hold', positions: [{ x: 11, y: 5 }], turns: 2, requireOwnership: true, groundOnly: true }],
    defeatConditions: withdrawal
      ? [{ type: 'eliminate' }, { type: 'captureCapital' }]
      : [{ type: 'hold', positions: [{ x: 7, y: 8 }], turns: 2, requireOwnership: true, groundOnly: true }, { type: 'eliminate' }],
  };
}

export const crossingOperationData: readonly ScenarioData[] = [crossing(false), crossing(true)];
