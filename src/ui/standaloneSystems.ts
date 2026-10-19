import type { AnalysisSide, BattleAnalysis, ReconContact } from '../game/battleHistory';
import type { DeploymentPresetCatalog } from '../game/deploymentPresets';
import { GENERATED_SEAS, GENERATED_SIZES } from '../game/mapGenerator';
import type { PlayerId } from '../game/types';
import { unitNames, unitTokens } from './labels';
import { escapeHtml } from './strings';

export interface PresetView {
  catalog?: DeploymentPresetCatalog;
  notice: string;
  draftNames: Readonly<Record<string, string>>;
}
export const presetNameKey = (player: PlayerId, slot: number) => `${player}-${slot}`;

export function renderPresetControls(scenarioId: string, player: PlayerId, canSave: boolean, view: PresetView): string {
  if (!view.catalog)
    return `<section class="deployment-presets"><p role="alert">${escapeHtml(view.notice)}</p><button id="briefing-presets-${player}-reset" data-presets-reset class="save-action">プリセット保存を初期化</button></section>`;
  return `<section class="deployment-presets" aria-label="${player === 'red' ? '赤軍' : '青軍'}の編成プリセット"><h4>編成プリセット（作戦・陣営別に3件）</h4>${[0, 1, 2]
    .map((slot) => {
      const preset = view.catalog!.presets.find((entry) => entry.scenarioId === scenarioId && entry.player === player && entry.slot === slot);
      const name = view.draftNames[presetNameKey(player, slot)] ?? preset?.name ?? `編成${slot + 1}`;
      return `<div class="preset-row"><label>プリセット${slot + 1}<input id="briefing-preset-${player}-${slot}-name" data-preset-name="${player}-${slot}" maxlength="24" value="${escapeHtml(name)}" aria-label="${player === 'red' ? '赤軍' : '青軍'}プリセット${slot + 1}の名前"></label><div class="preset-actions">${(['save', 'apply', 'delete'] as const).map((action) => `<button id="briefing-preset-${player}-${slot}-${action}" class="save-action" data-preset-action="${action}" data-preset-player="${player}" data-preset-slot="${slot}" ${(action === 'save' ? !canSave : !preset) ? 'disabled' : ''}>${action === 'save' ? (preset ? '上書き保存' : '保存') : action === 'apply' ? '適用' : '削除'}</button>`).join('')}</div></div>`;
    })
    .join('')}${view.notice ? `<p role="status">${escapeHtml(view.notice)}</p>` : ''}</section>`;
}

export interface GeneratorForm {
  size: number;
  sea: string;
  seed: string;
}
export function renderMapGenerator(form: GeneratorForm, notice: string, open: boolean): string {
  const seaNames: Record<string, string> = { none: '海域なし', coast: '海域少なめ', ocean: '海域多め' };
  return `<details id="title-generator" class="map-generator" ${open ? 'open' : ''}><summary>対称マップを生成</summary><p>同じ条件とseedで地形と戦闘の乱数を再現します。生成した戦域はカスタム作戦として保存します。</p><div class="generator-fields"><label>サイズ<select id="title-generator-size">${GENERATED_SIZES.map((size) => `<option value="${size}" ${form.size === size ? 'selected' : ''}>${size}×${size - 4}</option>`).join('')}</select></label><label>海域量<select id="title-generator-sea">${GENERATED_SEAS.map((sea) => `<option value="${sea}" ${form.sea === sea ? 'selected' : ''}>${seaNames[sea]}</option>`).join('')}</select></label><label>seed<input id="title-generator-seed" value="${escapeHtml(form.seed)}" maxlength="24" pattern="[A-Za-z0-9_-]{1,24}" aria-describedby="title-generator-help"></label></div><p id="title-generator-help">seedは英数字・ハイフン・アンダースコア1〜24文字。地形・施設・兵力は180度回転対称、後攻補償は+2000Gです。</p>${notice ? `<p role="alert">${escapeHtml(notice)}</p>` : ''}<button id="title-generator-create" class="end-turn">生成して作戦準備へ</button></details>`;
}

