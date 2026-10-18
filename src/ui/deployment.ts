import { createDeploymentScenario, deploymentBudget, deploymentSlots, unitStats, type PlayerId, type ScenarioDefinition, type UnitKind } from '../game';
import { unitNames } from './labels';
import { escapeHtml } from './strings';

export function renderDeployment(
  scenario: ScenarioDefinition,
  choices: Readonly<Record<PlayerId, readonly UnitKind[]>>,
  players: readonly PlayerId[],
  open: boolean,
  notice: string,
): string {
  return `<details class="deployment-panel" id="briefing-deployment" ${open ? 'open' : ''}><summary>出撃前編成：兵科と予算を確認</summary><p>初期配置の各枠で兵科を選べます。未使用の編成予算は開始資金へ加算します。護衛対象と輸送艦は固定。占領用の歩兵系を必要数残してください。</p>${players
    .map((player) => {
      const slots = deploymentSlots(scenario, player);
      const budget = deploymentBudget(scenario, player);
      const selected = choices[player];
      const cost = selected.reduce((sum, kind) => sum + unitStats[kind].cost, 0);
      const result = createDeploymentScenario(scenario, selected, player);
      return `<fieldset><legend>${player === 'red' ? '赤軍' : '青軍'}の編成（${slots.length}枠）</legend><p class="deployment-budget" aria-live="polite">予算 ${budget}G ／ 使用 ${cost}G ／ 残り ${budget - cost}G</p>${slots.map((slot) => `<label class="deployment-slot"><span>${slot.id} (${slot.x + 1}, ${slot.y + 1})${slot.fixed ? ' 固定部隊' : ''}</span><select id="briefing-deployment-${player}-${slot.index}" data-deployment-player="${player}" data-deployment-slot="${slot.index}" aria-label="${player === 'red' ? '赤軍' : '青軍'} ${slot.id}の出撃兵科" ${slot.fixed ? 'disabled' : ''}>${slot.choices.map((kind) => `<option value="${kind}" ${selected[slot.index] === kind ? 'selected' : ''}>${escapeHtml(unitNames[kind])} (${unitStats[kind].cost}G)</option>`).join('')}</select></label>`).join('')}${!result.ok ? `<p class="deployment-error" role="alert">${escapeHtml(result.error)}</p>` : ''}</fieldset>`;
    })
    .join(
      '',
    )}${notice ? `<p class="deployment-error" role="alert">${escapeHtml(notice)}</p>` : ''}<button id="briefing-deployment-reset" class="save-action">既定編成に戻す</button></details>`;
}
