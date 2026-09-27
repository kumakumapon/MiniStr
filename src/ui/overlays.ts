import type { MatchMode } from './matchControl';
import { escapeHtml, uiText } from './strings';

export interface ResultSummaryView {
  winner: 'red' | 'blue';
  turns: number;
  kills: Record<'red' | 'blue', number>;
  captures: Record<'red' | 'blue', number>;
}

/** Pure markup renderers keep modal structure out of the game-state coordinator. */
export function renderGameOverOverlay(options: {
  visible: boolean;
  winner?: 'red' | 'blue';
  summary?: ResultSummaryView;
  summaryError?: string;
  mapName: string;
  difficultyName: string;
  campaignResult: string;
  campaignActions: string;
  /** Shown under the headline when the match ended by decision. */
  reasonLabel?: string;
  /** How each side is named; defaults to the player and the CPU. */
  sideNames?: { red: string; blue: string };
}): string {
  if (!options.visible || !options.winner) return '';
  const names = options.sideNames ?? { red: uiText.player, blue: uiText.cpu };
  const headline = options.sideNames ? uiText.sideVictory(names[options.winner]) : options.winner === 'red' ? uiText.playerVictory : uiText.cpuVictory;
  const summary = options.summary
    ? `<dl class="result-summary"><div><dt>${uiText.resultMap}</dt><dd>${escapeHtml(options.mapName)}</dd></div><div><dt>${uiText.resultDifficulty}</dt><dd>${escapeHtml(options.difficultyName)}</dd></div><div><dt>${uiText.resultWinner}</dt><dd>${escapeHtml(names[options.summary.winner])}</dd></div><div><dt>${uiText.resultTurns}</dt><dd>${options.summary.turns}</dd></div><div><dt>${escapeHtml(names.red)}</dt><dd>${uiText.resultScore(options.summary.kills.red, options.summary.captures.red)}</dd></div><div><dt>${escapeHtml(names.blue)}</dt><dd>${uiText.resultScore(options.summary.kills.blue, options.summary.captures.blue)}</dd></div></dl>`
    : `<p class="result-error">${escapeHtml(options.summaryError ?? uiText.resultUnavailable)}</p>`;
  return `<div class="game-over" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="game-over-card"><p class="card-kicker">RESULT</p><h2 id="result-title" tabindex="-1">${escapeHtml(headline)}</h2>${options.reasonLabel ? `<p class="result-reason">${escapeHtml(options.reasonLabel)}</p>` : ''}${summary}${options.campaignResult}<div class="result-actions"><button id="view-replay" class="save-action">${uiText.viewReplay}</button><button id="export-replay" class="save-action">${uiText.exportReplay}</button>${options.campaignActions}</div></div></div>`;
}

export function renderCampaignOverlay(open: boolean, stageCount: number, notice: string, cards: string): string {
  if (!open) return '';
  return `<div class="campaign-overlay" role="dialog" aria-modal="true" aria-labelledby="campaign-title"><section class="campaign-screen"><div class="campaign-heading"><div><p class="card-kicker">MINI CAMPAIGN</p><h2 id="campaign-title">${uiText.campaignTitle}</h2><p>${uiText.campaignDescription(stageCount)}</p></div><div class="campaign-heading-actions"><button id="campaign-skirmish" class="save-action">${uiText.campaignSkirmish}</button><button id="campaign-close" class="save-action">${uiText.close}</button></div></div>${notice ? `<p class="campaign-notice" aria-live="polite">${escapeHtml(notice)}</p>` : ''}<div class="campaign-grid">${cards}</div></section></div>`;
}

