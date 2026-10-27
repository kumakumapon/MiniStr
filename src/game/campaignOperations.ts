import { campaignPredecessor, campaignStages, isCampaignProgress, isCampaignScenarioUnlocked, type CampaignGrade, type CampaignProgress } from './campaign';
import { loadScenarioDefinitions, scenarioById, scenarioDefinitionToData, type ScenarioData, type ScenarioDefinition, type VictoryCondition } from './maps';
import type { GameResult, PlayerId, UnitKind } from './types';

export interface CampaignOperation {
  title: string;
  phase: string;
  orders: string;
  logistics: string;
  enemyOrders: string;
  objective: VictoryCondition;
  deadline?: number;
  frontline?: { cells?: ScenarioData['board']['cells']; units: readonly (readonly [UnitKind, number, number, PlayerId?])[] };
}

/** Campaign orders are authored separately from the symmetric skirmish catalog. */
export const campaignOperations: Readonly<Record<string, CampaignOperation>> = {
  skirmish: {
    title: '国境の足掛かり',
    phase: '第1戦域・補給線の確立',
    orders: '中央の敵前進工場 (10, 7) を歩兵で占領し、部隊を置いて3ターン連続で保持せよ。',
    logistics: '偵察車で前衛を見つけ、戦車と間接砲で排除する。歩兵で占領し、補給車で前線の弾薬・燃料を維持する。',
    enemyOrders: '前衛の偵察車・戦車が中央工場を防衛し、後続部隊が奪回を狙う。まず偵察して前衛を排除する。',
    objective: { type: 'hold', positions: [{ x: 9, y: 6 }], turns: 3, requireOwnership: true, groundOnly: true },
    deadline: 50,
    frontline: {
      cells: [[9, 6, 'factory', 'blue']],
      units: [
        ['recon', 11, 6],
        ['tank', 11, 7],
        ['artillery', 3, 1, 'red'],
        ['apc', 3, 2, 'red'],
        ['rocket', 2, 2, 'red'],
      ],
    },
  },
  islands: {
    title: '群島の補給港',
    phase: '第1戦域・補給線の確立',
    orders: '中央島の敵前進港 (7, 5) を占領し、部隊を置いて3ターン連続で保持して海上補給路を開け。',
    logistics: '輸送艦で歩兵を運び、港を確保する。艦艇は港、航空機は空港で補給・修理する。',
    enemyOrders: '中央島の歩兵と沿岸の駆逐艦が港を守る。艦艇で沿岸を制し、歩兵を上陸させる。',
    objective: { type: 'hold', positions: [{ x: 6, y: 4 }], turns: 3, requireOwnership: true, groundOnly: true },
    deadline: 55,
    frontline: {
      cells: [
        [6, 4, 'port', 'blue'],
        [7, 4, 'factory', 'blue'],
      ],
      units: [
        ['infantry', 8, 4],
        ['destroyer', 9, 4],
        ['battleship', 5, 0, 'red'],
        ['landingShip', 5, 3, 'red'],
        ['infantry', 3, 2, 'red'],
      ],
    },
  },
  canyon: {
    title: '峡谷突破',
    phase: '第2戦域・戦線の突破',
    orders: '北側関門 (11, 5) を2ターン連続で保持し、敵の防衛線を突破せよ。',
    logistics: '間接砲を前衛の後ろに置き、補給車を随伴させる。南側の関門への迂回も有効。',
    enemyOrders: '関門の戦車と後方の間接砲が進路を遮る。正面の装甲だけで突破せず、側面と射程を使う。',
    objective: { type: 'hold', positions: [{ x: 10, y: 4 }], turns: 2, groundOnly: true },
    deadline: 60,
    frontline: {
      units: [
        ['tank', 11, 4],
        ['artillery', 12, 5],
      ],
    },
  },
  siege: {
    title: '敵本営包囲',
    phase: '第2戦域・戦線の突破',
    orders: '中央市街の足場から包囲網を築き、敵司令部を占領せよ。中立司令部だけでは作戦完了にならない。',
    logistics: '生産と修理を同じ資金で賄う。歩兵の進路を確保し、戦車だけで都市へ突入しない。',
    enemyOrders: '市街の前衛と本営の増援が包囲を妨害する。補給拠点を確保してから歩兵を前進させる。',
    objective: { type: 'captureCapital' },
    deadline: 75,
    frontline: {
      units: [
        ['infantry', 13, 7],
        ['artillery', 14, 8],
        ['rocket', 4, 1, 'red'],
        ['rocket', 4, 2, 'red'],
        ['apc', 3, 2, 'red'],
      ],
    },
  },
  river: {
    title: '橋頭堡の確保',
    phase: '第2戦域・戦線の突破',
    orders: '北橋の東岸 (12, 4) を3ターン連続で保持し、渡河部隊の橋頭堡を築け。',
    logistics: '二つの橋と港を使って戦力を分散する。橋の先へ補給車も渡し、燃料と弾薬を維持する。',
    enemyOrders: '東岸の前衛が橋頭堡を防衛し、後続が増援する。北橋だけに戦力を集中しすぎない。',
    objective: { type: 'hold', positions: [{ x: 11, y: 3 }], turns: 3, groundOnly: true },
    deadline: 60,
    frontline: {
      units: [
        ['infantry', 12, 3],
        ['tank', 13, 3],
        ['battleship', 10, 6, 'red'],
        ['rocket', 4, 7, 'red'],
      ],
    },
  },
  tundra: {
    title: '凍土の防衛線',
    phase: '第3戦域・戦力の再編',
    orders: '二つの山稜の突破口と自軍司令部を守り、第20ターン終了まで持ちこたえよ。',
    logistics: '損傷部隊を後退させ、互換性のある自軍拠点で修理する。生還した経験部隊を後続作戦へ回す。',
    enemyOrders: '敵軍は二つの突破口から自軍本営へ進軍する。前線を守り、損傷部隊を交代させる。',
    objective: { type: 'survive', untilTurn: 21 },
  },
  outpost: {
    title: '前哨地の再確保',
    phase: '第3戦域・戦力の再編',
    orders: '中央の敵前哨工場 (10, 8) を占領し、部隊を置いて3ターン連続で保持して反攻拠点を確保せよ。',
    logistics: '防御地形で部隊を温存する。評価だけでなく、次へ送れる生還部隊の経験も意識する。',
    enemyOrders: '前哨工場の守備隊と偵察車が集結を妨害する。占領後も守備部隊を残して奪回に備える。',
    objective: { type: 'hold', positions: [{ x: 9, y: 7 }], turns: 3, requireOwnership: true, groundOnly: true },
    deadline: 55,
    frontline: {
      cells: [[9, 7, 'factory', 'blue']],
      units: [
        ['recon', 11, 7],
        ['infantry', 10, 8],
      ],
    },
  },
  landing: {
    title: '海峡の反攻',
    phase: '第4戦域・総反攻',
    orders: '海峡を渡り、敵岸の軍港 (14, 5) を占領して地上部隊で3ターン保持し、後続部隊の橋頭堡を確保せよ。',
    logistics: '制海権を確保してから輸送艦を進める。港で補給し、歩兵の上陸地点を先に空ける。',
    enemyOrders: '海峡の駆逐艦と敵岸歩兵が上陸を阻む。輸送艦だけを先行させない。',
    objective: { type: 'hold', positions: [{ x: 13, y: 4 }], turns: 3, requireOwnership: true, groundOnly: true },
    deadline: 60,
    frontline: {
      cells: [
        [1, 3, 'plain'],
        [4, 3, 'port', 'red'],
        [16, 8, 'plain'],
        [13, 4, 'port', 'blue'],
      ],
      units: [
        ['destroyer', 12, 3],
        ['infantry', 14, 4],
        ['destroyer', 5, 5, 'red'],
        ['battleship', 5, 7, 'red'],
        ['fighter', 5, 1, 'red'],
        ['landingShip', 5, 8, 'red'],
        ['infantry', 4, 8, 'red'],
        ['battleship', 5, 10, 'red'],
      ],
    },
  },
  industrial: {
    title: '工業生産線の掌握',
    phase: '第4戦域・総反攻',
    orders: '中央の二つの工場 (10, 7)・(13, 10) を占領し、両方に部隊を置いて同時に3ターン連続で保持せよ。',
    logistics: '両工場へ地上部隊を送り、収入を増援と修理に配分する。占領後も守備部隊を残す。',
    enemyOrders: '工場群の守備隊が生産線を守り、占領地点へ反撃する。片側だけを確保しても作戦は完了しない。',
    objective: {
      type: 'hold',
      positions: [
        { x: 9, y: 6 },
        { x: 12, y: 9 },
      ],
      turns: 3,
      requireOwnership: true,
      groundOnly: true,
    },
    deadline: 70,
    frontline: {
      cells: [[12, 9, 'factory', 'blue']],
      units: [
        ['artillery', 13, 9],
        ['infantry', 12, 8],
        ['rocket', 4, 1, 'red'],
        ['rocket', 4, 2, 'red'],
        ['apc', 3, 2, 'red'],
      ],
    },
  },
  marsh: {
    title: '湿地の最終突破',
    phase: '第4戦域・総反攻',
    orders: '敵側の前進工場 (13, 12) を占領し、部隊を置いて3ターン連続で保持して最終補給線を遮断せよ。',
    logistics: '湿地を避ける道路と輸送車を使い、前衛と補給車を離さない。経験部隊を集中して突破口を守る。',
    enemyOrders: '前進工場の守備隊が道路の出口を守る。経験部隊と補給車で突破後の反撃に備える。',
    objective: { type: 'hold', positions: [{ x: 12, y: 11 }], turns: 3, requireOwnership: true, groundOnly: true },
    deadline: 75,
    frontline: {
      cells: [[12, 11, 'factory', 'blue']],
      units: [
        ['infantry', 11, 11],
        ['tank', 13, 10],
        ['rocket', 3, 1, 'red'],
        ['rocket', 2, 2, 'red'],
        ['apc', 3, 2, 'red'],
      ],
    },
  },
};