export function reconContactLabel(contact: ReconContact): string {
  return `${unitNames[contact.kind]}の最終確認 (${contact.position.x + 1}, ${contact.position.y + 1})・${contact.turn}ターン目${contact.phase === 'red' ? '赤軍' : '青軍'}手番。現在位置は不明`;
}
export function renderReconMarker(contact: ReconContact): string {
  return `<span class="recon-contact" aria-hidden="true"><b>? ${unitTokens[contact.kind]}</b><small>最終 T${contact.turn}</small></span>`;
}
export function renderReconPanel(contacts: readonly ReconContact[], showMarkers: boolean, open: boolean): string {
  return `<details id="recon-history" class="history-panel" ${open ? 'open' : ''}><summary>索敵記録：最終確認 ${contacts.length}部隊</summary><p>過去に見えた位置です。現在そこにいるとは限りません。再索敵して空になった地点の記録は消去します。</p><label><input id="recon-markers" type="checkbox" ${showMarkers ? 'checked' : ''}> 最終確認位置をマップに表示</label>${contacts.length ? `<ul class="recon-list">${contacts.map((contact) => `<li><button class="save-action" data-recon-x="${contact.position.x}" data-recon-y="${contact.position.y}">${escapeHtml(reconContactLabel(contact))}</button></li>`).join('')}</ul>` : '<p>現在の視界外になった敵の記録はありません。</p>'}</details>`;
}

export type AnalysisMetric = keyof AnalysisSide;
export const ANALYSIS_METRICS: readonly AnalysisMetric[] = ['units', 'income', 'losses'];
export function renderBattleAnalysis(analysis: BattleAnalysis | undefined, metric: AnalysisMetric, open: boolean): string {
  if (!analysis) return '';
  const labels: Record<AnalysisMetric, string> = { units: '部隊数', income: '収入（G）', losses: '累計損失' };
  const samples = analysis.samples;
  const max = Math.max(1, ...samples.flatMap((sample) => [sample.red[metric], sample.blue[metric]]));
  const points = (player: PlayerId) =>
    samples.map((sample, index) => `${16 + (index * 288) / Math.max(1, samples.length - 1)},${124 - (sample[player][metric] * 108) / max}`).join(' ');
  return `<details id="battle-analysis" class="history-panel" ${open ? 'open' : ''}><summary>観戦分析：兵力・収入・損失</summary><p>全体視点の情報です。各ターン最後の記録を最大256ターン表示し、現在のターンは途中経過です。撤退・合流は損失に数えません。</p><label>表示項目<select id="analysis-metric">${ANALYSIS_METRICS.map((value) => `<option value="${value}" ${value === metric ? 'selected' : ''}>${labels[value]}</option>`).join('')}</select></label><svg class="analysis-chart" data-analysis-metric="${metric}" viewBox="0 0 320 145" role="img" aria-label="${labels[metric]}の推移。実線は赤軍、破線は青軍。数値は下の表を参照"><path d="M16 16V124H304" stroke="currentColor" fill="none"/><polyline points="${points('red')}" fill="none" stroke="#ff9393" stroke-width="3"/><polyline points="${points('blue')}" fill="none" stroke="#8bc9ff" stroke-width="3" stroke-dasharray="6 3"/><text x="16" y="140">T${samples[0]?.turn ?? 0}</text><text x="275" y="140">T${samples.at(-1)?.turn ?? 0}</text></svg><div class="analysis-table-wrap"><table><caption>${labels[metric]}：赤軍／青軍</caption><thead><tr><th>ターン</th><th>赤軍（実線）</th><th>青軍（破線）</th></tr></thead><tbody>${samples.map((sample) => `<tr><th>${sample.turn}</th><td>${sample.red[metric]}</td><td>${sample.blue[metric]}</td></tr>`).join('')}</tbody></table></div><h4>直近のターン要約</h4><ol class="analysis-summary">${analysis.summaries
    .slice(-8)
    .reverse()
    .map(
      (summary) =>
        `<li>T${summary.turn}：攻撃${summary.attacks}・生産${summary.produced}・占領${summary.captured}・撤退${summary.evacuated}・損失 赤${summary.losses.red}／青${summary.losses.blue}</li>`,
    )
    .join('')}</ol></details>`;
}