export function renderBriefingOverlay(options: {
  visible: boolean;
  mapName: string;
  briefing: string;
  victoryConditions: readonly string[];
  defeatConditions: readonly string[];
  startingGold: number;
  turnLimit?: number;
  difficultyName: string;
  campaignRun: boolean;
  /** Offered outside campaigns; the chosen format applies when the operation starts. */
  matchMode?: MatchMode;
  /** Headings for the two condition lists; default to victory and defeat. */
  conditionHeadings?: { victory: string; defeat: string };
  /** Spectating: each side's CPU difficulty, chosen before the CPUs start. */
  spectateDifficulties?: SpectateDifficultyChoice;
  /** Offers a way back to the title's map list (skirmishes only). */
  backToTitle?: boolean;
}): string {
  if (!options.visible) return '';
  const headings = options.conditionHeadings ?? { victory: uiText.victoryConditions, defeat: uiText.defeatConditions };
  const modeChoice = options.campaignRun || options.matchMode === undefined ? '' : renderMatchModeChoice(options.matchMode);
  const difficultyChoice =
    options.campaignRun || options.matchMode !== 'spectate' || !options.spectateDifficulties ? '' : renderSpectateDifficultyChoice(options.spectateDifficulties);
  const list = (conditions: readonly string[]) => conditions.map((condition) => `<li>${escapeHtml(condition)}</li>`).join('');
  return `<div class="briefing-overlay" role="dialog" aria-modal="true" aria-labelledby="briefing-title" aria-describedby="briefing-copy"><section class="briefing-card"><p class="card-kicker">OPERATION BRIEFING</p><h2 id="briefing-title">${escapeHtml(options.mapName)}</h2><p id="briefing-copy" class="briefing-copy">${escapeHtml(options.briefing)}</p><div class="briefing-objectives"><section><h3>${escapeHtml(headings.victory)}</h3><ul>${list(options.victoryConditions)}</ul></section><section><h3>${escapeHtml(headings.defeat)}</h3><ul>${list(options.defeatConditions)}</ul></section></div><div class="briefing-meta"><span>${uiText.startingGold} <strong>${options.startingGold}G</strong></span><span>${uiText.turnLimit} <strong>${options.turnLimit ?? uiText.none}</strong></span><span>${uiText.difficulty} <strong>${escapeHtml(options.difficultyName)}</strong></span></div>${modeChoice}${difficultyChoice}<div class="briefing-actions">${options.backToTitle && !options.campaignRun ? `<button id="briefing-back-to-title" class="save-action">${uiText.titleBackFromBriefing}</button>` : ''}<button id="open-campaign-briefing" class="save-action">${uiText.campaign}</button><button id="begin-operation" class="end-turn">${options.campaignRun ? uiText.beginCampaignOperation : uiText.beginSkirmish} <span aria-hidden="true">→</span></button></div></section></div>`;
}

export interface SpectateDifficultyChoice {
  red: string;
  blue: string;
  levels: readonly { value: string; label: string }[];
}

function renderSpectateDifficultyChoice(choice: SpectateDifficultyChoice): string {
  const select = (id: string, label: string, current: string) =>
    `<label>${label}<select id="${id}" aria-label="${label}の難易度を選択">${choice.levels.map((level) => `<option value="${escapeHtml(level.value)}" ${level.value === current ? 'selected' : ''}>${escapeHtml(level.label)}</option>`).join('')}</select></label>`;
  return `<fieldset class="briefing-mode"><legend>${uiText.spectateDifficultyLegend}</legend>${select('briefing-red-difficulty', uiText.spectateRedDifficulty, choice.red)}${select('briefing-blue-difficulty', uiText.spectateBlueDifficulty, choice.blue)}</fieldset>`;
}

function renderMatchModeChoice(mode: MatchMode): string {
  const option = (value: MatchMode, label: string) => `<label><input type="radio" name="match-mode" value="${value}" ${mode === value ? 'checked' : ''}> ${label}</label>`;
  return `<fieldset class="briefing-mode"><legend>${uiText.matchMode}</legend>${option('cpu', uiText.matchModeCpu)}${option('hotseat', uiText.matchModeHotseat)}${option('spectate', uiText.matchModeSpectate)}</fieldset>`;
}