const supportByGrade: Record<CampaignGrade, number> = { S: 2000, A: 1500, B: 1000, C: 500 };

export function campaignDeployment(progress: CampaignProgress, scenarioId: string) {
  const predecessorId = campaignPredecessor(progress, scenarioId);
  const routeSupport =
    predecessorId && campaignStages.findIndex((stage) => stage.scenarioId === scenarioId) - campaignStages.findIndex((stage) => stage.scenarioId === predecessorId) > 1 ? 3000 : 0;
  const grade = predecessorId ? progress.bestGrades[predecessorId] : undefined;
  return {
    predecessorId,
    support: (grade ? supportByGrade[grade] : 0) + routeSupport,
    veterans: predecessorId ? structuredClone(progress.veteransByScenario?.[predecessorId] ?? []) : [],
  };
}

/** All campaign differences live in a validated snapshot, keeping saves and replays deterministic. */
export function createCampaignScenario(progress: CampaignProgress, scenarioId: string): GameResult<ScenarioDefinition> {
  if (!isCampaignProgress(progress) || !isCampaignScenarioUnlocked(progress, scenarioId)) return { ok: false, error: 'この作戦はまだ解放されていません。' };
  const base = scenarioById(scenarioId);
  const operation = campaignOperations[scenarioId];
  if (!base || !operation) return { ok: false, error: 'キャンペーン作戦が見つかりません。' };
  const deployment = campaignDeployment(progress, scenarioId);
  const veterans = deployment.veterans.sort((a, b) => b.experience - a.experience);
  const source = scenarioDefinitionToData(base);
  const cells = new Map(source.board.cells.map((cell) => [`${cell[0]},${cell[1]}`, cell]));
  for (const cell of operation.frontline?.cells ?? []) cells.set(`${cell[0]},${cell[1]}`, cell);
  const initialForces = [...source.initialUnits, ...(operation.frontline?.units ?? []).map(([kind, x, y, owner = 'blue']) => ({ kind, x, y, owner }))];
  const initialUnits = initialForces.map((unit) => {
    if (unit.owner !== 'red') return unit;
    const index = veterans.findIndex((veteran) => veteran.kind === unit.kind);
    const veteran = index < 0 ? undefined : veterans.splice(index, 1)[0];
    return veteran ? { ...unit, experience: veteran.experience, ...(veteran.callsign ? { callsign: veteran.callsign } : {}) } : unit;
  });
  const victoryConditions: VictoryCondition[] = [structuredClone(operation.objective)];
  if (operation.objective.type !== 'captureCapital') victoryConditions.push({ type: 'captureCapital' });
  const loaded = loadScenarioDefinitions([
    {
      ...source,
      name: operation.title,
      briefing: `${operation.orders} 別途、敵司令部の占領でも勝利。補給方針：${operation.logistics} 敵軍の作戦：${operation.enemyOrders}`,
      board: { ...source.board, cells: [...cells.values()] },
      firstPlayerBonus: deployment.support,
      initialUnits,
      victoryConditions,
      defeatConditions: [{ type: 'captureCapital' }, { type: 'eliminate' }],
      turnLimit: operation.deadline,
    },
  ]);
  return loaded.ok ? { ok: true, value: loaded.value[0]! } : loaded;
}
