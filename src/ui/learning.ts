import { incomePropertyCount, repairCost, REPAIR_HP_PER_TURN, weaponsForUnit, unitStats, type GameCommand, type GameState, type PlayerId, type UnitKind } from '../game';
import { unitNames, unitWeaponName } from './labels';
import { BattleHistory } from '../game/battleHistory';
import { emptyLearningProgress, type LearningProgress } from '../game/learningLog';
import { learningSteps } from './learningSteps';
import { getLocale } from './locale';
const localized = (ja: string, en: string): string => (getLocale() === 'en' ? en : ja);
import { escapeHtml, uiText } from './strings';

/** Rebuilds from an initial state for isolated callers; the live UI reuses BattleHistory. */
export function learningProgress(initial: GameState, viewer: PlayerId, commands: readonly GameCommand[]): LearningProgress {
  const result = new BattleHistory(initial, commands).learning(commands.length, viewer);
  return result.ok ? result.value : emptyLearningProgress();
}

export function lessonProgress(initial: GameState, viewer: PlayerId, commands: readonly GameCommand[]): boolean[] {
  const p = learningProgress(initial, viewer, commands);
  return [p.move, p.attack, p.capture, p.endTurn, p.produce, p.disembark];
}

export function renderLearning(state: GameState, viewer: PlayerId, progress: LearningProgress, open: boolean): string {
  // The reference table and command history are only needed while the guide is open.
  if (!open)
    return '<details id="learning-panel" class="learning-panel"><summary>操作ガイド・兵科比較（閉じるとヒントをスキップ）</summary><p>ユニットを選択→移動先または攻撃先を選択。占領は歩兵系ユニットで行います。矢印キー・Enter・N（次の部隊）が使えます。</p></details>';
  const steps = learningSteps(state, viewer, progress);
  const income = incomePropertyCount(state, viewer) * 1000;
  return `<details id="learning-panel" class="learning-panel" ${open ? 'open' : ''}><summary>操作ガイド・兵科比較（閉じるとヒントをスキップ）</summary>${steps ? `<p class="learning-progress" role="status">${escapeHtml(localized('次の課題: ', 'Next task: '))}${escapeHtml(steps.find((step) => !step.done)?.title ?? localized('すべて達成', 'All tasks complete'))} (${steps.filter((step) => step.done).length}/${steps.length})</p><ol>${steps.map((step) => `<li data-learning-complete="${step.done}"><strong>${step.done ? '✓ ' : ''}${escapeHtml(step.title)}</strong><p>${escapeHtml(step.text)}</p></li>`).join('')}</ol>` : '<p>ユニットを選択→移動先または攻撃先を選択。占領は歩兵系ユニットで行います。矢印キー・Enter・N（次の部隊）が使えます。</p>'}<p>次の自軍ターンの収入見込み: ${income}G。修理は対応施設で最大${REPAIR_HP_PER_TURN}HP、歩兵なら最大${repairCost('infantry', REPAIR_HP_PER_TURN)}Gです。航空機は空港、艦船は港湾で補給します。</p><p>判定時は拠点数、同数なら残存部隊の価値で比較します。完全同点では決着せず、次のターンへ進みます。相手の燃料・残弾・資金は非公開で、脅威表示は補給済みを仮定します。</p><p>${escapeHtml(uiText.ammoGuide)}</p><div class="unit-reference" tabindex="0" role="region" aria-label="兵科比較表"><table><thead><tr><th>兵科</th><th>${uiText.weapon}</th><th>${uiText.ammoCapacity}</th><th>費用</th><th>移動</th><th>射程</th><th>燃料</th><th>毎ターン消費</th></tr></thead><tbody>${(
    Object.keys(unitStats) as UnitKind[]
  )
    .map(
      (kind) =>
        `<tr><th>${escapeHtml(unitNames[kind])}</th><td>${escapeHtml(unitWeaponName(kind, state))}</td><td>${
          weaponsForUnit(kind, state)
            .map((weapon) => weapon.ammo)
            .join(' / ') || '0'
        }</td><td>${unitStats[kind].cost}</td><td>${unitStats[kind].movement}</td><td>${
          weaponsForUnit(kind, state)
            .map((weapon) => weapon.range.join('–'))
            .join(' / ') || '—'
        }</td><td>${unitStats[kind].fuel}</td><td>${unitStats[kind].fuelPerTurn}</td></tr>`,
    )
    .join('')}</tbody></table></div></details>`;
}
