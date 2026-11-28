import { generatedHeight } from '../game/mapGenerator';
import { campaignOperations } from '../game/campaignOperations';
import { maps, operationScenarios, scenarioHistory, trainingScenario, type ScenarioDefinition, type VictoryCondition } from '../game/maps';
import { describeVictoryCondition } from '../game/victory';
import { getLocale, translateGameText } from './locale';

const builtIns = [...maps, ...operationScenarios, trainingScenario, ...maps.flatMap((scenario) => scenarioHistory(scenario.id))];

function generatedMetadata(scenario: ScenarioDefinition) {
  const match = /^generated-v([123])-(frontline-)?(16|20|24|32)-(none|coast|ocean)-([A-Za-z0-9_-]{1,24})$/.exec(scenario.id);
  if (!match) return undefined;
  const [, version, frontline, width, sea, seed] = match;
  if (Number(width) !== scenario.board.width || generatedHeight(Number(width)) !== scenario.board.height) return undefined;
  const name = `${frontline ? '前線補給・工兵' : '生成戦域'} ${seed}（${scenario.board.width}×${scenario.board.height}）`;
  const base = `生成v1 / seed: ${seed} / ${scenario.board.width}×${scenario.board.height} / 海域: ${sea === 'none' ? 'なし' : sea === 'coast' ? '少なめ' : '多め'}。両軍の地形・施設・初期兵力は180度回転対称。二つの進軍路から敵司令部へ迫れ。後攻補償 +2000G。60ターン終了時に判定する。`;
  const extra = '中立補給所2か所と各軍の工兵を追加。補給所の確保と防御陣地で進軍を支援せよ。内陸河川は生成しない。';
  const heading = version === '1' ? '生成v1' : version === '2' ? `生成v2 / 戦闘seed: ${scenario.battleSeed}` : `生成v3 / 前線補給・工兵 / 戦闘seed: ${scenario.battleSeed}`;
  return {
    name,
    briefing: base.replace('生成v1', heading) + (frontline ? extra : ''),
    english:
      translateGameText(base).replace(
        'Generation v1',
        `Generation v${version}${frontline ? ' / frontline supply and engineers' : ''}${version === '1' ? '' : ` / combat seed: ${scenario.battleSeed}`}`,
      ) + (frontline ? ` ${translateGameText(extra)}` : ''),
  };
}

/** Translate known app-provided metadata without modifying its saved definition. */
export function scenarioDisplayName(scenario: ScenarioDefinition): string {
  const name = scenario.tacticalOptions ? scenario.name.replace(/ \/ Tactical v[12]$/, '') : scenario.name;
  const canonical = builtIns.filter((entry) => entry.id === scenario.id);
  const operation = campaignOperations[scenario.id];
  return canonical.some((entry) => entry.name === name) || operation?.title === name || generatedMetadata(scenario)?.name === name ? translateGameText(name) : name;
}

export function scenarioDisplayBriefing(scenario: ScenarioDefinition): string {
  const canonical = builtIns.filter((entry) => entry.id === scenario.id);
  const operation = campaignOperations[scenario.id];
  const orders = operation && `${operation.orders} 別途、敵司令部の占領でも勝利。補給方針：${operation.logistics} 敵軍の作戦：${operation.enemyOrders}`;
  const generated = generatedMetadata(scenario);
  if (getLocale() === 'en' && generated?.briefing === scenario.briefing) return generated.english;
  if (!canonical.some((entry) => entry.briefing === scenario.briefing) && orders !== scenario.briefing) return scenario.briefing;
  if (getLocale() === 'en') return translateGameText(scenario.briefing);
  return scenario.briefing
    .replace(/指定部隊 ([rb]\d+(?:・[rb]\d+)*) のうち/g, (_, ids: string) => `指定の${ids.split('・').length}部隊のうち`)
    .replace('護衛対象 r1 の補給車', '護衛対象の補給車')
    .replace('指定歩兵 r2 を', '指定の歩兵を');
}

export function conditionDescription(condition: VictoryCondition, fromOpponent = false): string {
  const en = getLocale() === 'en';
  if (condition.type === 'escort' || condition.type === 'withdraw') {
    const total = condition.unitIds.length;
    if (en) {
      const targets = total === 1 ? 'the designated unit' : `${condition.required} of the ${total} designated units`;
      return fromOpponent ? `The enemy evacuates ${targets} through an exit` : `Evacuate ${targets} through an exit (losing too many targets means defeat)`;
    }
    const targets = total === 1 ? '指定の部隊' : `指定の${total}部隊のうち${condition.required}部隊`;
    return fromOpponent ? `敵軍が${targets}を脱出地点から撤退させる` : `${targets}を脱出地点から撤退させる（対象不足で敗北）`;
  }
  if (!en && !fromOpponent) return condition.type === 'survive' ? `${condition.untilTurn}ラウンド開始まで生存する` : describeVictoryCondition(condition);
  switch (condition.type) {
    case 'eliminate':
      return fromOpponent ? (en ? 'All your units are eliminated' : '自軍の部隊が全滅する') : 'Eliminate all enemy units';
    case 'captureCapital':
      return fromOpponent ? (en ? 'Your headquarters is captured' : '自軍の司令部を占領される') : 'Capture enemy headquarters';
    case 'hold': {
      if (!en) return `敵軍が${describeVictoryCondition(condition)}`;
      const action = condition.requireOwnership
        ? fromOpponent
          ? 'The enemy captures the designated property, then holds it'
          : 'Capture the designated property, then hold it'
        : fromOpponent
          ? 'The enemy holds the designated location'
          : 'Hold the designated location';
      return `${action}${condition.groundOnly ? ' with ground units' : ''} for ${condition.turns} consecutive turns`;
    }
    case 'survive':
      return en ? `${fromOpponent ? 'The enemy survives' : 'Survive'} to the start of round ${condition.untilTurn}` : `敵軍が${condition.untilTurn}ラウンド開始まで生存する`;
    case 'score':
      return en ? `${fromOpponent ? 'The enemy earns' : 'Earn'} ${condition.target} points` : `敵軍がスコア${condition.target}を獲得する`;
    case 'control':
      if (!en) return `敵軍が指定拠点の所有でラウンド終了時に加点し、${condition.target}点に到達する`;
      return fromOpponent
        ? `The enemy earns points for owned objectives at the end of each round and reaches ${condition.target} points`
        : `Earn points for owned objectives at the end of each round and reach ${condition.target} points`;
  }
}
