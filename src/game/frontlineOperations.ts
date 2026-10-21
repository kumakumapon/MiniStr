import type { InitialUnit, ScenarioData } from './maps';
import type { PlayerId, TerrainKind } from './types';

function operation(defense: boolean): ScenarioData {
  const cells = new Map<string, [number, number, TerrainKind, PlayerId?]>();
  const put = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => cells.set(`${x},${y}`, owner ? [x, y, kind, owner] : [x, y, kind]);
  for (let x = 1; x < 17; x++) {
    put(x, 6, 'road');
    put(x, 7, 'road');
  }
  put(2, 3, 'capital', 'red');
  put(15, 10, 'capital', 'blue');
  put(2, 4, 'factory', 'red');
  put(15, 9, 'factory', 'blue');
  put(3, 3, 'city', 'red');
  put(14, 10, 'city', 'blue');
  put(7, 5, 'supplyDepot', defense ? 'red' : undefined);
  put(10, 8, 'supplyDepot', defense ? 'blue' : undefined);
  for (const [x, y] of [
    [7, 2],
    [8, 3],
    [9, 10],
    [10, 11],
  ] as const)
    put(x, y, 'mountain');
  put(6, 8, 'forest');
  put(11, 5, 'forest');
  const red: InitialUnit[] = [
    { kind: 'infantry', owner: 'red', x: 5, y: 5 },
    { kind: 'infantry', owner: 'red', x: 5, y: 8 },
    { kind: 'engineer', owner: 'red', x: 6, y: 5 },
    { kind: 'engineer', owner: 'red', x: 6, y: 7 },
    { kind: 'tank', owner: 'red', x: 5, y: 6 },
    { kind: 'artillery', owner: 'red', x: 4, y: 6 },
    { kind: 'apc', owner: 'red', x: 4, y: 7 },
    { kind: 'recon', owner: 'red', x: 5, y: 3 },
  ];
  const blue = red.map((unit) => ({ ...unit, owner: 'blue' as const, x: 17 - unit.x, y: 13 - unit.y }));
  if (defense) red[0] = { kind: 'infantry', owner: 'red', x: 7, y: 5 };
  const control = {
    type: 'control' as const,
    positions: [
      { x: 7, y: 5 },
      { x: 10, y: 8 },
    ],
    target: 16,
  };
  return {
    id: defense ? 'supply-ridge' : 'supply-contest',
    name: defense ? '峠の補給線' : '補給拠点争奪',
    theme: defense ? 'desert' : 'temperate',
    briefing:
      (defense
        ? '補給所 (8, 6) を自軍地上部隊で8ターン連続保持せよ。敵もこの補給所を占領し2ターン保持すると勝利する。期限は60ターン。'
        : '補給所 (8, 6)・(11, 9) の所有でラウンド終了時に各1点。16点到達で勝利し、同時到達は高得点側、同点は継続する。') +
      '補給所は手番開始時に施設上と隣接1マスの地上部隊へ燃料・全武器の弾薬を補充する。修理・収入・生産はない。工兵は未移動・未行動で平原に500Gを使い陣地を設営できる（各軍4か所）。自軍地上部隊の防御★+1、敵地上部隊の進入で消失する。初期編成を変えても占領部隊を残し、偵察と砲撃で支援せよ。',
    board: { width: 18, height: 14, cells: [...cells.values()] },
    startingGold: 6000,
    secondPlayerBonus: defense ? 0 : 2000,
    productionRules: 'facility-v2',
    initialUnits: [...red, ...blue],
    victoryConditions: defense ? [{ type: 'hold', positions: [{ x: 7, y: 5 }], turns: 8, requireOwnership: true, groundOnly: true }] : [control],
    defeatConditions: defense ? [{ type: 'hold', positions: [{ x: 7, y: 5 }], turns: 2, requireOwnership: true, groundOnly: true }, { type: 'eliminate' }] : [control],
    ...(defense ? { turnLimit: 60 } : {}),
  };
}

export const frontlineOperationData: readonly ScenarioData[] = [operation(false), operation(true)];
