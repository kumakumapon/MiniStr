import type { InitialUnit, ScenarioData } from './maps';
import type { PlayerId, TerrainKind } from './types';

function operation(coastal: boolean): ScenarioData {
  const cells = new Map<string, [number, number, TerrainKind, PlayerId?]>();
  const put = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => cells.set(`${x},${y}`, owner ? [x, y, kind, owner] : [x, y, kind]);
  if (coastal) for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) if (x === 0 || x === 15 || y < 2 || y > 9) put(x, y, 'sea');
  for (let x = 1; x < 15; x++) {
    put(x, 5, 'road');
    put(x, 6, 'road');
  }
  for (let y = 2; y < 10; y++) {
    put(3, y, 'road');
    put(12, y, 'road');
  }
  put(2, 2, 'capital', 'red');
  put(13, 9, 'capital', 'blue');
  put(2, 3, 'factory', 'red');
  put(13, 8, 'factory', 'blue');
  put(4, 2, 'airport', 'red');
  put(11, 9, 'airport', 'blue');
  put(6, 5, 'city');
  put(9, 6, 'city');
  put(6, 3, 'forest');
  put(9, 8, 'forest');
  if (coastal) {
    put(1, 4, 'port', 'red');
    put(14, 7, 'port', 'blue');
  }
  const red: InitialUnit[] = [
    { kind: 'infantry', owner: 'red', x: 4, y: 4 },
    { kind: 'infantry', owner: 'red', x: 4, y: 7 },
    { kind: 'tank', owner: 'red', x: 5, y: 5 },
    { kind: 'artillery', owner: 'red', x: 3, y: 5 },
    { kind: 'apc', owner: 'red', x: 3, y: 6 },
    { kind: 'antiAir', owner: 'red', x: 4, y: 6 },
    { kind: 'recon', owner: 'red', x: 5, y: 3 },
    ...(coastal ? [{ kind: 'destroyer' as const, owner: 'red' as const, x: 1, y: 4 }] : []),
  ];
  const control = {
    type: 'control' as const,
    positions: [
      { x: 6, y: 5 },
      { x: 9, y: 6 },
    ],
    target: 12,
  };
  return {
    id: coastal ? 'control-coast' : 'control-crossroads',
    name: coastal ? '沿岸拠点の争奪' : '十字路の支配戦',
    theme: coastal ? 'coastal' : 'temperate',
    briefing:
      '指定都市 (7, 6)・(10, 7) の所有で、両軍の手番終了後に各1点を獲得する。常駐部隊は不要。12点に到達すると勝利し、同時到達は高得点側が勝利、同点は継続する。拠点の所有と得点は両軍に公開。広域偵察で進路を確認し、歩兵を砲兵・対空で支援せよ。' +
      (coastal ? '港の補給と艦砲も利用できる。' : ''),
    board: { width: 16, height: 12, cells: [...cells.values()] },
    startingGold: 6000,
    secondPlayerBonus: 2000,
    productionRules: 'facility-v2',
    initialUnits: [...red, ...red.map((unit) => ({ ...unit, owner: 'blue' as const, x: 15 - unit.x, y: 11 - unit.y }))],
    victoryConditions: [control],
    defeatConditions: [control],
  };
}
export const controlOperationData: readonly ScenarioData[] = [operation(false), operation(true)];
