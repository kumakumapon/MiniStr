import type { InitialUnit, ScenarioData } from './maps';
import type { PlayerId, TerrainKind } from './types';

type Cell = [number, number, TerrainKind, PlayerId?];

/** Author one half; terrain, ownership and forces rotate together. */
function battlefield(width: number, height: number, fill: TerrainKind = 'plain') {
  const cells = new Map<string, Cell>();
  const set = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => {
    cells.set(`${x},${y}`, owner === undefined ? [x, y, kind] : [x, y, kind, owner]);
  };
  const pair = (x: number, y: number, kind: TerrainKind, owner?: PlayerId) => {
    set(x, y, kind, owner);
    set(width - 1 - x, height - 1 - y, kind, owner === undefined ? undefined : owner === 'red' ? 'blue' : 'red');
  };
  const patch = (left: number, top: number, right: number, bottom: number, kind: TerrainKind) => {
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) pair(x, y, kind);
  };
  return {
    set,
    pair,
    patch,
    board: () => ({ width, height, fill, cells: [...cells.values()] }),
    forces: (red: readonly InitialUnit[]): InitialUnit[] => [
      ...red,
      ...red.map((unit) => ({
        ...unit,
        owner: 'blue' as const,
        x: width - 1 - unit.x,
        y: height - 1 - unit.y,
      })),
    ],
  };
}

const dimensions: Record<string, readonly [number, number]> = {
  skirmish: [18, 14],
  islands: [20, 14],
  landing: [18, 12],
  canyon: [20, 16],
  siege: [22, 16],
  river: [21, 15],
  industrial: [22, 16],
  tundra: [20, 15],
  outpost: [18, 14],
  marsh: [18, 14],
  admiralty: [22, 15],
};

// Opening compensation is calibrated per battlefield; naval and urban fronts
// do not need the same offset as the narrow land approaches.
const secondPlayerBonuses: Record<string, number | undefined> = {
  skirmish: 4000,
  canyon: 4000,
  industrial: 2000,
  outpost: 2000,
  river: 1000,
};

