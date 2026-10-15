import { campaignStages, isCampaignProgress, isCampaignScenarioUnlocked, type CampaignGrade, type CampaignProgress } from './campaign';
import { loadScenarioDefinitions, scenarioById, scenarioDefinitionToData, type ScenarioDefinition, type VictoryCondition } from './maps';
import type { GameResult } from './types';

export interface CampaignOperation {
  title: string;
  phase: string;
  orders: string;
  logistics: string;
  objective: VictoryCondition;
  deadline?: number;
}

/** Campaign orders are authored separately from the symmetric skirmish catalog. */
export const campaignOperations: Readonly<Record<string, CampaignOperation>> = {
  skirmish: {
    title: '国境の足掛かり',
    phase: '第1戦域・補給線の確立',
    orders: '前進工場 (6, 3) を2ターン連続で保持し、後続部隊の展開路を確保せよ。',
    logistics: '歩兵で工場を占領して収入を増やす。戦車を補給拠点へ戻し、弾薬切れを防ぐ。',
    objective: { type: 'hold', positions: [{ x: 5, y: 2 }], turns: 2 },
    deadline: 32,
  },
  islands: {
    title: '群島の補給港',
    phase: '第1戦域・補給線の確立',
    orders: '中立島の港 (7, 5) を2ターン連続で保持し、海上補給路を開け。',
    logistics: '輸送艦で歩兵を運び、港を確保する。艦艇は港、航空機は空港で補給・修理する。',
    objective: { type: 'hold', positions: [{ x: 6, y: 4 }], turns: 2 },
    deadline: 36,
  },
  canyon: {
    title: '峡谷突破',
    phase: '第2戦域・戦線の突破',
    orders: '北側関門 (11, 5) を2ターン連続で保持し、敵の防衛線を突破せよ。',
    logistics: '間接砲を前衛の後ろに置き、補給車を随伴させる。南側の関門への迂回も有効。',
    objective: { type: 'hold', positions: [{ x: 10, y: 4 }], turns: 2 },
    deadline: 38,
  },
  siege: {
    title: '敵本営包囲',
    phase: '第2戦域・戦線の突破',
    orders: '中央市街の足場から包囲網を築き、敵司令部を占領せよ。中立司令部だけでは作戦完了にならない。',
    logistics: '生産と修理を同じ資金で賄う。歩兵の進路を確保し、戦車だけで都市へ突入しない。',
    objective: { type: 'captureCapital' },
    deadline: 44,
  },
  river: {
    title: '橋頭堡の確保',
    phase: '第2戦域・戦線の突破',
    orders: '北橋の東岸 (12, 4) を3ターン連続で保持し、渡河部隊の橋頭堡を築け。',
    logistics: '二つの橋と港を使って戦力を分散する。橋の先へ補給車も渡し、燃料と弾薬を維持する。',
    objective: { type: 'hold', positions: [{ x: 11, y: 3 }], turns: 3 },
    deadline: 40,
  },
  tundra: {
    title: '凍土の防衛線',
    phase: '第3戦域・戦力の再編',
    orders: '二つの山稜の突破口と自軍司令部を守り、第20ターン終了まで持ちこたえよ。',
    logistics: '損傷部隊を後退させ、互換性のある自軍拠点で修理する。生還した経験部隊を後続作戦へ回す。',
    objective: { type: 'survive', untilTurn: 21 },
  },
  outpost: {
    title: '前哨地の再確保',
    phase: '第3戦域・戦力の再編',
    orders: '前哨地点 (7, 5) を3ターン連続で保持し、反攻の集結地点を再確保せよ。',
    logistics: '防御地形で部隊を温存する。評価だけでなく、次へ送れる生還部隊の経験も意識する。',
    objective: { type: 'hold', positions: [{ x: 6, y: 4 }], turns: 3 },
    deadline: 34,
  },
  landing: {
    title: '海峡の反攻',
    phase: '第4戦域・総反攻',
    orders: '中央島を中継地に敵岸へ上陸し、敵司令部を占領せよ。',
    logistics: '制海権を確保してから輸送艦を進める。港で補給し、歩兵の上陸地点を先に空ける。',
    objective: { type: 'captureCapital' },
    deadline: 38,
  },
  industrial: {
    title: '工業生産線の掌握',
    phase: '第4戦域・総反攻',
    orders: '中央の二つの工場 (10, 7)・(13, 10) を同時に3ターン連続で保持し、生産線を掌握せよ。',
    logistics: '両工場へ地上部隊を送り、収入を増援と修理に配分する。占領後も守備部隊を残す。',
    objective: {
      type: 'hold',
      positions: [
        { x: 9, y: 6 },
        { x: 12, y: 9 },
      ],
      turns: 3,
    },
    deadline: 44,
  },
  marsh: {
    title: '湿地の最終突破',
    phase: '第4戦域・総反攻',
    orders: '敵側の前進工場 (13, 12) を3ターン連続で保持し、最終補給線を遮断せよ。',
    logistics: '湿地を避ける道路と輸送車を使い、前衛と補給車を離さない。経験部隊を集中して突破口を守る。',
    objective: { type: 'hold', positions: [{ x: 12, y: 11 }], turns: 3 },
    deadline: 40,
  },
};

const supportByGrade: Record<CampaignGrade, number> = { S: 2000, A: 1500, B: 1000, C: 500 };

export function campaignDeployment(progress: CampaignProgress, scenarioId: string) {
  const index = campaignStages.findIndex((stage) => stage.scenarioId === scenarioId);
  const predecessorId = index > 0 ? campaignStages[index - 1]!.scenarioId : undefined;
  const grade = predecessorId ? progress.bestGrades[predecessorId] : undefined;
  return {
    predecessorId,
    support: grade ? supportByGrade[grade] : 0,
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
  const initialUnits = source.initialUnits.map((unit) => {
    if (unit.owner !== 'red') return unit;
    const index = veterans.findIndex((veteran) => veteran.kind === unit.kind);
    const veteran = index < 0 ? undefined : veterans.splice(index, 1)[0];
    return veteran ? { ...unit, experience: veteran.experience } : unit;
  });
  const victoryConditions: VictoryCondition[] = [structuredClone(operation.objective)];
  if (operation.objective.type !== 'captureCapital') victoryConditions.push({ type: 'captureCapital' });
  const loaded = loadScenarioDefinitions([
    {
      ...source,
      name: operation.title,
      briefing: `${operation.orders} 別途、敵司令部の占領でも勝利。補給方針：${operation.logistics}`,
      firstPlayerBonus: deployment.support,
      initialUnits,
      victoryConditions,
      defeatConditions: [{ type: 'captureCapital' }, { type: 'eliminate' }],
      turnLimit: operation.deadline,
    },
  ]);
  return loaded.ok ? { ok: true, value: loaded.value[0]! } : loaded;
}
