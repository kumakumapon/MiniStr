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
  const canonical = builtIns.filter((entry) => entry.id === scenario.id);
  const operation = campaignOperations[scenario.id];
  return canonical.some((entry) => entry.name === scenario.name) || operation?.title === scenario.name || generatedMetadata(scenario)?.name === scenario.name
    ? translateGameText(scenario.name)
    : scenario.name;
}

export function scenarioDisplayBriefing(scenario: ScenarioDefinition): string {
  const canonical = builtIns.filter((entry) => entry.id === scenario.id);
  const operation = campaignOperations[scenario.id];
  const orders = operation && `${operation.orders} 別途、敵司令部の占領でも勝利。補給方針：${operation.logistics} 敵軍の作戦：${operation.enemyOrders}`;
  const generated = generatedMetadata(scenario);
  if (getLocale() === 'en' && generated?.briefing === scenario.briefing) return generated.english;
  return canonical.some((entry) => entry.briefing === scenario.briefing) || orders === scenario.briefing ? translateGameText(scenario.briefing) : scenario.briefing;
}

export function conditionDescription(condition: VictoryCondition): string {
  if (getLocale() !== 'en') return describeVictoryCondition(condition);
  switch (condition.type) {
    case 'eliminate':
      return 'Eliminate all enemy units';
    case 'captureCapital':
      return 'Capture enemy headquarters';
    case 'hold':
      return `${condition.requireOwnership ? 'Capture the designated property, then hold it' : 'Hold the designated location'}${condition.groundOnly ? ' with ground units' : ''} for ${condition.turns} consecutive turns`;
    case 'survive':
      return `Survive until round ${condition.untilTurn}`;
    case 'score':
      return `Earn ${condition.target} points`;
    case 'control':
      return `Earn points for owned objectives at the end of each round and reach ${condition.target} points`;
    case 'escort':
    case 'withdraw':
      return `Evacuate ${condition.required} of ${condition.unitIds.join(', ')} through an exit; losing too many targets means defeat`;
  }
}