export interface TitleMapCard {
  id: string;
  name: string;
  /** Display name of the map's theme. */
  theme: string;
  width: number;
  height: number;
  startingGold: number;
  turnLimit?: number;
  /** One line summarising how to win. */
  victory: string;
  custom: boolean;
  /** The map the current or last match used. */
  selected: boolean;
  /** Decorative SVG from `renderMapPreview`; markup built only from numbers and fixed colours. */
  preview: string;
}

/**
 * The first screen: pick a map to see its briefing, or continue, open the
 * campaign, import a replay, or edit maps. `canResume` is set when it was opened
 * from a match, which it then returns to unchanged.
 */
export function renderTitleOverlay(options: { visible: boolean; maps: readonly TitleMapCard[]; canContinue: boolean; canResume: boolean; notice: string }): string {
  if (!options.visible) return '';
  const cards = options.maps
    .map(
      (map) =>
        `<li><button class="title-map-card" data-map-id="${escapeHtml(map.id)}" ${map.selected ? 'aria-current="true"' : ''}>${map.preview}<span class="title-map-name">${escapeHtml(map.name)}${map.custom ? `<em>${uiText.titleCustom}</em>` : ''}</span><span class="title-map-facts"><span>${escapeHtml(map.theme)}</span><span>${uiText.titleBoard(map.width, map.height)}</span><span>${uiText.titleGold(map.startingGold)}</span><span>${uiText.titleTurnLimit(map.turnLimit)}</span></span><span class="title-map-victory">${escapeHtml(map.victory)}</span></button></li>`,
    )
    .join('');
  return `<div class="title-overlay" role="dialog" aria-modal="true" aria-labelledby="title-heading"><section class="title-screen"><header class="title-hero"><p class="card-kicker">${uiText.titleKicker}</p><h2 id="title-heading">${uiText.titleHeading}</h2><p>${uiText.titleLead}</p></header><nav class="title-menu" aria-label="${uiText.titleMenu}">${options.canResume ? `<button id="title-resume" class="end-turn">${uiText.titleResume}</button>` : ''}<button id="title-continue" class="save-action" ${options.canContinue ? '' : 'disabled'}>${uiText.titleContinue}</button><button id="title-campaign" class="save-action">${uiText.titleCampaign}</button><button id="title-import-replay" class="save-action">${uiText.titleImportReplay}</button><button id="title-editor" class="save-action">${uiText.titleEditor}</button><input id="title-replay-file" class="visually-hidden" type="file" accept=".json,application/json" aria-label="JSONリプレイファイルを選択"></nav>${options.notice ? `<p class="title-notice" role="status">${escapeHtml(options.notice)}</p>` : ''}<section aria-labelledby="title-maps-heading"><h3 id="title-maps-heading">${uiText.titleMapsHeading}</h3><ol class="title-map-list">${cards}</ol></section></section></div>`;
}

/**
 * Shown between hotseat turns. The caller renders nothing else that carries
 * match information, so the next player cannot see the previous side's view.
 */
export function renderHandoffOverlay(playerName: string): string {
  return `<div class="handoff-overlay" role="dialog" aria-modal="true" aria-labelledby="handoff-title"><section class="handoff-card"><p class="card-kicker">HANDOFF</p><h2 id="handoff-title">${escapeHtml(uiText.handoffTitle(playerName))}</h2><p>${uiText.handoffBody}</p><button id="handoff-start" class="end-turn">${uiText.handoffStart} <span aria-hidden="true">→</span></button></section></div>`;
}

export function renderUnitActionCluster(actions: readonly string[]): string {
  const content = actions.filter(Boolean).join('');
  return content ? `<section class="unit-action-cluster" aria-label="${uiText.selectedUnitActions}">${content}</section>` : '';
}

export function renderProductionCard(target: string, summary: string, units: string): string {
  return `<section class="production-card"><div><p class="card-kicker">PRODUCTION</p><h2>${uiText.unitProduction}</h2></div>${target}${summary}<div class="production-grid">${units}</div></section>`;
}
