import { renderMusicControls } from './musicControls';
import type { MusicSettings } from './music';
import { SUPPLY_CAPACITY } from '../game/supplyStock';
import { getLocale, renderLocalePicker } from './locale';
import { renderCpuSpeedControl } from './cpuSpeed';
import { BOARD_ZOOM_LEVELS, boardZoomPercent } from './boardZoom';
import type { CommandSpeed } from './commandScheduler';
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
    ? `<dl class="result-summary"><div><dt>${uiText.resultMap}</dt><dd data-user-content>${escapeHtml(options.mapName)}</dd></div><div><dt>${uiText.resultDifficulty}</dt><dd>${escapeHtml(options.difficultyName)}</dd></div><div><dt>${uiText.resultWinner}</dt><dd>${escapeHtml(names[options.summary.winner])}</dd></div><div><dt>${uiText.resultTurns}</dt><dd>${options.summary.turns}</dd></div><div><dt>${escapeHtml(names.red)}</dt><dd>${uiText.resultScore(options.summary.kills.red, options.summary.captures.red)}</dd></div><div><dt>${escapeHtml(names.blue)}</dt><dd>${uiText.resultScore(options.summary.kills.blue, options.summary.captures.blue)}</dd></div></dl>`
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
  campaignPreparation?: { support: number; veterans: number };
  /** Trusted markup from the deployment renderer, kept inside the existing briefing dialog. */
  deployment?: string;
  beginDisabled?: boolean;
  /** Offered outside campaigns; the chosen format applies when the operation starts. */
  matchMode?: MatchMode;
  /** Headings for the two condition lists; default to victory and defeat. */
  conditionHeadings?: { victory: string; defeat: string };
  /** Spectating: each side's CPU difficulty, chosen before the CPUs start. */
  spectateDifficulties?: SpectateDifficultyChoice;
  /** Offers a way back to the title's map list (skirmishes only). */
  backToTitle?: boolean;
  finiteSupplies?: boolean;
  requiresAirlift?: boolean;
  /** Daily challenge: format and supply mode are fixed, so their controls are shown but disabled. */
  fixedConditions?: boolean;
}): string {
  if (!options.visible) return '';
  const headings = options.conditionHeadings ?? {
    victory: uiText.victoryConditions,
    defeat: uiText.defeatConditions,
  };
  const modeChoice = options.campaignRun || options.matchMode === undefined ? '' : renderMatchModeChoice(options.matchMode, options.fixedConditions);
  const difficultyChoice =
    options.campaignRun || options.matchMode !== 'spectate' || !options.spectateDifficulties ? '' : renderSpectateDifficultyChoice(options.spectateDifficulties);
  const english = getLocale() === 'en';
  const airliftHint = options.requiresAirlift
    ? `<p>${english ? 'Transport helicopters require the finite-supply rules.' : '輸送ヘリを含む編成では有限補給方式を使用します。'}</p>`
    : '';
  const supplyChoice = `<section class="briefing-supplies">${options.campaignRun ? `<strong>${english ? `APC supplies: finite (${SUPPLY_CAPACITY} points)` : `補給車の物資：有限（${SUPPLY_CAPACITY}ポイント）`}</strong>` : `<label for="briefing-supply-mode">${english ? 'APC supply mode' : '補給車の物資制限'}</label><select id="briefing-supply-mode" ${options.fixedConditions ? 'disabled' : ''}><option value="finite" ${options.finiteSupplies !== false ? 'selected' : ''}>${english ? `Finite (${SUPPLY_CAPACITY} points per APC)` : `有限（1両${SUPPLY_CAPACITY}ポイント）`}</option><option value="unlimited" ${options.requiresAirlift ? 'disabled' : ''} ${options.finiteSupplies === false ? 'selected' : ''}>${english ? 'Unlimited (previous rules)' : '無制限（従来方式）'}</option></select>`}<p>${english ? 'Finite: ammo costs 10 points per round, fuel costs 1 per unit. Cargo first, then adjacent units by ID; primary ammo, secondary ammo, then fuel. Cities, factories, HQs and supply depots replenish stock. APCs cannot transfer stock; no HP repairs.' : '有限時：弾薬1発10、燃料1につき1ポイント。搭載部隊、隣接部隊のID順に、主武器・副武器・燃料の順で配分します。都市・工場・司令部・補給所で物資を補充。APC同士の物資移送・HP修理は行いません。'}</p></section>`;
  const list = (conditions: readonly string[]) => conditions.map((condition) => `<li>${escapeHtml(condition)}</li>`).join('');
  const preparation = options.campaignPreparation
    ? `<section class="campaign-preparation" aria-label="出撃支援と部隊継承"><strong>出撃支援 +${options.campaignPreparation.support}G ／ 経験継承 ${options.campaignPreparation.veterans}部隊</strong><p>初期資金は初回収入と支援込み。前作戦の生還部隊から同種の初期部隊へ経験を継承し、耐久・弾薬・燃料は全回復して出撃します。</p><p>指定地点の保持は、部隊を配置して自軍のターンを終了すると進みます。「占領して保持」の拠点では、先に歩兵などで占領してください。自軍ターン終了時に配置部隊がいなければ、連続保持はやり直しです。</p></section>`
    : '';
  return `<div class="briefing-overlay" role="dialog" aria-modal="true" aria-labelledby="briefing-title" aria-describedby="briefing-copy"><section class="briefing-card"><p class="card-kicker">OPERATION BRIEFING</p><h2 id="briefing-title" data-user-content>${escapeHtml(options.mapName)}</h2><p id="briefing-copy" class="briefing-copy">${escapeHtml(options.briefing)}</p><div class="briefing-objectives"><section><h3>${escapeHtml(headings.victory)}</h3><ul>${list(options.victoryConditions)}</ul></section><section><h3>${escapeHtml(headings.defeat)}</h3><ul>${list(options.defeatConditions)}</ul></section></div><div class="briefing-meta"><span>${uiText.startingGold} <strong>${options.startingGold}G</strong></span><span>${uiText.turnLimit} <strong>${options.turnLimit ?? uiText.none}</strong></span><span>${uiText.difficulty} <strong>${escapeHtml(options.difficultyName)}</strong></span></div>${preparation}${modeChoice}${difficultyChoice}${supplyChoice}${airliftHint}${options.deployment ?? ''}<div class="briefing-actions">${options.backToTitle && !options.campaignRun ? `<button id="briefing-back-to-title" class="save-action">${uiText.titleBackFromBriefing}</button>` : ''}<button id="open-campaign-briefing" class="save-action">${uiText.campaign}</button><button id="begin-operation" class="end-turn" ${options.beginDisabled ? 'disabled' : ''}>${options.campaignRun ? uiText.beginCampaignOperation : uiText.beginSkirmish} <span aria-hidden="true">→</span></button></div></section></div>`;
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

function renderMatchModeChoice(mode: MatchMode, fixed = false): string {
  const option = (value: MatchMode, label: string) =>
    `<label><input type="radio" name="match-mode" value="${value}" ${mode === value ? 'checked' : ''} ${fixed ? 'disabled' : ''}> ${label}</label>`;
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
export function renderTitleOverlay(options: {
  visible: boolean;
  maps: readonly TitleMapCard[];
  canContinue: boolean;
  canResume: boolean;
  notice: string;
  savePicker?: string;
  generator?: string;
  /** Trusted markup for the daily challenge card, shown above the save and map lists. */
  daily?: string;
  cpuSpeed?: CommandSpeed;
  boardZoom?: { index: number; automatic: boolean };
  musicSettings?: MusicSettings;
  musicOpen?: boolean;
}): string {
  if (!options.visible) return '';
  const automatic = options.boardZoom?.automatic ?? true;
  const zoomLabel = getLocale() === 'en' ? 'Map display size' : 'マップ表示サイズ';
  const zoomControl = `<label class="map-picker board-zoom-control">${zoomLabel}<select id="title-board-zoom" aria-label="${zoomLabel}"><option value="auto" ${automatic ? 'selected' : ''}>${getLocale() === 'en' ? 'Auto' : '自動'}</option>${BOARD_ZOOM_LEVELS.map((_, index) => `<option value="${boardZoomPercent(index)}" ${!automatic && options.boardZoom?.index === index ? 'selected' : ''}>${boardZoomPercent(index)}%</option>`).join('')}</select></label>`;
  const cards = options.maps
    .map(
      (map) =>
        `<li class="title-map-entry"><button class="title-map-card" data-map-id="${escapeHtml(map.id)}" ${map.selected ? 'aria-current="true"' : ''}>${map.preview}<span class="title-map-name">${escapeHtml(map.name)}${map.custom ? `<em>${uiText.titleCustom}</em>` : ''}</span><span class="title-map-facts"><span>${escapeHtml(map.theme)}</span><span>${uiText.titleBoard(map.width, map.height)}</span><span>${uiText.titleGold(map.startingGold)}</span><span>${uiText.titleTurnLimit(map.turnLimit)}</span></span><span class="title-map-victory">${escapeHtml(map.victory)}</span></button>${map.custom ? `<button type="button" class="save-action title-map-delete" id="title-delete-${escapeHtml(map.id)}" data-delete-custom-map="${escapeHtml(map.id)}" data-user-attributes="aria-label" aria-label="${escapeHtml(uiText.customMapDeleteLabel(map.name))}">${uiText.customMapDelete}</button>` : ''}</li>`,
    )
    .join('');
  return `<div class="title-overlay" role="dialog" aria-modal="true" aria-labelledby="title-heading"><section class="title-screen"><header class="title-hero"><p class="card-kicker">${uiText.titleKicker}</p><h2 id="title-heading">${uiText.titleHeading}</h2><p>${uiText.titleLead}</p></header><nav class="title-menu" aria-label="${uiText.titleMenu}">${renderLocalePicker()}${renderCpuSpeedControl(options.cpuSpeed ?? 1, 'title-cpu-speed')}${zoomControl}${options.canResume ? `<button id="title-resume" class="end-turn">${uiText.titleResume}</button>` : ''}<button id="title-continue" class="save-action" ${options.canContinue ? '' : 'disabled'}>${uiText.titleContinue}</button><button id="title-training" class="save-action">基本操作を練習</button><button id="title-campaign" class="save-action">${uiText.titleCampaign}</button><button id="title-import-replay" class="save-action">${uiText.titleImportReplay}</button><button id="title-editor" class="save-action">${uiText.titleEditor}</button><input id="title-replay-file" class="visually-hidden" type="file" accept=".json,application/json" aria-label="JSONリプレイファイルを選択"></nav><details id="title-music-settings" class="title-music-settings" ${options.musicOpen ? 'open' : ''}><summary>${getLocale() === 'en' ? 'BGM settings' : 'BGM設定'}</summary>${renderMusicControls(options.musicSettings, 'title-music', true)}</details>${options.daily ?? ''}${options.savePicker ?? ''}${options.generator ?? ''}${options.notice ? `<p class="title-notice" role="status">${escapeHtml(options.notice)}</p>` : ''}<section aria-labelledby="title-maps-heading"><h3 id="title-maps-heading">${uiText.titleMapsHeading}</h3><ol class="title-map-list">${cards}</ol></section></section></div>`;
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
