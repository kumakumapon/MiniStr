import type { ScenarioDefinition, VictoryCondition } from '../game/maps';
import { scenarioForState } from '../game/maps';
import { LOGISTICS_RULE_VERSION, type GameState, type PlayerId } from '../game/types';
import { decisionRound } from '../game/victory';
import { getLocale } from './locale';
import { conditionDescription } from './scenarioText';

/** Read timing from the same definition and rule version used by victory evaluation. */
export function scenarioTiming(scenario: ScenarioDefinition, rules: Pick<GameState, 'ruleVersion'> = { ruleVersion: LOGISTICS_RULE_VERSION }) {
  return { deadline: scenario.turnLimit, decision: decisionRound(rules, scenario) };
}

export function timingSummary(timing: { deadline?: number; decision?: number }): string {
  const en = getLocale() === 'en';
  const parts: string[] = [];
  if (timing.deadline !== undefined) parts.push(en ? `Deadline: end of round ${Number(timing.deadline)}` : `期限：${Number(timing.deadline)}ラウンド終了`);
  if (timing.decision !== undefined)
    parts.push(en ? `Decision: from the end of round ${Number(timing.decision)}; complete ties continue` : `判定：${Number(timing.decision)}ラウンド終了時から・完全同点なら続行`);
  return parts.join(' / ') || (en ? 'No deadline or scheduled decision; objectives end the match' : '期限・定時判定なし（作戦目標で終了）');
}

/** The normalized blue survival goal means defending through the final playable round. */
export function isDeadlineCondition(scenario: ScenarioDefinition | undefined, condition: VictoryCondition, player: PlayerId): boolean {
  return player === 'blue' && scenario?.turnLimit !== undefined && condition.type === 'survive' && condition.untilTurn === scenario.turnLimit + 1;
}

export function scenarioConditionDescription(scenario: ScenarioDefinition, condition: VictoryCondition, player: PlayerId): string {
  if (!isDeadlineCondition(scenario, condition, player)) return conditionDescription(condition);
  return getLocale() === 'en' ? `Deadline reached (end of round ${Number(scenario.turnLimit)})` : `作戦期限（${Number(scenario.turnLimit)}ラウンド終了）に到達`;
}

export function objectiveTimingDescription(state: GameState, condition: VictoryCondition, player: PlayerId): string {
  const scenario = scenarioForState(state);
  return scenario ? scenarioConditionDescription(scenario, condition, player) : conditionDescription(condition);
}

/** A tied decision is checked again at later round ends, rather than becoming a zero deadline. */
export function timingProgress(timing: { deadline?: number; decision?: number }, round: number): string {
  const en = getLocale() === 'en';
  if (timing.deadline !== undefined) {
    const remaining = Math.max(0, timing.deadline - round + 1);
    return en ? `${remaining} round${remaining === 1 ? '' : 's'} left until deadline` : `期限まで残り${remaining}ラウンド`;
  }
  if (timing.decision !== undefined) {
    if (round > timing.decision) return en ? 'Decision at each round end (complete ties continue)' : '毎ラウンド終了時に再判定（完全同点なら続行）';
    const remaining = Math.max(0, timing.decision - round + 1);
    return en ? `${remaining} round${remaining === 1 ? '' : 's'} until decision` : `判定まで残り${remaining}ラウンド`;
  }
  return en ? 'Victory by objectives' : '作戦目標で決着';
}

export function campaignTimingSummary(recommended: number, timing: { deadline?: number; decision?: number } = {}): string {
  const en = getLocale() === 'en';
  return (en ? `Recommended: ${Number(recommended)} rounds (grading guide)` : `推奨：${Number(recommended)}ラウンド（評価の目安）`) + ' / ' + timingSummary(timing);
}