/** Expanded fronts give each side corresponding resources and multiple approaches. */
export function expandedScenarioData(source: readonly ScenarioData[]): ScenarioData[] {
  return source.map((scenario) => {
    const size = dimensions[scenario.id];
    if (!size) throw new Error(`Missing expanded battlefield: ${scenario.id}`);
    const [width, height] = size;
    const map = battlefield(width, height, scenario.board.fill);
    let red = scenario.initialUnits.filter((unit) => unit.owner === 'red').map((unit) => ({ ...unit }));
    let initialUnits: InitialUnit[] | undefined;
    let briefing: string;
    let turnLimit = scenario.turnLimit;
    let victoryConditions = scenario.victoryConditions;
    let defeatConditions = scenario.defeatConditions;

    if (scenario.id === 'islands') {
      map.patch(0, 0, 4, 4, 'plain');
      map.patch(6, 3, 8, 5, 'plain');
      map.patch(6, 9, 8, 11, 'plain');
      map.pair(0, 1, 'capital', 'red');
      map.pair(1, 1, 'factory', 'red');
      map.pair(2, 0, 'factory', 'red');
      map.pair(0, 0, 'airport', 'red');
      map.pair(4, 2, 'port', 'red');
      map.pair(2, 3, 'city', 'red');
      for (const y of [4, 10]) {
        map.pair(6, y, 'port');
        map.pair(7, y, 'factory');
        map.pair(8, y, 'city');
      }
      red = red.map((unit) => (unit.kind === 'destroyer' ? { ...unit, x: 5, y: 2 } : unit));
      briefing = '四つの中立島をめぐる広域海戦。両軍から等距離の港湾と工場を確保し、複数の航路から敵司令部へ迫れ。';
    } else if (scenario.id === 'landing') {
      map.patch(0, 0, 4, height - 1, 'plain');
      map.patch(8, 4, 9, 7, 'plain');
      map.pair(0, 1, 'capital', 'red');
      map.pair(1, 3, 'port', 'red');
      map.pair(2, 3, 'airport', 'red');
      map.pair(0, 4, 'factory', 'red');
      map.pair(8, 4, 'port');
      red = red.map((unit) => (unit.kind === 'landingShip' ? { ...unit, x: 5, y: 2 } : { ...unit, x: 4, y: 2 }));
      turnLimit = 26;
      briefing = '広がった海峡を渡る上陸作戦。輸送艦で歩兵を中央島へ送り、敵岸への上陸拠点を確保せよ。26ターン以内に敵司令部を占領すれば勝利。';
    } else if (scenario.id === 'river') {
      for (let y = 0; y < height; y++) map.set(10, y, 'sea');
      map.pair(10, 3, 'road');
      map.pair(0, 7, 'capital', 'red');
      map.pair(0, 6, 'airport', 'red');
      map.pair(1, 6, 'factory', 'red');
      map.pair(1, 8, 'factory', 'red');
      map.pair(2, 4, 'city', 'red');
      map.pair(2, 10, 'city', 'red');
      map.pair(9, 7, 'port', 'red');
      map.pair(6, 2, 'factory');
      map.pair(7, 11, 'city');
      map.patch(4, 3, 9, 3, 'road');
      map.pair(8, 3, 'city');
      map.patch(4, 5, 5, 6, 'forest');
      map.pair(5, 10, 'mountain');
      red = red.map((unit) => ({ ...unit, y: unit.y + 3 }));
      briefing = '広い平原を大河が二分する。離れた二つの橋と港湾を使い、正面突破と側面からの渡河を組み合わせよ。';
    } else if (scenario.id === 'tundra') {
      // An authored defence mission, rather than a competitive mirror map.
      for (let y = 0; y < height; y++) map.set(6, y, y === 5 || y === 9 ? 'road' : 'mountain');
      for (const [x, y, kind, owner] of scenario.board.cells) {
        if (owner === 'red') map.set(x, y + 3, kind, owner);
        if (owner === 'blue') map.set(x + 8, y + 3, kind, owner);
      }
      map.set(8, 5, 'city');
      map.set(8, 9, 'city');
      map.set(9, 7, 'factory');
      map.set(3, 2, 'city');
      map.set(3, 12, 'city');
      for (const y of [5, 9]) for (const x of [3, 4]) map.set(x, y, 'forest');
      initialUnits = scenario.initialUnits.map((unit) => ({ ...unit, x: unit.x + (unit.owner === 'blue' ? 8 : 0), y: unit.y + 3 }));
      victoryConditions = [{ type: 'survive', untilTurn: 20 }, { type: 'eliminate' }];
      briefing = '広い凍土に二つの山稜の突破口がある。増援を運用して両方の前線を守り、20ターンまで敵の猛攻を凌ぎ切れ。';
    } else {
      for (const [x, y, kind, owner] of scenario.board.cells) if (owner === 'red') map.pair(x, y, kind, owner);
      map.pair(5, 2, 'factory');
      map.pair(3, 5, 'city');
      map.pair(Math.floor(width / 2) - 3, Math.floor(height / 2) + 2, 'city');
      map.patch(4, 3, 5, 4, 'forest');
      map.pair(3, height - 4, 'mountain');
      map.patch(3, 2, 4, 2, 'road');

      if (scenario.id === 'canyon') {
        map.patch(9, 0, 9, height - 1, 'mountain');
        map.patch(7, 4, 12, 4, 'road');
        briefing = '広がった峡谷には二つの関門がある。対応する中立工場を足掛かりに、複数の突破口から敵軍を撃破せよ。';
      } else if (scenario.id === 'siege') {
        map.pair(10, 7, 'capital');
        map.pair(10, 8, 'city');
        map.patch(8, 6, 13, 6, 'road');
        briefing = '広い都市域で包囲網を築け。中央の司令部と都市は対になっており、左右の工場と進軍路から敵本営へ迫れる。';
      } else if (scenario.id === 'industrial') {
        map.pair(5, height - 4, 'factory');
        map.pair(9, 6, 'factory');
        map.pair(6, 9, 'city');
        map.patch(7, 5, 9, 5, 'road');
        victoryConditions = [{ type: 'score', target: 18 }, { type: 'captureCapital' }];
        defeatConditions = victoryConditions;
        turnLimit = undefined;
        briefing = '分散した工場群をめぐる広域戦。占領と撃破で18点を目指せ。両軍の手番が終わった時点で判定し、双方が目標以上なら高得点側の勝利、同点なら続行。';
      } else if (scenario.id === 'outpost') {
        // Replace the automatic blue deadline win with the same objectives for both sides.
        turnLimit = undefined;
        map.pair(6, 4, 'forest');
        briefing = '広い前哨地帯を制圧せよ。同じ距離の工場を確保し、敵部隊の全滅または敵司令部の占領を目指す。';
      } else if (scenario.id === 'marsh') {
        map.patch(6, 4, 8, 6, 'swamp');
        map.patch(5, 8, 7, 9, 'swamp');
        map.patch(6, 3, 11, 3, 'road');
        map.patch(7, 7, 10, 7, 'road');
        briefing = '広い湿地に複数の進軍路がある。対になる中立工場を確保し、輸送車と歩兵で迂回路を使いながら突破せよ。';
      } else if (scenario.id === 'admiralty') {
        for (let y = 0; y < height; y++) for (const x of [10, 11]) map.set(x, y, 'sea');
        for (const y of [4, 10]) {
          map.set(10, y, 'port');
          map.set(11, y, 'port');
        }
        map.pair(5, 1, 'plain');
        map.pair(9, 1, 'port', 'red');
        map.patch(6, 4, 9, 4, 'road');
        red = red.map((unit) => (unit.kind === 'destroyer' ? { ...unit, x: 10, y: 1 } : unit));
        briefing = '広い海峡に二組の中立港湾が陸路をつなぐ。艦砲射撃と対戦車歩兵で複数の橋頭堡を押さえ、補給車で戦線を支えよ。';
      } else {
        map.patch(6, 4, 8, 4, 'road');
        briefing = '広がった国境には複数の進軍路がある。同じ距離の中立拠点を確保し、敵部隊の全滅または敵司令部の占領を目指す。';
      }
    }
    const secondPlayerBonus = secondPlayerBonuses[scenario.id];
    return {
      ...scenario,
      secondPlayerBonus,
      board: map.board(),
      initialUnits: initialUnits ?? map.forces(red),
      briefing: secondPlayerBonus === undefined ? briefing : `${briefing} 後攻の青軍には開始時に${secondPlayerBonus}Gの補償資金が加算される。`,
      turnLimit,
      victoryConditions,
      defeatConditions,
    };
  });
}
