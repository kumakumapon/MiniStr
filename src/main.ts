import { renderCampaignRoster } from './ui/campaignRoster';
import { renameCampaignVeteran } from './game/campaign';
import { campaignSuccessors } from './game/campaign';
import { defaultArmyPolicies, isArmyPolicy } from './game/armyPolicy';
import { renderArmyPolicies } from './ui/armyPolicy';
import { renderTerrainArt } from './ui/terrainAppearance';
import { renderTerrainLegend } from './ui/terrainLegend';
import { renderMusicControls, syncMusicControls } from './ui/musicControls';
import { BRIDGE_RULE_VERSION, CURRENT_RULE_VERSION } from './game/types';
import { japaneseUnitNames } from './ui/unitNameText';
import { createDeploymentScenario, deploymentSlots, evacuationObjectives, canEvacuateUnit, isEvacuationCondition, isEvacuationTarget, operationScenarios, type GameResult } from './game';
import { renderDeployment } from './ui/deployment';
import { BattleHistory } from './game/battleHistory';
import { remainingRecon } from './game/recon';
import { renderControlObjective, renderOperationChallenges, renderReconControl } from './ui/operationsExpansion';
import { deleteOperationRecord, loadOperationRecords, operationIds, operationVictory, resetOperationRecords, saveOperationVictory, type OperationRecord } from './game/operationRecords';
import { applyDeploymentPreset, deleteDeploymentPreset, loadDeploymentPresets, resetDeploymentPresets, saveDeploymentPreset } from './game/deploymentPresets';
import { dailyConditions, dailyDateKey, dailyDateOfScenarioId, dailyScenario, dailyVictory, deleteDailyRecord, isDailyScenarioId, isStandardDailyDefinition, loadDailyRecords, resetDailyRecords, saveDailyVictory, type DailyRecord } from './game/dailyChallenge';
import { renderDailyBriefingNote, renderDailyResult } from './ui/dailyChallenge';
import { ANALYSIS_METRICS, presetNameKey, reconContactLabel, renderBattleAnalysis, renderReconMarker, renderReconPanel, type AnalysisMetric } from './ui/standaloneSystems';
import { weaponNames } from './ui/labels';
import { hasUsableWeapon, weaponsForUnit, type WeaponSlot } from './game';
import './style.css';
import { getLocale, setLocale, localizeControls, renderLocalePicker, localized, translateText, translateGameText } from './ui/locale';
import { conditionDescription, scenarioDisplayName, scenarioDisplayBriefing } from './ui/scenarioText';
import { renderLearning } from './ui/learning';
import { ResultCache } from './ui/resultCache';
import { buildInfo, diagnosticReport } from './ui/buildInfo';
const resultCache = new ResultCache();
let learningOpen = false;
import { ScreenController } from './ui/screenController';
const screens = new ScreenController();
import { TitleState, buildTitleOverlay } from './ui/titleScreen';
import { bindTitleEvents, installShareLink, installTitleDelegation, type TitleEventDeps } from './ui/titleEvents';
import { renderShareLinkDialog, shareDialogVisible } from './ui/shareLinkDialog';
const titleState = new TitleState(screens);
import { AsyncRequestGate } from './ui/asyncRequest';
const fileReadGate = new AsyncRequestGate();
import { installModalFocusTrap } from './ui/modalFocus';
import { FocusRestoreGuard } from './ui/focusRestore';
import { EditorHistory, inspectEditorScenario, paintEditor, resizeEditor, type PaintMode } from './game/editorTools';
import { renderEditorView } from './ui/editorView';
import { deleteCustomScenario, scenarioDefinitionToData } from './game/maps';
import { ReplayTimeline } from './game/replayTimeline';
import { renderReplayNavigation } from './ui/replayControls';
import { exportBackup, previewBackup, restoreBackup, MAX_BACKUP_BYTES } from './game/backup';
import { downloadJson } from './ui/download';
import { createBrowserStorage } from './ui/storage';
import { observedEnemy } from './game/fog';
import { scenarioForState, type ScenarioDefinition } from './game/maps';
import { campaignDeployment, campaignOperations, createCampaignScenario } from './game/campaignOperations';
import { recordCampaignVeterans } from './game/campaign';
import { withinInteractiveMatchBudget } from './game/session';
const localStorage = createBrowserStorage(() => window.localStorage);
document.documentElement.lang = setLocale(localStorage.getItem('ministr.locale'));
import { isEmbarkableUnit, isMergeableUnit, otherPlayer, transportCapacity } from './game';
import { allProducibleUnitKinds, applyGameCommand, AUTO_SAVE_KEY, availableScenarios, campaignStages, countProductionFacilities, createCampaignProgress, createReplay, createScenarioEditor, createScenarioInitialState, damageRange, decisionRound, decisionStanding, deleteSaves, experienceRank, enemyThreatPreview, exportScenarioEditorJson, forecastCombat, getConditionProgress, gradeCampaignBattle, hasSavedGame, hasStoredSaveData, idleProductionFacilities, importScenarioEditorJson, isCampaignScenarioUnlocked, isDeployedUnit, isUnitKindAvailable, isPropertyTerrainKind, loadCampaignProgress, loadCustomScenarios, loadGame, MANUAL_SAVE_KEY, maps, MAX_REPLAY_BYTES, parseReplay, productionKindsForRule, productionRules, reachablePositionsForPlayer, recordCampaignVictory, saveCampaignProgress, saveCustomScenario, saveGame, scenarioById, scenarioLoadError, serializeReplay, summarizeRepairs, unitLimit, usesDecisionRules, victoryReason, type CampaignGradeResult, type DeployedUnit, type GameCommand, type GameState, type PlayerId, type Position, type ProductionRule, type ReplayFile, type ScenarioEditorState, type TerrainKind, type UnitKind, type VictoryCondition, unitStats, visibleEnemies, visibleEnemyThreats, visiblePositions } from './game';
import { chooseCpuAction, type CpuDifficulty } from './ai';
import { nextBoardPosition } from './ui/boardNavigation';
import { renderCpuSpeedControl } from './ui/cpuSpeed';
import { BOARD_ZOOM_LEVELS, boardAreaWidth, boardTileSize, boardZoomPercent, defaultBoardZoomIndex, parseBoardZoomIndex } from './ui/boardZoom';
import { rankNames, rankStars, terrainNames, unitNames, unitTokens, unitWeaponName } from './ui/labels';
import { describeTileInspection, inspectTile, type InspectorRow } from './ui/tileInspector';
import { fortificationAt, renderFrontlineControls, supplyRange } from './ui/frontline';
import { bridgeDestinations, bridgeError } from './game/bridges';
import { hasBridge } from './game/terrain';
import { bridgeMarker, renderBridgeControls, type BridgePending } from './ui/bridges';
import { fortificationError } from './game/engineering';
import { renderUnitBrief } from './ui/unitBrief';
import { COMMAND_SPEEDS, CommandScheduler, parseCommandSpeed, type CommandSpeed } from './ui/commandScheduler';
import { effectsForViewer, presentationEffectsForCommand, renderPresentationEffects, type PresentationEffect } from './ui/presentationEffects';
import { renderProductionMenu } from './ui/productionMenu';
import { captureRenderScroll } from './ui/renderScroll';
import { centerBoardOnPosition, renderSpectatorCamera, spectatorActionPosition, spectatorUnits } from './ui/spectatorCamera';
import { playBattleSceneAudio } from './ui/battleAudio';
import { BATTLE_SCENE_DURATION_MS, battleSceneForCommand, renderBattleScene, type BattleScene } from './ui/battleScene';
import { ACTION_SCENE_DURATION_MS, actionSceneForCommand, actionSceneForVisiblePositions, renderActionScene, type ActionScene } from './ui/actionScene';
import { capturePointsLabel, displayedPositions, isPropertyDisplayed, observedCapturePoints } from './ui/fogDisplay';
import { loadSoundSettings, ProceduralSoundPlayer, saveSoundSettings, type SoundSettings } from './ui/sound';
import { BackgroundMusicPlayer, FIELD_TRACKS, loadMusicSettings, saveMusicSettings, type MusicSettings } from './ui/music';
import { commandErrorMessage, escapeHtml, uiText } from './ui/strings';
import { renderSaveSlotManager } from './ui/saveSlots';
import { renderMapPreview } from './ui/mapPreview';
/** Previews per scenario object; a changed custom map is a new object, so it is redrawn. */
const mapPreviews = new WeakMap<object, string>();
import { renderBriefingOverlay, renderCampaignOverlay, renderGameOverOverlay, renderHandoffOverlay, renderProductionCard, renderUnitActionCluster } from './ui/overlays';
import { commandAllowed, cpuDifficultyFor, cpuShouldRun, cpuSkipAllowed, handoffAfterEndTurn, menuAllowed, parseMatchMode, autosaveAllowed, manualSaveTarget, matchSaveDeletionAllowed, showsWholeBoard, sideName, spectateContinues, SPECTATE_TURN_LIMIT, undoAllowed, viewerFor, type MatchContext, type MatchMode } from './ui/matchControl';
import { deleteSaveSlot, getStorageUsage, listSaveSlots, loadGameFromSlot, saveGameToSlot, type SavedGame, type ScenarioTheme } from './game';

let selectedMap = maps[0]!;
let game = start(selectedMap.id);
let deploymentBase: ScenarioDefinition | undefined = selectedMap;
let deploymentChoices: Record<PlayerId, UnitKind[]> = { red: deploymentSlots(selectedMap, 'red').map(slot => slot.kind), blue: deploymentSlots(selectedMap, 'blue').map(slot => slot.kind) };
let deploymentOpen = false;
let deploymentNotice = '';
const presetLoad = loadDeploymentPresets(localStorage);
let presetCatalog = presetLoad.ok ? presetLoad.value : undefined;
let presetNotice = presetLoad.ok ? '' : presetLoad.error;
let presetDraftNames: Record<string, string> = {};
let reconOpen = false;
let showSupplyRange = false;
let fortifyPending: string | undefined;
let bridgePending: BridgePending | undefined;
let reconTargeting = false;
const recordsLoad = loadOperationRecords(localStorage);
let operationCatalog = recordsLoad.ok ? recordsLoad.value : undefined;
let operationNotice = recordsLoad.ok ? '' : recordsLoad.error;
const dailyLoad = loadDailyRecords(localStorage);
let dailyCatalog = dailyLoad.ok ? dailyLoad.value : undefined;
let dailyNotice = dailyLoad.ok ? '' : dailyLoad.error;
let dailyOutcome: { code: string; record?: Pick<DailyRecord, 'bestTurns' | 'bestLosses'>; notice: string } | undefined;
let dailyResultGame: GameState | undefined;
let dailyCopyNotice = '';
/** The clock is replaceable only here, so the date a daily match uses is decided in one place. */
const dailyClock = (): Date => new Date();
let operationOutcome: OperationRecord | undefined;
let operationResultGame: GameState | undefined;
let showReconMarkers = true;
let analysisOpen = false;
let analysisMetric: AnalysisMetric = 'units';
let selected: string | undefined;
let weaponSelection: { unitId: string; slot: WeaponSlot } | undefined;
const selectedWeaponSlot = (): WeaponSlot | undefined => weaponSelection?.unitId === selected ? weaponSelection?.slot : undefined;
let boardPointerPending = false;
let focusedPosition: Position = { x: 0, y: 0 };
let message: string = uiText.defaultInstruction;
const loadedCustomScenarios = loadCustomScenarios(localStorage);
if (!loadedCustomScenarios.ok) message = loadedCustomScenarios.error;
/** The CPU's difficulty; in spectating it is blue's, and red uses `redDifficulty`. */
let difficulty: CpuDifficulty = 'normal';
/** Spectating only: red's CPU difficulty. Saves and replays keep recording `difficulty`. */
let redDifficulty: CpuDifficulty = 'normal';
let cpuPolicies = defaultArmyPolicies();
let boardZoomIndex = defaultBoardZoomIndex(boardAreaWidth(window.innerWidth), game.board.width);
/** Cleared the first time the player uses the zoom controls, so a resize stops overriding them. */
let boardZoomAuto = true;
/** Production target chosen by tapping an idle facility; falls back to the first free one. */
let selectedFacility: Position | undefined;
let productionMenuOpen = false;
let productionNotice = '';
let productionReturnSelector: string | undefined;
let preventBoardFocusScroll = false;

function openProductionMenu(position?: Position, returnSelector = '#open-production'): void {
  if (!canCommand()) return;
  const facilities = idleProductionFacilities(game, viewer(), selectedMap.productionRules);
  const facility = facilities.find(candidate => position && key(candidate.position) === key(position)) ?? facilities[0];
  if (!facility) return;
  selected = undefined;
  selectedFacility = { ...facility.position };
  productionMenuOpen = true;
  productionNotice = '';
  productionReturnSelector = returnSelector;
  focusSelector = '#production-facility';
  render();
}
function closeProductionMenu(): void {
  productionMenuOpen = false;
  selectedFacility = undefined;
  focusSelector = productionReturnSelector;
  productionReturnSelector = undefined;
  preventBoardFocusScroll = true;
  render();
}
let initialState = structuredClone(game);
let commandHistory: GameCommand[] = [];
let insightCache: { initial: GameState; commands: readonly GameCommand[]; history: BattleHistory } | undefined;
function historyFor(initial: GameState, commands: readonly GameCommand[]): BattleHistory {
  if (!insightCache || insightCache.initial !== initial || insightCache.commands !== commands) insightCache = { initial, commands, history: new BattleHistory(initial, commands) };
  return insightCache.history;
}
let undoStack: { state: GameState; commandCount: number }[] = [];
interface ReplayRuntime { file: ReplayFile; state: GameState; index: number; playing: boolean; speed: CommandSpeed; timeline: ReplayTimeline; viewpoint: PlayerId | 'all' }
let replay: ReplayRuntime | undefined;
const commandScheduler = new CommandScheduler();
let cpuInProgress = false;
let cpuSkipRequested = false;
let cpuActivity: string[] = [];
let turnStartNotice = '';
/** CPU match or two players on one device; chosen on the briefing (campaigns are CPU only). */
let matchMode: MatchMode = 'cpu';
/** Hotseat: the next side has not taken the device yet, so nothing with match data is drawn. */
let handoffPending = false;
let cpuSpeed: CommandSpeed = 1;
let skipCpuImmediately: (() => void) | undefined;
/** Re-queues the next CPU step; used when a battle scene is closed before its timed wait ends. */
let resumeCpuStep: (() => void) | undefined;
const CPU_STEP_DELAY_MS = 350;
/** Spectating: the viewer stopped the CPU loop; menus work until they resume. */
let spectatePaused = false;
/**
 * Spectating pauses itself when this turn number begins (the turn count rises
 * after blue's end turn); resuming moves it another limit ahead.
 */
let spectatePauseAtTurn = SPECTATE_TURN_LIMIT;
/** Spectating: the viewer asked to see the whole board without fog. Kept across matches. */
let spectateWholeBoard = false;
/** Camera choices belong to the viewer; they never affect CPU decisions or saves. */
let spectateFollow = true;
let spectateLastAction: Position | undefined;
let spectateLocatedUnitId: string | undefined;
let pendingBoardCenter: Position | undefined;

function resetSpectatorCamera(): void {
  spectateLastAction = undefined;
  spectateLocatedUnitId = undefined;
  pendingBoardCenter = undefined;
}

function centerSpectatorOn(position: Position): void {
  focusedPosition = { ...position };
  pendingBoardCenter = { ...position };
  preventBoardFocusScroll = true;
}
let finiteSupplies = true;

let campaignReturnToBriefing = false;
let campaignRun: { scenarioId: string } | undefined;
let campaignOutcome: { result: CampaignGradeResult; persisted: boolean; nextScenarioId?: string; veteranCount: number } | undefined;

let editor: ScenarioEditorState = createScenarioEditor();
let editorNotice = '';
const editorHistory = new EditorHistory();
let paintMode: PaintMode = 'brush';
function syncEditorHistoryControls(): void {
  const undo = app.querySelector<HTMLButtonElement>('#editor-undo');
  const redo = app.querySelector<HTMLButtonElement>('#editor-redo');
  if (undo) undo.disabled = !editorHistory.canUndo;
  if (redo) redo.disabled = !editorHistory.canRedo;
}
function commitEditor(next: ScenarioEditorState, group?: string): void {
  editor = editorHistory.commit(editor, next, group);
  syncEditorHistoryControls();
}
let focusSelector: string | undefined;
const END_TURN_CONFIRM_KEY = 'ministr.confirmEndTurnWithUnacted';
let confirmEndTurnWithUnacted = localStorage.getItem(END_TURN_CONFIRM_KEY) !== 'false';
const loadedCampaign = loadCampaignProgress(localStorage);
let campaignProgress = loadedCampaign.ok ? loadedCampaign.value : createCampaignProgress();
let campaignNotice = loadedCampaign.ok ? '' : loadedCampaign.error;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.addEventListener('input', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.presetName) presetDraftNames[input.dataset.presetName] = input.value;
});
installTitleDelegation(app, titleState);
app.addEventListener('change', event => {
  const input = event.target;
  if (!(input instanceof HTMLSelectElement) || input.id !== 'attack-weapon' || !canCommand() || !selected) return;
  const slot = input.value === '0' ? 0 : input.value === '1' ? 1 : undefined;
  weaponSelection = slot === undefined ? undefined : { unitId: selected, slot };
  focusSelector = '#attack-weapon';
  render();
});
installModalFocusTrap(document);
const focusRestoreGuard = new FocusRestoreGuard();
document.addEventListener('focusin', () => focusRestoreGuard.noteFocusChange());
const difficultyNames = localized<Record<CpuDifficulty, string>>({ easy: '易しい', normal: '普通', hard: '難しい' }, { easy: 'Easy', normal: 'Normal', hard: 'Hard' });
const cpuDifficulties: readonly CpuDifficulty[] = ['easy', 'normal', 'hard'];
/** Form values are checked against the known levels rather than cast. */
const parseCpuDifficulty = (value: string): CpuDifficulty | undefined => cpuDifficulties.find(level => level === value);
let soundSettings: SoundSettings = loadSoundSettings(localStorage);
const soundPlayer = new ProceduralSoundPlayer(soundSettings);
let terrainLegendOpen = false;
let musicSettings: MusicSettings = loadMusicSettings(localStorage);
const musicPlayer = new BackgroundMusicPlayer(musicSettings);
let pendingPresentationEffects: PresentationEffect[] = [];
let activeTacticalScene: BattleScene | ActionScene | undefined;
let tacticalSceneTimer: number | undefined;
let activeTacticalSceneDurationMs = BATTLE_SCENE_DURATION_MS;
let pendingHandoffActionScene: ActionScene | undefined;
let stopBattleAudio: (() => void) | undefined;

function showTacticalScene(scene: BattleScene | ActionScene): void {
  if (tacticalSceneTimer !== undefined) window.clearTimeout(tacticalSceneTimer);
  stopBattleAudio?.();
  stopBattleAudio = undefined;
  musicPlayer.setBattle('attacker' in scene, true);
  if ('attacker' in scene) stopBattleAudio = playBattleSceneAudio(scene, (cue, kind) => soundPlayer.playBattle(cue, kind));
  activeTacticalScene = scene;
  activeTacticalSceneDurationMs = 'attacker' in scene ? BATTLE_SCENE_DURATION_MS : ACTION_SCENE_DURATION_MS;
  tacticalSceneTimer = window.setTimeout(() => dismissTacticalScene(), activeTacticalSceneDurationMs);
}
function dismissTacticalScene(redraw = true): boolean {
  if (tacticalSceneTimer !== undefined) window.clearTimeout(tacticalSceneTimer);
  tacticalSceneTimer = undefined;
  stopBattleAudio?.();
  stopBattleAudio = undefined;
  musicPlayer.setBattle(false);
  const wasShowing = activeTacticalScene !== undefined;
  activeTacticalScene = undefined;
  if (redraw) render();
  return wasShowing;
}
function battleSceneIsVisible(scene: BattleScene, visible: ReadonlySet<string>): boolean {
  return [scene.attacker.position, scene.defender.position]
    .every(position => visible.has(`${position.x},${position.y}`));
}

// The context is intentionally created only from a real user gesture. CPU and
// replay playback before that gesture remain silent under browser autoplay rules.
const unlockAudio = (): void => { void soundPlayer.unlock(); void musicPlayer.unlock(); };
app.addEventListener('pointerdown', event => {
  boardPointerPending = event.target instanceof Element && event.target.closest('.tile') !== null;
  unlockAudio();
}, { capture: true });
// Compatibility mouse events and the tile click finish before this timer.
document.addEventListener('pointerup', () => { window.setTimeout(() => { boardPointerPending = false; }, 0); });
document.addEventListener('pointercancel', () => { boardPointerPending = false; });
// Touch pointerdown does not grant audio activation on iOS. The trusted click
// after touchend also covers taps and assistive activation before UI handlers.
app.addEventListener('click', event => { if (event.isTrusted) unlockAudio(); }, { capture: true });
app.addEventListener('keydown', () => { boardPointerPending = false; unlockAudio(); }, { capture: true });

const producibleUnits = allProducibleUnitKinds;


function editorVictoryCondition(kind: VictoryCondition['type'], target: number): VictoryCondition {
  if (kind === 'eliminate' || kind === 'captureCapital') return { type: kind };
  if (kind === 'escort' || kind === 'withdraw') {
    const previous = editor.data.victoryConditions[0];
    const entered = app.querySelector<HTMLInputElement>('#editor-victory-units')?.value;
    const unitIds = entered !== undefined ? entered.split(/[\s,・]+/).filter(Boolean)
      : previous && isEvacuationCondition(previous) ? previous.unitIds : editor.data.initialUnits.some(unit => unit.owner === 'red') ? ['r1'] : [];
    return { type: kind, unitIds, required: Math.max(1, target), positions: previous && isEvacuationCondition(previous) ? previous.positions : [{ ...editor.selected }] };
  }
  if (kind === 'control') return { type: 'control', positions: [{ ...editor.selected }], target: Math.max(1, target) };
  if (kind === 'hold') return { type: 'hold', positions: [{ ...editor.selected }], turns: Math.max(1, target) };
  if (kind === 'survive') return { type: 'survive', untilTurn: Math.max(1, target) };
  return { type: 'score', target: Math.max(1, target) };
}

function setEditorVictory(kind: VictoryCondition['type'], target: number): void {
  const condition = editorVictoryCondition(kind, target);
  const keep = (conditions: readonly VictoryCondition[]) => conditions.filter(item => item.type !== 'control');
  commitEditor({ ...editor, data: { ...editor.data,
    victoryConditions: [condition, ...keep(editor.data.victoryConditions.slice(1))],
    defeatConditions: kind === 'control' ? [condition] : keep(editor.data.defeatConditions).length ? keep(editor.data.defeatConditions) : [{ type: 'captureCapital' }],
  } });
}

interface MatchSettings { difficulty: CpuDifficulty; matchMode: MatchMode; finiteSupplies: boolean }
/** The player's own settings, set aside while a daily match forces its fixed conditions. */
let dailyUserSettings: MatchSettings | undefined;
/** Daily-match settings parked while a replay of another match is shown. */
let dailyParked: { user: MatchSettings; daily: MatchSettings } | undefined;
const currentSettings = (): MatchSettings => ({ difficulty, matchMode, finiteSupplies });
function applySettings(settings: MatchSettings): void { ({ difficulty, matchMode, finiteSupplies } = settings); }
function restoreUserSettings(): void {
  dailyParked = undefined;
  if (!dailyUserSettings) return;
  applySettings(dailyUserSettings);
  dailyUserSettings = undefined;
}
/** A daily battlefield forces difficulty, match format and supplies; anything else gives the player's settings back. */
function applyDailyStartPolicy(targetId: string): void {
  if (!campaignRun && isDailyScenarioId(targetId)) {
    dailyParked = undefined;
    dailyUserSettings ??= currentSettings();
    applySettings({ difficulty: 'normal', matchMode: 'cpu', finiteSupplies: true });
  } else restoreUserSettings();
}
/** True while the fixed daily conditions must not be changed (also enforced by the handlers, not only by disabled controls). */
const dailyLocked = (): boolean => !replay && !campaignRun && isDailyScenarioId(selectedMap.id);
/** Retrying a daily match rebuilds the canonical definition; the id-only lookup cannot find an unsaved one. */
function restartDefinition(): ScenarioDefinition | undefined {
  const date = campaignRun ? undefined : dailyDateOfScenarioId(selectedMap.id);
  const canonical = date === undefined ? undefined : dailyScenario(date);
  return canonical?.ok ? canonical.value : undefined;
}

function start(id: string, operation?: ScenarioDefinition): GameState {
  selectedMap = operation ?? scenarioById(id) ?? maps[0]!;
  return createScenarioInitialState(selectedMap);
}

const key = (p: Position) => `${p.x},${p.y}`;
const adjacent = (first: Position, second: Position) => Math.abs(first.x - second.x) + Math.abs(first.y - second.y) === 1;

function unactedOwnUnits(state: GameState, player: PlayerId): DeployedUnit[] {
  return state.units.filter((unit): unit is DeployedUnit => isDeployedUnit(unit) && unit.owner === player && !unit.hasActed);
}

function matchDifficultyName(): string {
  if (matchMode === 'hotseat') return uiText.hotseatDifficulty;
  return matchMode === 'spectate' ? uiText.spectateDifficulty(difficultyNames[redDifficulty], difficultyNames[difficulty]) : difficultyNames[difficulty];
}
function matchContext(): MatchContext {
  return { mode: matchMode, activePlayer: game.activePlayer, winner: game.winner, replay: replay !== undefined, cpuInProgress, handoffPending };
}
/** The side whose view the screen shows: always red in CPU matches and replays, the active side otherwise. */
function viewer(): PlayerId {
  return replay ? replay.viewpoint === 'blue' ? 'blue' : 'red' : viewerFor(matchMode, game.activePlayer);
}
/** Tiles the screen may draw for the current viewer (see `showsWholeBoard`). */
function shownPositions(state: GameState): Position[] {
  return displayedPositions(state, viewer(), replay ? replay.viewpoint === 'all' : showsWholeBoard(matchMode, spectateWholeBoard, false));
}
function canCommand(): boolean {
  return commandAllowed(matchContext());
}

function fuelTurnsRemaining(unit: DeployedUnit): number | undefined {
  const stats = unitStats[unit.kind];
  if (stats.fuelPerTurn === 0) return undefined;
  return Math.ceil((unit.fuel ?? stats.fuel) / stats.fuelPerTurn);
}

function objectiveProgress(condition: VictoryCondition, state: GameState, player: PlayerId): string {
  const progress = getConditionProgress(state, condition, player);
  return progress.complete ? '達成' : `${progress.current} / ${progress.target}`;
}

function objectiveList(conditions: readonly VictoryCondition[], state: GameState, player: PlayerId): string {
  if (conditions.length === 0) return '<li><span>条件なし</span></li>';
  return conditions.map(condition => `<li><span>${escapeHtml(conditionDescription(condition))}${condition.type === 'hold' || condition.type === 'control' || isEvacuationCondition(condition) ? ` (${condition.positions.map(position => `${position.x + 1}, ${position.y + 1}`).join(' / ')})` : ''}</span><strong>${escapeHtml(objectiveProgress(condition, state, player))}</strong></li>`).join('');
}


const inspectorRows = (rows: readonly InspectorRow[]) => `<dl class="tile-inspector-rows">${rows.map(row => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}</dl>`;

/**
 * Touch devices never hover, so the board's tooltips are unreachable there. This
 * panel is the primary way to read a tile, and mirrors itself as one announced
 * sentence for screen readers. It is built separately from the board so moving
 * focus can refresh it without rebuilding the board.
 */
function renderTileInspector(state: GameState, productionRule: ProductionRule): string {
  const me = viewer();
  const visible = new Set(shownPositions(state).map(key));
  const selectedUnit = state.units.find(unit => unit.id === selected);
  const inspection = inspectTile(state, focusedPosition, me, visible,
    selectedUnit?.owner === me && isDeployedUnit(selectedUnit) ? selectedUnit.kind : undefined, productionRule);
  const body = inspection
    ? `<div class="tile-inspector-head"><div><p class="card-kicker">TILE INTEL</p><h3 id="tile-inspector-title">${escapeHtml(inspection.title)}</h3></div><span class="tile-inspector-coordinate">(${inspection.position.x + 1}, ${inspection.position.y + 1})</span></div><p class="tile-inspector-summary visually-hidden" aria-live="polite">${escapeHtml(describeTileInspection(inspection))}</p>${inspectorRows(inspection.rows)}${inspection.unit ? `<div class="tile-inspector-unit"><h4>${escapeHtml(inspection.unit.title)}</h4>${inspectorRows(inspection.unit.rows)}</div>` : ''}${inspection.hidden ? '<p class="tile-inspector-fog">未索敵のマスです。ユニットを近づけて視界を広げてください。</p>' : ''}`
    : '<div class="tile-inspector-head"><div><p class="card-kicker">TILE INTEL</p><h3 id="tile-inspector-title">マスを選択してください</h3></div></div>';
  return `<section data-ui-copy class="tile-inspector" aria-labelledby="tile-inspector-title">${body}</section>`;
}

/**
 * Focus moved by a pointer must not rebuild the board: replacing the DOM between
 * mousedown and mouseup detaches the tile, and the browser then never dispatches
 * its click — every tap would need a second one. Only the views that depend on
 * which tile has focus are patched in place. Keyboard navigation still goes
 * through `focusBoardPosition`, which renders normally.
 */
function refreshFocusedTileViews(): void {
  for (const tile of app.querySelectorAll<HTMLButtonElement>('.tile[data-x]')) {
    tile.tabIndex = Number(tile.dataset.x) === focusedPosition.x && Number(tile.dataset.y) === focusedPosition.y ? 0 : -1;
  }
  const inspector = app.querySelector('.tile-inspector');
  const renderedMap = replay ? scenarioForState(replay.state) ?? selectedMap : selectedMap;
  if (inspector) inspector.outerHTML = renderTileInspector(replay?.state ?? game, renderedMap.productionRules);
  const brief = app.querySelector('#unit-brief');
  const state = replay?.state ?? game;
  // Expanding a focused unit's weapon list during pointerdown moves the board
  // before pointerup, so the browser can discard the intended tile click.
  if (brief && !boardPointerPending) brief.outerHTML = renderUnitBrief(state, viewer(), new Set(shownPositions(state).map(key)), selected, focusedPosition, selectedWeaponSlot(), canCommand());
}

/** Re-applies the width-derived default zoom unless the player has set it themselves. */
function syncBoardZoom(boardWidth: number): void {
  if (boardZoomAuto) boardZoomIndex = defaultBoardZoomIndex(boardAreaWidth(window.innerWidth), boardWidth);
}

function plannedDeployment(): GameResult<ScenarioDefinition> {
  if (!deploymentBase || deploymentBase.id === 'training') return { ok: true, value: selectedMap };
  const veterans = campaignRun ? campaignDeployment(campaignProgress, campaignRun.scenarioId).veterans : undefined;
  const red = createDeploymentScenario(deploymentBase, deploymentChoices.red, 'red', veterans);
  if (!red.ok || matchMode === 'cpu') return red;
  return createDeploymentScenario(red.value, deploymentChoices.blue, 'blue');
}

function confirmReplaceMatch(): boolean {
  return game.winner !== undefined || commandHistory.length === 0 || window.confirm(translateText('進行中の対局を置き換えますか？未保存の操作は失われます。'));
}
function deleteCustomMapWithConfirmation(id: string): GameResult<void> | undefined {
  if (!id) return;
  const map = scenarioById(id);
  if (!map || [...maps, ...operationScenarios].some(candidate => candidate.id === id)) return deleteCustomScenario(localStorage, id);
  if (!window.confirm(uiText.customMapDeleteConfirm(scenarioDisplayName(map)))) return;
  return deleteCustomScenario(localStorage, id);
}

function resetGame(mapId: string, operation?: ScenarioDefinition): void {
  applyDailyStartPolicy(operation?.id ?? mapId);
  weaponSelection = undefined;
  productionMenuOpen = false;
  productionNotice = '';
  productionReturnSelector = undefined;
  dismissTacticalScene(false);
  commandScheduler.cancel();
  cpuInProgress = false;
  cpuSkipRequested = false;
  skipCpuImmediately = undefined;
  pendingPresentationEffects = [];
  pendingHandoffActionScene = undefined;
  game = start(mapId, operation);
  if (!campaignRun && !finiteSupplies) game = { ...game, ruleVersion: BRIDGE_RULE_VERSION };
  deploymentBase = selectedMap;
  deploymentChoices = { red: deploymentSlots(selectedMap, 'red').map(slot => slot.kind), blue: deploymentSlots(selectedMap, 'blue').map(slot => slot.kind) };
  deploymentOpen = false;
  deploymentNotice = '';
  presetDraftNames = {};
  if (presetCatalog) presetNotice = '';
  resetSpectatorCamera();
  initialState = structuredClone(game);
  commandHistory = [];
  undoStack = [];
  selected = undefined;
  selectedFacility = undefined;
  focusedPosition = { x: 0, y: 0 };
  screens.briefingOpen = true;
  handoffPending = false;
  spectatePaused = false;
  spectatePauseAtTurn = SPECTATE_TURN_LIMIT;
  cpuActivity = [];
  turnStartNotice = '';
  syncBoardZoom(game.board.width);
}
function finishCampaignBattle(): void {
  if (!campaignRun || game.winner !== 'red' || campaignOutcome) return;
  const stage = campaignStages.find(candidate => candidate.scenarioId === campaignRun!.scenarioId);
  const summary = resultCache.summarize(game, initialState, commandHistory, selectedMap.id, difficulty);
  if (!stage) { campaignNotice = 'キャンペーン作戦が見つかりません。'; return; }
  if (!summary.ok) { campaignNotice = summary.error; return; }
  const graded = gradeCampaignBattle({
    initialState, finalState: game, losses: summary.value.kills.blue,
    recommendedTurns: stage.recommendedTurns,
  });
  if (!graded.ok) { campaignNotice = graded.error; return; }
  const recorded = recordCampaignVictory(campaignProgress, stage.scenarioId, graded.value.grade);
  if (!recorded.ok) { campaignNotice = recorded.error; return; }
  const veterans = recordCampaignVeterans(recorded.value, game);
  if (!veterans.ok) { campaignNotice = veterans.error; return; }
  const choices = campaignSuccessors[stage.scenarioId] ?? [];
  const nextScenarioId = choices.length === 1 ? choices[0] : undefined;
  const saved = saveCampaignProgress(localStorage, veterans.value);
  if (saved.ok) campaignProgress = veterans.value;
  campaignOutcome = { result: graded.value, persisted: saved.ok, nextScenarioId: saved.ok ? nextScenarioId : undefined,
    veteranCount: veterans.value.veteransByScenario?.[stage.scenarioId]?.length ?? 0 };
  campaignNotice = saved.ok ? `${graded.value.grade}評価を記録しました。` : saved.error;
}
function dispatch(command: GameCommand, undoable = false): boolean {
  if (replay) return false;
  const before = game;
  const result = applyGameCommand(game, command);
  if (!result.ok) { message = commandErrorMessage(result.error); return false; }
  if (undoable && undoAllowed(matchMode) && game.activePlayer === viewer()) undoStack.push({ state: game, commandCount: commandHistory.length });
  game = result.value;
  if (matchMode === 'spectate') {
    spectateLastAction = spectatorActionPosition(before, game, command);
    if (spectateFollow && spectateLastAction && !cpuSkipRequested) centerSpectatorOn(spectateLastAction);
  }
  commandHistory.push(command);
  // Only the upkeep of the side about to play is reported, and only to that side:
  // the CPU's repairs would reveal hidden units and funds. In hotseat the notice
  // is shown after the handoff, once the new player has the device.
  if (command.type === 'endTurn' && (matchMode === 'hotseat' || (matchMode === 'cpu' && game.activePlayer === 'red'))) {
    const repairs = summarizeRepairs(before, game, game.activePlayer);
    turnStartNotice = repairs.units === 0 ? '' : repairs.cost > 0
      ? `${repairs.units}部隊を修理しました（修理費 ${repairs.cost}G）。`
      : `${repairs.units}部隊を修理しました。`;
  }
  if (!cpuSkipRequested) {
    const effects = presentationEffectsForCommand(before, command, game);
    // The opponent's actions are animated only where the viewer can see them;
    // effects in fog would reveal hidden moves, captures, and production (#125).
    const me = viewer();
    const seen = new Set([...shownPositions(before), ...shownPositions(game)].map(key));
    pendingPresentationEffects.push(...effectsForViewer(effects, before.activePlayer, me, seen));
    const scene = battleSceneForCommand(before, command, game);
    if (scene) {
      const visibleUnits = new Set([...shownPositions(before), ...shownPositions(game)].map(position => `${position.x},${position.y}`));
      if (before.activePlayer === me || battleSceneIsVisible(scene, visibleUnits)) showTacticalScene(scene);
    }
    const actionScene = actionSceneForCommand(before, command, game);
    if (actionScene?.kind === 'capture') {
      const visiblePositionsForScene = new Set([...shownPositions(before), ...shownPositions(game)].map(key));
      const visibleScene = actionSceneForVisiblePositions(actionScene, visiblePositionsForScene);
      if (before.activePlayer === me) showTacticalScene(actionScene);
      else if (visibleScene) showTacticalScene(visibleScene);
    } else if (actionScene?.kind === 'logistics' && game.activePlayer === me) {
      if (matchMode === 'hotseat') pendingHandoffActionScene = actionScene;
      else showTacticalScene(actionScene);
    }
  }
  finishCampaignBattle();
  return true;
}

/** Keep CPU activity useful without naming units or places the player could not see. */
function recordVisibleCpuAction(before: GameState, command: GameCommand): void {
  const visible = new Set([...visiblePositions(before, 'red'), ...visiblePositions(game, 'red')].map(key));
  const visibleUnit = (id: string) => {
    const prior = before.units.find(unit => unit.id === id);
    const current = game.units.find(unit => unit.id === id);
    return [prior, current].find(unit => unit && isDeployedUnit(unit) && visible.has(key(unit.position)));
  };
  let entry: string | undefined;
  if (command.type === 'attack') {
    const target = before.units.find(unit => unit.id === command.targetId);
    const attacker = visibleUnit(command.unitId);
    entry = attacker && isDeployedUnit(attacker) && target?.owner === 'red'
      ? `敵の${japaneseUnitNames[attacker.kind]}が自軍の${japaneseUnitNames[target.kind]}を攻撃しました。`
      : target?.owner === 'red' ? `自軍の${japaneseUnitNames[target.kind]}が攻撃を受けました。` : undefined;
  } else if (command.type === 'move') {
    const unit = visibleUnit(command.unitId);
    entry = unit && isDeployedUnit(unit) ? `敵の${japaneseUnitNames[unit.kind]}が視認範囲内で移動しました。` : undefined;
  } else if (command.type === 'destroyBridge') {
    entry = getLocale() === 'en' ? 'A temporary bridge was destroyed (public information).' : '仮設橋が破壊されました（公開情報）。';
  } else if (command.type === 'bridge') {
    entry = `(${command.destination.x + 1}, ${command.destination.y + 1}) に仮設橋が完成しました（公開情報）。`;
  } else if (command.type === 'fortify') {
    const actor = visibleUnit(command.unitId);
    entry = actor ? '敵の工兵が視認範囲内に陣地を設営しました。' : undefined;
  } else if (command.type === 'evacuate') {
    const unit = visibleUnit(command.unitId);
    if (unit) entry = `${japaneseUnitNames[unit.kind]}が脱出地点から撤退`;
  } else if (command.type === 'capture') {
    const unit = visibleUnit(command.unitId);
    entry = unit && isDeployedUnit(unit) ? `敵の${japaneseUnitNames[unit.kind]}が視認範囲内の拠点を占領中です。` : undefined;
  }
  if (entry) cpuActivity = [...cpuActivity, entry].slice(-6);
}
/** What a save records about the match; `redDifficulty` exists only for spectating. */
function savedMatch(): Omit<SavedGame, 'schemaVersion' | 'savedAt'> {
  return {
    mapId: selectedMap.id, difficulty, initialState, commands: commandHistory, gameState: game,
    campaignScenarioId: campaignRun?.scenarioId, mode: matchMode,
    ...((game.ruleVersion ?? 0) >= 12 ? { cpuPolicies: structuredClone(dailyLocked() ? defaultArmyPolicies() : cpuPolicies) } : {}),
    ...(matchMode === 'spectate' ? { redDifficulty } : {}),
  };
}
function persist(key: string): boolean {
  if (key === AUTO_SAVE_KEY && !autosaveAllowed(matchMode)) return false;
  if (key === MANUAL_SAVE_KEY && manualSaveTarget(matchMode) !== 'manual') return false;
  const result = saveGame(localStorage, key, savedMatch());
  message = result.ok ? 'セーブしました。' : result.error;
  return result.ok;
}
function saveNamedSlot(): void {
  const name = window.prompt(translateText('セーブ名を入力してください（40文字まで）'), scenarioDisplayName(selectedMap))?.trim();
  if (!name) { message = 'セーブをキャンセルしました。'; return; }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const result = saveGameToSlot(localStorage, id, name, savedMatch());
  message = result.ok ? `「${name}」にセーブしました。` : result.error;
}
function hasSave(): boolean {
  return hasSavedGame(localStorage);
}
function hasStoredSave(): boolean {
  return hasStoredSaveData(localStorage);
}
/** Returns whether a save was loaded; otherwise `message` says why. */
function continueSavedGame(slotId?: string): boolean {
  const selectedSlot = slotId ?? listSaveSlots(localStorage).find(slot => slot.status === 'valid')?.id;
  const loaded = selectedSlot ? loadGameFromSlot(localStorage, selectedSlot) : loadGame(localStorage);
  if (!loaded) { message = 'セーブデータがありません。'; return false; }
  if (!loaded.ok) { message = loaded.error; return false; }
  if (!withinInteractiveMatchBudget(loaded.value.initialState, loaded.value.gameState, loaded.value.commands.length)) {
    message = 'このセーブは現在の対話プレイ上限を超えています。元データは保持されています。バックアップから書き出して保管できます。';
    return false;
  }
  const map = scenarioForState(loaded.value.initialState);
  if (!map) { message = 'セーブデータのマップは利用できません。'; return false; }
  if (!confirmReplaceMatch()) return false;
  commandScheduler.cancel();
  cpuInProgress = false;
  cpuSkipRequested = false;
  campaignRun = undefined;
  campaignOutcome = undefined;
  restoreUserSettings();
  const settingsBeforeLoad = currentSettings();
  selectedMap = map;
  deploymentBase = undefined;
  difficulty = loaded.value.difficulty;
  cpuPolicies = structuredClone(loaded.value.cpuPolicies ?? defaultArmyPolicies());
  matchMode = loaded.value.mode ?? 'cpu';
  // Only a spectated save sets red's CPU; other formats keep the viewer's last choice.
  if (matchMode === 'spectate') redDifficulty = loaded.value.redDifficulty ?? difficulty;
  cpuActivity = [];
  turnStartNotice = '';
  initialState = { ...structuredClone(loaded.value.initialState), scenarioId: map.id };
  commandHistory = [...loaded.value.commands];
  game = { ...structuredClone(loaded.value.gameState), scenarioId: map.id };
  resetSpectatorCamera();
  if (loaded.value.campaignScenarioId && isCampaignScenarioUnlocked(campaignProgress, loaded.value.campaignScenarioId)) {
    campaignRun = { scenarioId: loaded.value.campaignScenarioId };
  }
  // A resumed daily match keeps its saved settings; the player's own are kept aside and given back on leaving it.
  if (!campaignRun && isDailyScenarioId(map.id)) dailyUserSettings = settingsBeforeLoad;
  finishCampaignBattle();
  undoStack = [];
  selected = undefined;
  selectedFacility = undefined;
  focusedPosition = { x: 0, y: 0 };
  screens.briefingOpen = false;
  // A resumed two-player match always starts behind the handoff screen.
  handoffPending = matchMode === 'hotseat' && !game.winner;
  syncBoardZoom(game.board.width);
  // A spectated match resumes paused, so the viewer chooses when the CPUs continue.
  spectatePaused = matchMode === 'spectate' && !game.winner;
  spectatePauseAtTurn = SPECTATE_TURN_LIMIT;
  message = spectatePaused ? uiText.spectateLoaded : 'セーブデータから再開しました。';
  return true;
}


function openCampaignMenu(): void {
  campaignReturnToBriefing = screens.briefingOpen;
  screens.briefingOpen = false;
  screens.campaignMenuOpen = true;
  render();
}
function startCampaignScenario(scenarioId: string): void {
  const operation = createCampaignScenario(campaignProgress, scenarioId);
  if (!operation.ok) {
    campaignNotice = operation.error;
    render();
    return;
  }
  if (!confirmReplaceMatch()) return;
  campaignRun = { scenarioId };
  campaignOutcome = undefined;
  screens.campaignMenuOpen = false;
  titleState.clearReturn();
  // Give the player's own settings back before overriding them; resetGame would otherwise restore over this.
  restoreUserSettings();
  matchMode = 'cpu';
  resetGame(scenarioId, operation.value);
  message = '作戦ブリーフィングを確認してください。';
  render();
}


function completedReplay(): ReturnType<typeof createReplay> {
  return createReplay({
    mapId: selectedMap.id, difficulty, initialState, commands: commandHistory,
    ...(matchMode === 'spectate' ? { redDifficulty } : {}),
  });
}
function beginReplay(file: ReplayFile): void {
  if (!withinInteractiveMatchBudget(file.initialState, file.finalState, file.commands.length)) {
    message = 'このリプレイは現在の対話プレイ上限を超えています。現在の対局は保持されています。';
    render();
    return;
  }
  if (screens.titleOpen) titleState.leaveTitleAndReturn();
  dismissTacticalScene(false);
  commandScheduler.cancel();
  cpuInProgress = false;
  cpuSkipRequested = false;
  skipCpuImmediately = undefined;
  pendingPresentationEffects = [];
  // Watching another match is not a daily match: hand the player's settings back, and take the daily ones again on leaving.
  if (dailyUserSettings && !isDailyScenarioId(file.mapId)) { dailyParked = { user: dailyUserSettings, daily: currentSettings() }; applySettings(dailyUserSettings); dailyUserSettings = undefined; }
  resetSpectatorCamera();
  replay = { file: structuredClone(file), state: { ...structuredClone(file.initialState), scenarioId: file.mapId }, index: 0, playing: false, speed: 1, timeline: new ReplayTimeline(file), viewpoint: 'red' };
  selected = undefined; selectedFacility = undefined; screens.briefingOpen = false; syncBoardZoom(replay.state.board.width); message = 'リプレイを読み込みました。再生ボタンで開始できます。'; render();
}
function advanceReplay(): boolean {
  if (!replay || replay.index >= replay.file.commands.length) {
    if (replay) replay.playing = false;
    commandScheduler.cancel(); render(); return false;
  }
  const before = replay.state;
  const command = replay.file.commands[replay.index]!;
  const result = applyGameCommand(before, command);
  if (!result.ok) {
    replay.playing = false; commandScheduler.cancel();
    message = `リプレイを再生できません: ${commandErrorMessage(result.error)}`; render(); return false;
  }
  replay.state = result.value;
  const battleScene = battleSceneForCommand(before, command, replay.state);
  if (battleScene) {
    const visibleUnits = new Set([...visiblePositions(before, viewer()), ...visiblePositions(replay.state, viewer())].map(position => `${position.x},${position.y}`));
    if (replay.viewpoint === 'all' || battleSceneIsVisible(battleScene, visibleUnits)) showTacticalScene(battleScene);
  }
  const actionScene = actionSceneForCommand(before, command, replay.state);
  if (actionScene) {
    if (replay.viewpoint === 'all') showTacticalScene(actionScene);
    else {
      const visiblePositionsForScene = new Set([...visiblePositions(before, viewer()), ...visiblePositions(replay.state, viewer())].map(key));
      const visibleScene = actionSceneForVisiblePositions(actionScene, visiblePositionsForScene);
      if (visibleScene) showTacticalScene(visibleScene);
    }
  }
  const effects = presentationEffectsForCommand(before, command, replay.state);
  pendingPresentationEffects.push(...(replay.viewpoint === 'all' ? effects : effectsForViewer(effects, before.activePlayer, viewer(), new Set([...visiblePositions(before, viewer()), ...visiblePositions(replay.state, viewer())].map(key)))));
  replay.index += 1;
  if (replay.index >= replay.file.commands.length) {
    replay.playing = false; commandScheduler.cancel(); message = 'リプレイの再生が完了しました。';
  }
  render();
  return replay.playing;
}
function scheduleReplay(): void {
  if (!replay?.playing || replay.index >= replay.file.commands.length) return;
  commandScheduler.start({ step: advanceReplay, nextDelayMs: () => activeTacticalScene ? activeTacticalSceneDurationMs + 50 : 1000 / replay!.speed });
}
function leaveReplay(): void {
  commandScheduler.cancel(); dismissTacticalScene(false); pendingPresentationEffects = []; pendingHandoffActionScene = undefined; replay = undefined; selected = undefined;
  if (dailyParked) { dailyUserSettings = dailyParked.user; applySettings(dailyParked.daily); dailyParked = undefined; }
  message = game.winner ? '対局結果に戻りました。' : '通常の対局に戻りました。';
  titleState.backToTitleIfOpenedThere();
  render();
}
function downloadReplay(): void {
  const created = completedReplay();
  if (!created.ok) { message = created.error; render(); return; }
  const serialized = serializeReplay(created.value);
  if (!serialized.ok) { message = serialized.error; render(); return; }
  const url = URL.createObjectURL(new Blob([serialized.value], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `ministr-${selectedMap.id}-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  message = 'リプレイを書き出しました。'; render();
}
/** Shared by the header's and the title's file inputs. */
function chooseReplayFile(event: Event): void {
  if (replay) return;
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  // A rejected file leaves the title open; say why there.
  if (file) void importReplay(file).then(applied => {
    if (!applied) return;
    if (!screens.titleOpen) return;
    titleState.setNotice(message);
    focusSelector = '#title-import-replay';
    render();
  });
}
async function importReplay(file: File): Promise<boolean> {
  const request = fileReadGate.begin();
  const expectedGame = game; const expectedRevision = screens.revision;
  const isCurrent = () => fileReadGate.isCurrent(request) && screens.revision === expectedRevision && game === expectedGame;
  if (file.size > MAX_REPLAY_BYTES) { message = 'リプレイデータが大きすぎます。'; render(); return true; }
  let text: string;
  try { text = await file.text(); } catch { if (!isCurrent()) return false; message = 'リプレイファイルを読み込めませんでした。'; render(); return true; }
  if (!isCurrent()) return false;
  const parsed = parseReplay(text);
  if (!parsed.ok) { message = parsed.error; render(); return true; }
  beginReplay(parsed.value);
  return true;
}

let renderGeneration = 0;
function syncOperationOutcome(): void {
  if (screens.titleOpen || screens.briefingOpen || screens.campaignMenuOpen || screens.editorOpen) return;
  if (replay || campaignRun || matchMode !== 'cpu' || !operationIds.has(selectedMap.id) || game.winner !== 'red') { operationOutcome = undefined; operationResultGame = undefined; return; }
  if (operationResultGame === game) return;
  operationResultGame = game;
  const outcome = operationVictory(initialState, game, commandHistory, difficulty);
  if (!outcome.ok) { operationOutcome = undefined; operationNotice = outcome.error; return; }
  operationOutcome = outcome.value;
  const saved = saveOperationVictory(localStorage, outcome.value);
  if (saved.ok) { operationCatalog = saved.value.catalog; operationNotice = saved.value.changed ? '最良記録と達成済み課題を更新しました。' : 'この条件のクリア記録は保存済みです。'; }
  else operationNotice = saved.error;
}
function syncDailyOutcome(): void {
  if (screens.titleOpen || screens.briefingOpen || screens.campaignMenuOpen || screens.editorOpen) return;
  const date = !replay && !campaignRun && game.winner ? dailyDateOfScenarioId(selectedMap.id) : undefined;
  const conditions = date === undefined ? undefined : dailyConditions(date);
  if (!conditions?.ok) { dailyOutcome = undefined; dailyResultGame = undefined; dailyCopyNotice = ''; return; }
  if (dailyResultGame === game) return;
  dailyResultGame = game;
  dailyCopyNotice = '';
  const code = conditions.value.code;
  const result = dailyVictory(initialState, game, commandHistory, { difficulty, matchMode }, dailyClock());
  if (!result.ok) { dailyOutcome = { code, notice: result.error }; return; }
  const figures = { bestTurns: result.value.record.bestTurns, bestLosses: result.value.record.bestLosses };
  const saved = saveDailyVictory(localStorage, result.value.record);
  if (saved.ok) {
    dailyCatalog = saved.value.catalog;
    dailyOutcome = { code, record: figures, notice: !saved.value.retained ? '保持対象の最新60日より古い日付のため、記録は保存されませんでした。' : saved.value.changed ? '日替わりチャレンジの最良記録を更新しました。' : '日替わりチャレンジの記録は保存済みです。' };
  } else dailyOutcome = { code, record: figures, notice: saved.error };
}
function dailyBriefingConditions() {
  const conditions = dailyConditions(dailyDateOfScenarioId(selectedMap.id) ?? dailyDateKey(dailyClock()));
  if (!conditions.ok) throw Error(conditions.error);
  return conditions.value;
}
function startDaily(): void {
  if (!screens.titleOpen || !confirmReplaceMatch()) return;
  // The date is fixed here, at the moment of starting, and carried by the scenario id from then on.
  const scenario = dailyScenario(dailyDateKey(dailyClock()));
  if (!scenario.ok) { dailyNotice = scenario.error; render(); return; }
  dailyNotice = '';
  titleState.leaveTitle(); campaignRun = undefined; campaignOutcome = undefined;
  resetGame(scenario.value.id, scenario.value);
  message = '作戦ブリーフィングを確認してください。';
  render();
}
async function copyDailyCode(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    dailyCopyNotice = '識別子をコピーしました。';
  } catch {
    dailyCopyNotice = 'コピーできませんでした。識別子を選択してコピーしてください。';
  }
  // Updated in place so the copy button keeps focus; a later redraw renders the same text.
  const status = app.querySelector('#daily-copy-status');
  if (status) status.textContent = translateText(dailyCopyNotice);
}
/** Record management on the title; the buttons are bound in `ui/titleEvents.ts`. */
const operationRecordActions: TitleEventDeps['operationRecords'] = {
  reset() {
    if (!window.confirm(translateText('作戦戦績のみを初期化しますか？ 対局・キャンペーン・プリセットは保持します。'))) return;
    const result = resetOperationRecords(localStorage);
    if (result.ok) { operationCatalog = result.value; operationResultGame = undefined; operationNotice = '作戦戦績を初期化しました。'; }
    else operationNotice = result.error;
    focusSelector = '#operation-records-heading'; render();
  },
  delete(id) {
    if (!window.confirm(translateText('この条件の戦績を削除しますか？'))) return;
    const result = deleteOperationRecord(localStorage, id);
    if (result.ok) { operationCatalog = result.value; operationNotice = 'この条件の戦績を削除しました。'; }
    else operationNotice = result.error;
    focusSelector = '#operation-records-heading'; render();
  },
};
const dailyRecordActions: TitleEventDeps['dailyRecords'] = {
  reset() {
    if (!window.confirm(translateText('日替わりチャレンジの記録のみを初期化しますか？ 対局・キャンペーン・作戦戦績は保持します。'))) return;
    const result = resetDailyRecords(localStorage);
    if (result.ok) { dailyCatalog = result.value; dailyNotice = '日替わりチャレンジの記録を初期化しました。'; }
    else dailyNotice = result.error;
    titleState.dailyRecordsOpen = true; focusSelector = '#title-daily-records-heading'; render();
  },
  delete(date) {
    if (!window.confirm(translateText('この日の記録を削除しますか？'))) return;
    const result = deleteDailyRecord(localStorage, date);
    if (result.ok) { dailyCatalog = result.value; dailyNotice = 'この日の記録を削除しました。'; }
    else dailyNotice = result.error;
    titleState.dailyRecordsOpen = true; focusSelector = '#title-daily-records-heading'; render();
  },
};
const titleEventDeps: TitleEventDeps = {
  screens,
  state: titleState,
  render: () => render(),
  setFocus: selector => { focusSelector = selector; },
  confirmReplaceMatch: () => confirmReplaceMatch(),
  scenarios: () => availableScenarios(),
  scenarioExists: id => scenarioById(id) !== undefined,
  deleteCustomMap: id => deleteCustomMapWithConfirmation(id),
  saveGeneratedMap: generated => saveCustomScenario(localStorage, scenarioDefinitionToData(generated)),
  startGeneratedMap: saved => {
    campaignRun = undefined; campaignOutcome = undefined;
    resetGame(saved.id, saved);
  },
  startMap: mapId => {
    campaignRun = undefined; campaignOutcome = undefined;
    resetGame(mapId);
    message = '作戦ブリーフィングを確認してください。';
  },
  startDaily: () => startDaily(),
  continueSave: () => continueSavedGame(),
  message: () => message,
  openCampaign: () => openCampaignMenu(),
  openEditor: () => { screens.editorOpen = true; editorNotice = '編集したシナリオはJSONとして書き出せます。'; render(); },
  isCampaignRun: () => campaignRun !== undefined,
  chooseReplayFile: event => chooseReplayFile(event),
  previewMusic: army => { musicPlayer.setArmy(army); void musicPlayer.unlock(); },
  operationRecords: operationRecordActions,
  dailyRecords: dailyRecordActions,
  pageBase: () => ({ origin: window.location.origin, pathname: window.location.pathname }),
  clipboard: () => navigator.clipboard,
  clearShareHash: () => clearShareHash(),
};
/** Drops the share link from the address bar; `replaceState` fires no `hashchange`. */
function clearShareHash(): void {
  try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* the address bar is cosmetic */ }
}
function render(): void {
  if (screens.briefingOpen && !finiteSupplies && (game.units.some(unit => unit.callsign !== undefined) || game.units.some(unit => unit.kind === 'transportHelicopter') || [...deploymentChoices.red, ...deploymentChoices.blue].includes('transportHelicopter'))) {
    finiteSupplies = true; game = { ...game, ruleVersion: CURRENT_RULE_VERSION }; initialState = structuredClone(game);
  }

  syncOperationOutcome();
  syncDailyOutcome();
  if (!canCommand()) reconTargeting = false;
  if (!selected || selected !== fortifyPending || !canCommand()) fortifyPending = undefined;
  if (bridgePending && (!canCommand() || selected !== bridgePending.unitId || bridgeError(game, bridgePending.unitId))) bridgePending = undefined;
  // A save can legitimately resume during blue's turn. Start only after its
  // loading screen has closed; the in-progress guard prevents duplicate timers.
  if (screens.current === 'battle' && matchMode === 'cpu' && !localStorage.conflicted && !cpuInProgress
    && !activeTacticalScene && cpuShouldRun(matchContext())) runCpu(CPU_STEP_DELAY_MS / cpuSpeed);
  const generation = ++renderGeneration;
  const restoreScroll = captureRenderScroll(app, window);
  const allowBoardFocusScroll = !preventBoardFocusScroll && !(matchMode === 'spectate' && spectateFollow && !replay);
  preventBoardFocusScroll = false;
  const activeElement = document.activeElement;
  if (!focusSelector && activeElement instanceof HTMLElement && app.contains(activeElement)) {
    if (activeElement.id) focusSelector = `#${activeElement.id}`;
    else if (activeElement.matches('.produce[data-kind]')) focusSelector = `${productionMenuOpen ? '#production-menu ' : ''}.produce[data-kind="${activeElement.dataset.kind}"]`;
    else if (activeElement.matches('.title-map-card[data-map-id]')) focusSelector = `.title-map-card[data-map-id="${activeElement.dataset.mapId}"]`;
    else if (activeElement.matches('.tile[data-x][data-y]')) focusSelector = `.tile[data-x="${activeElement.dataset.x}"][data-y="${activeElement.dataset.y}"]`;
  }
  const bridgeTargets = bridgePending ? new Set(bridgeDestinations(game, bridgePending.unitId).map(key)) : new Set<string>();
  const replayMode = replay !== undefined;
  const renderedGame = replay?.state ?? game;
  musicPlayer.setArmy(screens.titleOpen && !replay ? titleState.musicPreviewArmy : renderedGame.activePlayer);
  const renderedMap = replay ? scenarioForState(replay.state) ?? selectedMap : selectedMap;
  const productionRule = renderedMap.productionRules;
  const renderedDifficulty = replay?.file.difficulty ?? difficulty;
  const tileSize = boardTileSize(boardZoomIndex);
  const boardViewportHeight = renderedGame.board.height * tileSize + 10;
  const me = viewer();
  const foe = otherPlayer(me);
  const canAct = canCommand();
  const concealed = !replayMode && handoffPending;
  const visible = new Set(shownPositions(renderedGame).map(key));
  // No tile is fogged in the whole-board view, so the legend drops its fog entry.
  const wholeBoardShown = replay ? replay.viewpoint === 'all' : showsWholeBoard(matchMode, spectateWholeBoard, false);
  const history = historyFor(replay?.file.initialState ?? initialState, replay?.file.commands ?? commandHistory);
  const historyIndex = replay?.index ?? commandHistory.length;
  const recordedContacts = !wholeBoardShown && !concealed ? history.recon(historyIndex, me) : undefined;
  const contacts = recordedContacts?.ok ? recordedContacts.value : [];
  const contactsByPosition = new Map(showReconMarkers ? contacts.map(contact => [key(contact.position), contact]) : []);
  const reconPanel = !wholeBoardShown ? renderReconPanel(contacts, showReconMarkers, reconOpen) : '';
  const analysis = wholeBoardShown ? history.analysis(historyIndex, 'all') : undefined;
  const analysisPanel = renderBattleAnalysis(analysis?.ok ? analysis.value : undefined, analysisMetric, analysisOpen);
  const selectedUnit = renderedGame.units.find(unit => unit.id === selected);
  const movable = !replayMode && selectedUnit?.owner === me && !selectedUnit.hasMoved && !selectedUnit.hasActed
    ? new Set(reachablePositionsForPlayer(renderedGame, selectedUnit.id, me).map(key)) : new Set<string>();
  const focusedUnit = renderedGame.units.find(unit => isDeployedUnit(unit) && key(unit.position) === key(focusedPosition));
  const previewedEnemy = selectedUnit?.owner === foe && isDeployedUnit(selectedUnit)
    ? selectedUnit
    : focusedUnit?.owner === foe && isDeployedUnit(focusedUnit) && visible.has(key(focusedUnit.position)) ? focusedUnit : undefined;
  const previewedEnemyThreat = previewedEnemy ? enemyThreatPreview(renderedGame, previewedEnemy.id, me) : { movement: new Set<string>(), attack: new Set<string>() };
  const knownEnemyThreats = selectedUnit?.owner === me ? visibleEnemyThreats(renderedGame, me) : new Set<string>();
  // Resolved before the board is drawn so idle facilities can be marked on the
  // tiles that produce, not only counted in the panel.
  const idleFacilities = idleProductionFacilities(renderedGame, me, productionRule);
  const targetFacility = (selectedFacility && idleFacilities.find(facility => key(facility.position) === key(selectedFacility!))) || (productionMenuOpen ? idleFacilities[0] : undefined);
  const viewerAtUnitLimit = usesDecisionRules(renderedGame) && renderedGame.units.filter(unit => unit.owner === me).length >= unitLimit(renderedGame.board, renderedGame.ruleVersion);
  const idleFacilityKeys = new Set(viewerAtUnitLimit ? [] : idleFacilities.map(facility => key(facility.position)));
  const ownEvacuation = evacuationObjectives(renderedGame, me);
  const exitPositions = new Set(ownEvacuation.flatMap(condition => condition.positions.map(key)));
  const missionTargets = new Set(ownEvacuation.flatMap(condition => condition.unitIds));
  const objectivePositions = new Set(renderedMap.victoryConditions.flatMap(condition => condition.type === 'hold' || condition.type === 'control' || isEvacuationCondition(condition) ? condition.positions.map(key) : []));
  const supplyTiles = showSupplyRange ? supplyRange(renderedGame, me, selected) : new Set<string>();
  const board = renderedGame.board.terrain.flatMap((row, y) => row.map((terrain, x) => {
    const unit = renderedGame.units.find(item => isDeployedUnit(item) && item.position.x === x && item.position.y === y);
    const hidden = !visible.has(`${x},${y}`);
    const contact = hidden ? contactsByPosition.get(`${x},${y}`) : undefined;
    const terrainName = terrainNames[terrain.kind] ?? terrain.kind;
    const isProperty = isPropertyTerrainKind(terrain.kind);
    const propertyOwner = isProperty ? terrain.owner : undefined;
    const capturePoints = observedCapturePoints(terrain, !hidden);
    const facilityDetail = translateText(terrain.kind === 'supplyDepot' ? '、周囲の地上部隊を補給（修理・収入・生産なし）' : terrain.kind === 'port' ? '、補給・艦艇を生産可能' : terrain.kind === 'airport' ? '、補給・航空ユニットを生産可能' : terrain.kind === 'factory' ? '、補給・地上ユニット生産拠点' : '');
    const propertyLabel = translateGameText(isProperty ? `${terrainName}${propertyOwner ? `（${propertyOwner === me ? '自軍' : '敵軍'}）` : '（中立）'}${capturePoints !== undefined ? `、占領値 ${capturePointsLabel(capturePoints)}` : ''}${facilityDetail}` : terrainName);
    const cargo = unit && transportCapacity(unit.kind) > 0 ? renderedGame.units.find(candidate => candidate.embarkedIn === unit.id) : undefined;
    // Fuel data stays private: only warn about the player's own units, never
    // expose an enemy's exact reserve through a visible tile.
    const fuelTurns = unit && isDeployedUnit(unit) && unit.owner === me ? fuelTurnsRemaining(unit) : undefined;
    const fuelWarning = fuelTurns !== undefined && fuelTurns <= 2
      ? `、燃料警告: ${unit!.fuel ?? unitStats[unit!.kind].fuel}、補給まで残り ${fuelTurns} 行動機会`
      : '';
    const ammoEmpty = unit && !hidden && unit.owner === me && unitStats[unit.kind].ammo > 0 && !hasUsableWeapon(renderedGame, unit, false);
    const ammoWarning = ammoEmpty ? `、${uiText.ammoEmpty}` : '';
    const rank = unit ? experienceRank(unit.experience) : 0;
    const unitLabel = translateGameText(unit && !hidden ? `${sideName(matchMode, unit.owner)}の${unitNames[unit.kind]}${rank ? `（${rankNames[rank]}）` : ''}、耐久 ${unit.hp}${cargo ? `、搭載 ${unitNames[cargo.kind]}` : ''}${fuelWarning}${ammoWarning}` : '');
    const label = unit && !hidden
      ? `<span class="unit ${unit.owner} unit-${unit.kind}" aria-hidden="true"><span class="unit-art"></span><small>${unit.hp}</small><em>${unitNames[unit.kind]}${cargo ? `・${unitNames[cargo.kind]}搭載` : ''}</em><i class="unit-owner-marker">${unit.owner === me ? '自' : '敵'}</i>${cargo ? '<i class="cargo-marker">積</i>' : ''}${rank ? `<i class="rank-marker">${rankStars(rank)}</i>` : ''}${fuelWarning ? `<i class="fuel-warning">燃${fuelTurns}</i>` : ''}${ammoEmpty ? `<i class="ammo-warning">${uiText.ammo}0</i>` : ''}</span>`
      : contact ? renderReconMarker(contact) : '';
    const terrainArt = hidden ? '' : renderTerrainArt(terrain.kind, renderedMap.theme);
    const facility = isPropertyDisplayed(terrain, me, !hidden)
      ? `<span class="facility facility-${terrain.kind} ${propertyOwner ?? 'neutral'}" aria-hidden="true"><b>${terrain.kind === 'supplyDepot' ? '補' : terrain.kind === 'city' ? '市' : terrain.kind === 'factory' ? '工' : terrain.kind === 'airport' ? '空' : terrain.kind === 'port' ? '港' : '司'}</b><small>${propertyOwner === me ? '自軍' : propertyOwner === foe ? '敵軍' : '中立'}${capturePoints !== undefined ? ` ${capturePointsLabel(capturePoints)}` : ''}</small></span>`
      : '';
    // `selected` is undefined until a unit is picked, so the unit must exist too:
    // comparing two undefined values would mark every empty tile as selected.
    const isSelected = selected !== undefined && unit?.id === selected;
    const isReachable = movable.has(`${x},${y}`);
    const enemyMovement = previewedEnemyThreat.movement.has(`${x},${y}`);
    const enemyAttack = previewedEnemyThreat.attack.has(`${x},${y}`);
    const movementDanger = isReachable && knownEnemyThreats.has(`${x},${y}`);
    const productionReady = !hidden && idleFacilityKeys.has(`${x},${y}`);
    const isFacilityTarget = productionReady && !!targetFacility && key(targetFacility.position) === `${x},${y}`;
    const statuses = [
      exitPositions.has(`${x},${y}`) ? '脱出地点' : objectivePositions.has(`${x},${y}`) ? '作戦目標地点' : '',
      unit && !hidden && missionTargets.has(unit.id) ? `作戦対象 ${unit.id}` : '',
      isSelected ? '選択中' : '',
      isReachable ? '移動可能' : '',
      enemyMovement ? '選択中の敵ユニットの移動範囲' : '',
      enemyAttack ? '選択中の敵ユニットの攻撃危険域' : '',
      movementDanger ? '敵の攻撃危険域' : '',
      isFacilityTarget ? '生産先に選択中' : productionReady ? '生産可能' : '',
      contact ? reconContactLabel(contact) : '',
      hidden ? '未索敵' : '',
    ].filter(Boolean).map(translateText);
    const stateMarker = `${exitPositions.has(`${x},${y}`) ? '<span class="objective-marker evacuation-exit" aria-hidden="true">脱</span>' : objectivePositions.has(`${x},${y}`) ? '<span class="objective-marker" aria-hidden="true">目</span>' : ''}${unit && !hidden && missionTargets.has(unit.id) ? '<span class="mission-unit-marker" aria-hidden="true">任</span>' : ''}${isSelected ? '<span class="tile-state-marker selected-marker" aria-hidden="true">選</span>' : ''}${isReachable ? '<span class="tile-state-marker reachable-marker" aria-hidden="true">移</span>' : ''}${productionReady ? '<span class="tile-state-marker facility-ready-marker" aria-hidden="true">産</span>' : ''}${enemyMovement ? '<span class="tile-state-marker enemy-move-marker" aria-hidden="true">敵移</span>' : ''}${(enemyAttack || movementDanger) ? '<span class="tile-state-marker danger-marker" aria-hidden="true">危</span>' : ''}`;
    return `<button data-ui-copy ${!canAct ? 'disabled' : ''} class="tile ${!replayMode && matchMode === 'spectate' && spectateLastAction && key(spectateLastAction) === `${x},${y}` ? 'spectate-current' : ''} ${terrain.kind} ${bridgeTargets.has(`${x},${y}`) ? 'bridge-target' : ''} ${supplyTiles.has(`${x},${y}`) ? 'supply-coverage' : ''} ${isSelected ? 'selected' : ''} ${isReachable ? 'reachable' : ''} ${enemyMovement ? 'enemy-move-zone' : ''} ${enemyAttack ? 'enemy-attack-zone' : ''} ${movementDanger ? 'movement-danger' : ''} ${isFacilityTarget ? 'facility-target' : ''} ${hidden ? 'fog' : ''}" data-x="${x}" data-y="${y}" data-terrain="${terrain.kind}" tabindex="${focusedPosition.x === x && focusedPosition.y === y ? '0' : '-1'}" title="${propertyLabel}${unitLabel ? ` — ${unitLabel}` : ''}${statuses.length ? ` — ${statuses.join('、')}` : ''}" aria-label="${propertyLabel}${hasBridge(renderedGame, { x, y }) ? '、仮設橋（位置は公開）' : ''}${bridgeTargets.has(`${x},${y}`) ? '、架橋可能' : ''}${unitLabel ? `、${unitLabel}` : ''}${supplyTiles.has(`${x},${y}`) ? '、自軍補給範囲' : ''}${!hidden && renderedGame.fortifications?.some(site => key(site.position) === `${x},${y}`) ? '、防御陣地' : ''}${statuses.length ? `、${statuses.join('、')}` : ''}">${terrainArt}${bridgeMarker(renderedGame, { x, y })}${stateMarker}${fortificationAt(renderedGame, { x, y }, visible)}${facility}${label}</button>`;
  })).join('');
  const ownUnitCount = renderedGame.units.filter(unit => unit.owner === me).length;
  const ownUnitLimit = usesDecisionRules(renderedGame) ? unitLimit(renderedGame.board, renderedGame.ruleVersion) : undefined;
  const atUnitLimit = ownUnitLimit !== undefined && ownUnitCount >= ownUnitLimit;
  const production = producibleUnits.filter(kind => isUnitKindAvailable(kind, renderedGame.ruleVersion) && (!productionMenuOpen || !targetFacility || targetFacility.kinds.includes(kind))).map(kind => {
    // A chosen facility restricts the roster to what it can build; otherwise any
    // idle facility of the right type may take the order.
    const facility = targetFacility ?? idleFacilities.find(candidate => candidate.kinds.includes(kind));
    const buildable = facility !== undefined && facility.kinds.includes(kind);
    const cost = unitStats[kind].cost;
    const affordable = renderedGame.players[me].gold >= cost;
    const missing = Math.max(0, cost - renderedGame.players[me].gold);
    const productionTerrain = (['port', 'airport', 'factory'] as const).find(terrain => productionKindsForRule(productionRule, renderedGame.ruleVersion)[terrain]?.includes(kind));
    const facilityName = terrainNames[facility?.kind ?? productionTerrain ?? 'factory'];
    const where = buildable ? `${facilityName} (${facility.position.x + 1}, ${facility.position.y + 1})` : facilityName;
    const availability = atUnitLimit ? '部隊数が上限です' : !buildable ? '生産可能な空き施設がありません' : !affordable ? `資金不足（あと ${missing}G）` : '生産可能';
    return `<button data-ui-copy class="produce produce-${kind}" data-kind="${kind}" ${!canAct || atUnitLimit || !buildable || !affordable ? 'disabled' : ''} title="${where}で${unitNames[kind]}を生産 (${cost}G) — ${unitWeaponName(kind, renderedGame)}・${uiText.ammoCapacity} ${weaponsForUnit(kind, renderedGame).map(weapon => weapon.ammo).join(' / ')} — ${availability}" aria-label="${where}で${unitNames[kind]}を${cost}ゴールドで生産、${availability}"><span aria-hidden="true">${unitTokens[kind]}</span>${unitNames[kind]} <em>${cost}G</em>${!affordable ? ` <small>資金不足（あと ${missing}G）</small>` : ''}</button>`;
  }).join('');
  const productionLauncher = `<button id="open-production" class="save-action production-launcher" ${!canAct || !idleFacilities.length || atUnitLimit ? 'disabled' : ''}>ユニット生産 <span>${idleFacilities.length}施設</span></button>`;
  const productionSummary = `<p data-ui-copy class="production-summary">空き生産施設 <strong>${idleFacilities.length}</strong> / ${countProductionFacilities(renderedGame, me, productionRule)}${ownUnitLimit !== undefined ? `・部隊数 <strong>${ownUnitCount}</strong> / ${ownUnitLimit}` : ''}</p>`;
  const productionTargetLine = targetFacility
    ? `<p class="production-target">生産先 <strong>${terrainNames[targetFacility.kind]} (${targetFacility.position.x + 1}, ${targetFacility.position.y + 1})</strong><button id="clear-production-facility" class="save-action">自動選択</button></p>`
    : '<p class="production-target">生産先 <strong>自動選択</strong>（盤面の「産」マスを選ぶと指定できます）</p>';
  const productionOverlay = productionMenuOpen && canAct ? renderProductionMenu({
    facilities: idleFacilities, target: targetFacility?.position, funds: renderedGame.players[me].gold,
    summary: productionSummary, units: production, notice: productionNotice,
  }) : '';
  const activeLabel = sideName(matchMode, renderedGame.activePlayer);
  const selectedTerrain = selectedUnit && isDeployedUnit(selectedUnit) ? renderedGame.board.terrain[selectedUnit.position.y]?.[selectedUnit.position.x] : undefined;
  const canCapture = selectedUnit?.owner === renderedGame.activePlayer && isDeployedUnit(selectedUnit)
    && !selectedUnit.hasActed && unitStats[selectedUnit.kind].capturePower > 0 && selectedTerrain
    && isPropertyTerrainKind(selectedTerrain.kind) && selectedTerrain.owner !== renderedGame.activePlayer;
  const captureAction = !replayMode && canCapture ? `<section class="capture-card"><p class="card-kicker">PROPERTY ACTION</p><strong>${terrainNames[selectedTerrain!.kind]}を占領</strong><span>${selectedTerrain!.owner === foe ? '敵軍' : '中立'}拠点・占領値 ${selectedTerrain!.capturePoints ?? '—'}</span><button class="capture" id="capture" aria-label="この拠点を占領する">占領する</button></section>` : '';
  const canWait = !replayMode && selectedUnit?.owner === renderedGame.activePlayer && isDeployedUnit(selectedUnit) && !selectedUnit.hasActed;
  const waitAction = canWait ? `<section class="capture-card"><p class="card-kicker">UNIT ACTION</p><strong>${unitNames[selectedUnit!.kind]}の行動</strong><span>移動・攻撃・占領を行わず、この部隊の行動を終了します。</span><button id="wait" aria-label="選択中のユニットの行動を終了する">行動を終了</button></section>` : '';
  const mergeTargets = !replayMode && selectedUnit?.owner === renderedGame.activePlayer && isDeployedUnit(selectedUnit) && !selectedUnit.hasActed && !isEvacuationTarget(renderedGame, selectedUnit.id, selectedUnit.owner)
    ? renderedGame.units.filter(unit => isDeployedUnit(unit) && unit.owner === selectedUnit.owner && unit.kind === selectedUnit.kind
      && isMergeableUnit(unit.kind) && !unit.hasActed && adjacent(selectedUnit.position, unit.position))
    : [];
  const mergeAction = mergeTargets.length > 0
    ? `<section class="capture-card merge-card"><p class="card-kicker">UNIT ACTION</p><strong>${unitNames[selectedUnit!.kind]}を合流</strong><span>隣接する同種部隊を1部隊にまとめます。耐久・補給値を合算し、選択中の部隊が行動済みになります。</span>${mergeTargets.map(unit => `<button class="merge" data-target-id="${escapeHtml(unit.id)}">${unitNames[unit.kind]}（${unit.position!.x + 1}, ${unit.position!.y + 1}）と合流</button>`).join('')}</section>`
    : '';
  const selectedUnitActions = renderUnitActionCluster([captureAction, waitAction, mergeAction]);
  const embarkTargets = selectedUnit?.owner === renderedGame.activePlayer && isDeployedUnit(selectedUnit) && isEmbarkableUnit(selectedUnit.kind) && !selectedUnit.hasActed
    ? renderedGame.units.filter((unit) => isDeployedUnit(unit) && transportCapacity(unit.kind) > 0 && unit.owner === selectedUnit.owner
      && !unit.hasMoved && !unit.hasActed && adjacent(selectedUnit.position, unit.position)
      && !renderedGame.units.some(candidate => candidate.embarkedIn === unit.id))
    : [];
  const cargo = selectedUnit && isDeployedUnit(selectedUnit) && transportCapacity(selectedUnit.kind) > 0 ? renderedGame.units.find(unit => unit.embarkedIn === selectedUnit.id) : undefined;
  const landingTargets = selectedUnit?.owner === renderedGame.activePlayer && isDeployedUnit(selectedUnit) && transportCapacity(selectedUnit.kind) > 0
    && !selectedUnit.hasMoved && !selectedUnit.hasActed && cargo
    ? [{ x: selectedUnit.position.x + 1, y: selectedUnit.position.y }, { x: selectedUnit.position.x - 1, y: selectedUnit.position.y }, { x: selectedUnit.position.x, y: selectedUnit.position.y + 1 }, { x: selectedUnit.position.x, y: selectedUnit.position.y - 1 }]
      .filter(position => {
        const terrain = renderedGame.board.terrain[position.y]?.[position.x];
        return terrain?.kind !== undefined && terrain.kind !== 'sea' && !renderedGame.units.some(unit => isDeployedUnit(unit) && key(unit.position) === key(position));
      })
    : [];
  const transportAction = !replayMode && (embarkTargets.length || cargo)
    ? `<section class="transport-card"><p class="card-kicker">TRANSPORT OPERATION</p><strong>${cargo ? `${unitNames[cargo.kind]}を搭載中` : '輸送部隊への搭載'}</strong><span>${cargo ? '隣接する空の陸地を選んで降車させます。' : '隣接する空の輸送部隊を選んで搭載します。'}</span>${embarkTargets.map(unit => `<button class="transport-action embark" data-transport-id="${unit.id}">${unitNames[unit.kind]}に搭載</button>`).join('')}${landingTargets.map(position => `<button class="transport-action disembark" data-x="${position.x}" data-y="${position.y}">(${position.x + 1}, ${position.y + 1}) に降車</button>`).join('')}${cargo && landingTargets.length === 0 ? '<em class="transport-note">降車できる隣接陸地がありません。</em>' : ''}</section>`
    : '';
  const evacuationAction = !replayMode && selectedUnit?.owner === me && isEvacuationTarget(renderedGame, selectedUnit.id, me)
    ? `<section class="transport-card evacuation-card"><p class="card-kicker">撤退操作</p><strong>作戦対象 ${escapeHtml(selectedUnit.id)}</strong><p>脱出地点「脱」へ移動し、未行動の状態で撤退してください。搭載部隊は先に降車させます。</p><button id="evacuate-unit" class="end-turn" ${canAct && canEvacuateUnit(renderedGame, selectedUnit.id) ? '' : 'disabled'}>脱出地点から撤退</button></section>` : '';
  const indirectFireBlocked = !replayMode && selectedUnit?.owner === renderedGame.activePlayer
    && unitStats[selectedUnit.kind].indirect && selectedUnit.hasMoved && !selectedUnit.hasActed
    && !hasUsableWeapon(renderedGame, selectedUnit);
  const forecasts = !replayMode && selectedUnit && selectedUnit.owner === renderedGame.activePlayer && !indirectFireBlocked
    ? visibleEnemies(renderedGame, selectedUnit.owner).map(enemy => ({ enemy, forecast: forecastCombat(renderedGame, selectedUnit, observedEnemy(enemy), selectedWeaponSlot()) })).filter((item): item is { enemy: typeof item.enemy; forecast: Extract<typeof item.forecast, { ok: true }> } => item.forecast.ok)
    : [];
  const forecastCard = forecasts.length > 0 || indirectFireBlocked ? `<section class="forecast-card"><p class="card-kicker">戦闘予測</p>${forecasts.map(({ enemy, forecast }) => {
    const outgoing = damageRange(forecast.value.damageToDefender);
    const incoming = forecast.value.possibleCounter ? { min: 0, max: forecast.value.incoming.max } : undefined;
    return `<div class="forecast-row"><span>${unitNames[enemy.kind]}（耐久 ${enemy.hp}）<small>${weaponNames[weaponsForUnit(selectedUnit!.kind, renderedGame)[forecast.value.attackWeapon]!.kind]}</small></span><span class="forecast-damage">与 ${outgoing.min}〜${outgoing.max}</span><span class="forecast-counter">被 ${incoming ? `${incoming.min}〜${incoming.max}` : 'なし'}</span></div>`;
  }).join('')}${indirectFireBlocked ? '<p class="forecast-note">間接砲は移動したターンに射撃できません。</p>' : selectedUnit!.hasActed ? '<p class="forecast-note">このユニットは行動済みです。</p>' : ''}</section>` : '';
  const summaryResult = !replayMode && renderedGame.winner ? resultCache.summarize(renderedGame, initialState, commandHistory, renderedMap.id, difficulty) : undefined;
  const summary = summaryResult?.ok ? summaryResult.value : undefined;
  const campaignResult = campaignRun && campaignOutcome
    ? `<section class="campaign-result"><span class="campaign-grade grade-${campaignOutcome.result.grade.toLowerCase()}">${campaignOutcome.result.grade}</span><div><strong>作戦評価</strong><p>${campaignOutcome.result.score}点・残存 ${campaignOutcome.result.survivingUnits}部隊・損失 ${campaignOutcome.result.losses}部隊</p>${campaignOutcome.persisted ? `<p>経験を記録：${campaignOutcome.veteranCount}部隊${campaignOutcome.nextScenarioId ? '・次作戦の同種部隊へ継承' : '・全作戦完了'}</p>` : `<p class="campaign-save-error">${escapeHtml(campaignNotice)}</p>`}</div></section>`
    : '';
  const campaignResultActions = campaignRun
    ? `<button id="campaign-retry" class="save-action">再挑戦</button><button id="campaign-back" class="save-action">キャンペーンへ戻る</button>${campaignOutcome?.nextScenarioId ? '<button id="campaign-next" class="end-turn">次の戦場へ</button>' : ''}`
    : '<button id="restart" class="save-action">もう一度</button><button id="result-title-menu" class="save-action">タイトルへ</button>';
  const gameOverOverlay = renderGameOverOverlay({
    visible: !activeTacticalScene && !screens.campaignMenuOpen && !screens.titleOpen && !replayMode && renderedGame.winner !== undefined,
    winner: renderedGame.winner,
    summary,
    summaryError: summaryResult && !summaryResult.ok ? summaryResult.error : undefined,
    mapName: scenarioDisplayName(renderedMap),
    difficultyName: matchDifficultyName(),
    campaignResult: campaignResult + (operationOutcome ? renderOperationChallenges(renderedMap.id, operationOutcome) + `<p role="status">${escapeHtml(operationNotice)}</p>` : '') + (dailyOutcome && !campaignRun ? renderDailyResult({ ...dailyOutcome, copyNotice: dailyCopyNotice }) : ''),
    campaignActions: campaignResultActions,
    reasonLabel: victoryReason(renderedGame, renderedMap) === 'objectiveLost' ? '必要な作戦対象を失いました。' : victoryReason(renderedGame, renderedMap) === 'decision' ? uiText.decisionVictory : victoryReason(renderedGame, renderedMap) === 'control' ? '拠点支配得点で勝利しました。' : undefined,
    sideNames: matchMode === 'cpu' ? undefined : { red: sideName(matchMode, 'red'), blue: sideName(matchMode, 'blue') },
  });
  const commander = renderedGame.activePlayer === 'red'
    ? { image: './assets/commander-red.webp', alt: '赤軍司令官の肖像', title: 'RED COMMAND', label: matchMode === 'cpu' ? '前線司令部' : '赤軍司令部' }
    : { image: './assets/commander-blue.webp', alt: '青軍司令官の肖像', title: 'BLUE COMMAND', label: matchMode === 'cpu' ? '敵軍司令部' : '青軍司令部' };
  const mapTheme = `theme-${renderedMap.theme}`;
  const tileInspectorPanel = renderTileInspector(renderedGame, productionRule);
  const unitBriefPanel = renderUnitBrief(renderedGame, me, visible, selected, focusedPosition, selectedWeaponSlot(), canCommand());
  const turnStatus = !replayMode && matchMode === 'cpu' && !renderedGame.winner
    ? `<section class="map-turn-status ${cpuInProgress ? 'enemy' : 'player'}" aria-label="手番の進行"><div role="status"><strong>${renderedGame.activePlayer === 'blue' ? cpuInProgress ? uiText.enemyTurnTitle : uiText.enemyTurnPausedTitle : uiText.playerTurnTitle} · ${renderedGame.turn}</strong><p>${escapeHtml(localStorage.conflicted ? uiText.turnStopped : cpuInProgress ? uiText.enemyTurnHint : uiText.playerTurnHint)}</p></div>${canAct && !localStorage.conflicted ? `<button id="board-end-turn" class="save-action">${uiText.boardEndTurn}</button>` : ''}</section>` : '';
  // The current numbered turn is still playable; timeout is normalized to a
  // survive condition that resolves only after this count reaches zero.
  const remainingTurns = renderedMap.turnLimit === undefined ? undefined : Math.max(0, renderedMap.turnLimit - renderedGame.turn + 1);
  // Property ownership is public; unit value is not shown because it would reveal hidden units.
  const renderedDecisionRound = decisionRound(renderedGame, renderedMap);
  const decisionPanel = renderedDecisionRound === undefined ? '' : `<div class="objective-group decision"><h3>判定</h3><ul><li><span>${escapeHtml(uiText.decisionRule(renderedDecisionRound))}</span><strong>拠点 ${decisionStanding(renderedGame, me).properties} 対 ${decisionStanding(renderedGame, foe).properties}・残り ${Math.max(0, renderedDecisionRound - renderedGame.turn + 1)}</strong></li></ul></div>`;
  const objectivePanel = `<section class="objective-card" aria-labelledby="objective-title"><div class="objective-heading"><div><p class="card-kicker">MISSION</p><h2 id="objective-title">作戦目標</h2></div>${remainingTurns !== undefined ? `<span class="turn-limit"><strong>${remainingTurns}</strong> 残りターン</span>` : renderedDecisionRound !== undefined ? `<span class="turn-limit"><strong>${Math.max(0, renderedDecisionRound - renderedGame.turn + 1)}</strong> 判定まで</span>` : `<span class="turn-limit unlimited">制限なし</span>`}</div><div class="objective-group victory"><h3>勝利条件</h3><ul>${me === 'red' ? objectiveList(renderedMap.victoryConditions, renderedGame, 'red') : objectiveList(renderedMap.defeatConditions, renderedGame, 'blue')}</ul></div><div class="objective-group defeat"><h3>敗北条件</h3><ul>${me === 'red' ? objectiveList(renderedMap.defeatConditions, renderedGame, 'blue') : objectiveList(renderedMap.victoryConditions, renderedGame, 'red')}</ul></div>${decisionPanel}${campaignRun ? `<details class="campaign-orders"><summary>作戦指令・補給方針</summary><p data-user-content>${escapeHtml(scenarioDisplayBriefing(renderedMap))}</p></details>` : ''}</section>`;
  const unactedUnits = !replayMode && canAct ? unactedOwnUnits(renderedGame, me) : [];
  const unitQueuePanel = !replayMode ? `<section class="unit-queue-card" aria-labelledby="unit-queue-title"><div><p class="card-kicker">UNIT STATUS</p><h2 id="unit-queue-title">未行動部隊 <strong>${unactedUnits.length}</strong></h2></div>${unactedUnits.length ? `<ol>${unactedUnits.map(unit => `<li><button class="unit-queue-item" data-unit-id="${unit.id}" aria-label="${unitNames[unit.kind]}、耐久 ${unit.hp}、マス ${unit.position.x + 1}、${unit.position.y + 1} を選択"><span class="${unit.owner}" aria-hidden="true">${unitTokens[unit.kind]}</span>${unitNames[unit.kind]} <em>${unit.hp}</em></button></li>`).join('')}</ol><button id="next-unit" class="save-action" ${canAct ? '' : 'disabled'}>次の未行動部隊 <kbd>N</kbd></button>` : '<p class="unit-queue-empty">未行動の自軍ユニットはありません。</p>'}</section>` : '';
  // Phones put the command panel a long scroll below the board, so the actions a
  // turn actually needs stay reachable in a bar fixed to the bottom of the screen.
  const mobileActionBar = !replayMode
    ? `<nav class="mobile-action-bar" aria-label="クイック操作"><button id="mobile-next-unit" class="mobile-action" ${canAct && unactedUnits.length > 0 ? '' : 'disabled'}><span aria-hidden="true">▶</span>未行動 <strong>${unactedUnits.length}</strong></button><button id="mobile-wait" class="mobile-action" ${canWait ? '' : 'disabled'}><span aria-hidden="true">✓</span>行動終了</button><button id="mobile-capture" class="mobile-action" ${canCapture ? '' : 'disabled'}><span aria-hidden="true">⚑</span>占領</button><button id="mobile-production" class="mobile-action" ${!canAct || !idleFacilities.length || atUnitLimit ? 'disabled' : ''}><span aria-hidden="true">＋</span>生産</button><button id="mobile-panel" class="mobile-action"><span aria-hidden="true">☰</span>作戦情報</button><button id="mobile-end" class="mobile-action mobile-action-primary" ${!canAct ? 'disabled' : ''}><span aria-hidden="true">→</span>ターン終了</button></nav>`
    : '';
  const turnSetting = !replayMode ? `<section class="turn-setting"><label><input id="confirm-end-turn" type="checkbox" ${confirmEndTurnWithUnacted ? 'checked' : ''}> 未行動部隊がいる時にターン終了を確認する</label></section>` : '';
  const saveSlotManager = !replayMode && !screens.titleOpen ? renderSaveSlotManager(listSaveSlots(localStorage), getStorageUsage(localStorage), true, matchMode === 'spectate') : '';
  const cpuActivityPanel = !replayMode && matchMode === 'cpu' ? `<section class="intel-card" aria-labelledby="cpu-activity-title"><p class="card-kicker">ENEMY ACTIVITY</p><h2 id="cpu-activity-title">直前のCPU行動</h2>${cpuActivity.length ? `<ol>${cpuActivity.map(entry => `<li>${escapeHtml(translateGameText(entry))}</li>`).join('')}</ol>` : '<p>視認できる敵行動はありません。</p>'}</section>` : '';
  const campaignCards = screens.campaignMenuOpen ? campaignStages.map((stage, index) => {
    const map = maps.find(candidate => candidate.id === stage.scenarioId);
    const operation = campaignOperations[stage.scenarioId];
    const unlocked = !!map && isCampaignScenarioUnlocked(campaignProgress, stage.scenarioId);
    const grade = campaignProgress.bestGrades[stage.scenarioId];
    if (!map) return `<article data-ui-copy class="campaign-stage locked"><div class="campaign-stage-number">0${index + 1}</div><div><p class="card-kicker">UNAVAILABLE</p><h3>作戦データを読み込めません</h3><p>組み込みシナリオの読み込みに失敗したため、この作戦は開始できません。</p><span>推奨 ${stage.recommendedTurns} ターン</span></div><button class="save-action" disabled>利用不可</button></article>`;
    const deployment = campaignDeployment(campaignProgress, stage.scenarioId);
    return `<article data-ui-copy class="campaign-stage ${unlocked ? '' : 'locked'}"><div class="campaign-stage-number">${String(index + 1).padStart(2, '0')}</div><div><p class="card-kicker">${grade ? 'CLEARED' : unlocked ? 'OPEN' : 'LOCKED'} · ${escapeHtml(translateText(operation?.phase ?? ''))}</p><h3>${escapeHtml(operation?.title ?? map.name)}</h3><p>${escapeHtml(operation?.orders ?? map.briefing)}</p>${operation ? `<details class="campaign-orders"><summary>敵情・補給方針</summary><p>${escapeHtml(operation.enemyOrders)}</p><p>${escapeHtml(operation.logistics)}</p></details>` : ''}<span>目安 ${stage.recommendedTurns} ターン${operation?.deadline ? ` ／ 期限 ${operation.deadline}` : ''}</span>${renderCampaignRoster(stage.scenarioId, campaignProgress.veteransByScenario?.[stage.scenarioId] ?? [])}${unlocked ? `<p class="campaign-deployment">出撃支援 +${deployment.support}G ／ 引継候補 ${deployment.veterans.length}部隊</p>` : ''}</div>${grade ? `<strong class="campaign-grade grade-${grade.toLowerCase()}">${grade}</strong>` : ''}<button class="save-action campaign-start" data-campaign-id="${stage.scenarioId}" ${unlocked ? '' : 'disabled'}>${grade ? '再出撃' : '作戦準備'}</button></article>`;
  }).join('') : '';
  const campaignOverlay = renderCampaignOverlay(screens.campaignMenuOpen, campaignStages.length, campaignNotice, campaignCards);
  const editorOverlay = screens.editorOpen ? renderEditorView(editor, editorNotice, paintMode, editorHistory) : "";
  const boardZoomControls = `<div class="board-zoom-controls" aria-label="盤面の拡大率"><button id="board-zoom-out" class="save-action" aria-label="盤面を縮小" title="盤面を縮小" ${boardZoomIndex === 0 ? 'disabled' : ''}>−</button><span aria-live="polite">${boardZoomPercent(boardZoomIndex)}%</span><button id="board-zoom-in" class="save-action" aria-label="盤面を拡大" title="盤面を拡大" ${boardZoomIndex === BOARD_ZOOM_LEVELS.length - 1 ? 'disabled' : ''}>＋</button></div>`;
  const spectateCameraControls = !replayMode && matchMode === 'spectate' && !screens.briefingOpen && !screens.titleOpen && !screens.campaignMenuOpen && !screens.editorOpen
    ? renderSpectatorCamera(renderedGame, visible, spectateFollow, spectateLocatedUnitId) : '';
  // Spectating starts from the briefing and has nothing to pause once decided;
  // modal screens hide it so it is not reachable behind them.
  const spectateControl = !replayMode && matchMode === 'spectate' && !screens.briefingOpen && !screens.campaignMenuOpen && !screens.editorOpen && !renderedGame.winner
    ? `<button id="spectate-toggle" class="save-action" aria-pressed="${spectatePaused}">${spectatePaused ? uiText.spectateResume : uiText.spectatePause}</button>`
    : '';
  // Spectating sets each side's CPU; replays record a single difficulty.
  // A spectated replay shows both sides' recorded difficulties, read-only.
  const renderedRedDifficulty = replay ? replay.file.redDifficulty : matchMode === 'spectate' ? redDifficulty : undefined;
  const spectateDifficulties = renderedRedDifficulty !== undefined;
  const difficultyOptions = (current: CpuDifficulty) => cpuDifficulties
    .map(level => `<option value="${level}" ${level === current ? 'selected' : ''}>${difficultyNames[level]}</option>`).join('');
  // Viewing only, so it stays usable while the CPUs play.
  const wholeBoardControl = !replayMode && matchMode === 'spectate' && !screens.briefingOpen && !screens.campaignMenuOpen && !screens.editorOpen
    ? `<button id="spectate-whole-board" class="save-action" aria-pressed="${spectateWholeBoard}">${uiText.spectateWholeBoard}</button>`
    : '';
  // The share-link confirmation is a dialog of its own, so the title steps aside while it shows.
  const shareDialogOpen = shareDialogVisible({
    hasPending: titleState.pendingShare !== undefined, titleOpen: screens.titleOpen, replayMode,
    campaignMenuOpen: screens.campaignMenuOpen, editorOpen: screens.editorOpen, briefingOpen: screens.briefingOpen,
    gameOverVisible: gameOverOverlay !== '', handoffConcealed: concealed, productionMenuOpen: productionOverlay !== '',
    tacticalSceneActive: activeTacticalScene !== undefined, cpuInProgress,
  });
  if (shareDialogOpen && titleState.shareReturnFocus === undefined) titleState.shareReturnFocus = focusSelector?.startsWith('#title-') || focusSelector?.startsWith('.title-map-card') ? focusSelector : '';
  const shareDialog = shareDialogOpen && titleState.pendingShare
    ? renderShareLinkDialog({ share: titleState.pendingShare.share, name: scenarioDisplayName(titleState.pendingShare.scenario), status: translateText(titleState.pendingShare.status) })
    : '';
  const titleOverlay = buildTitleOverlay({
    state: titleState,
    titleOpen: screens.titleOpen && !shareDialogOpen, replayMode, campaignMenuOpen: screens.campaignMenuOpen, editorOpen: screens.editorOpen,
    scenarios: () => availableScenarios(),
    selectedMapId: selectedMap.id,
    mapPreview: map => mapPreviews.get(map) ?? (() => {
      const preview = renderMapPreview(map.board, map.initialUnits, map.theme);
      mapPreviews.set(map, preview);
      return preview;
    })(),
    operationCatalog, operationNotice,
    dailyCatalog, dailyNotice, dailyClock,
    savePicker: () => renderSaveSlotManager(listSaveSlots(localStorage), getStorageUsage(localStorage), false, matchMode === 'spectate'),
    cpuSpeed,
    boardZoom: { index: boardZoomIndex, automatic: boardZoomAuto },
    musicSettings,
    canContinue: hasSave(),
    storagePersistent: localStorage.persistent,
    hasStoredSave,
  });
  const deployment = screens.briefingOpen ? plannedDeployment() : undefined;
  const briefing = renderBriefingOverlay({
    visible: !screens.campaignMenuOpen && !screens.titleOpen && !replayMode && screens.briefingOpen,
    backToTitle: true,
    finiteSupplies,
    requiresStrategy: game.units.some(unit => unit.callsign !== undefined),
    requiresAirlift: [...deploymentChoices.red, ...deploymentChoices.blue].includes('transportHelicopter'),
    fixedConditions: dailyLocked(),
    mapName: scenarioDisplayName(renderedMap),
    deployment: ((game.ruleVersion ?? 0) >= 12 && !dailyLocked() && matchMode !== 'hotseat' ? renderArmyPolicies(cpuPolicies, matchMode === 'spectate') : '') + (dailyLocked() && screens.briefingOpen ? renderDailyBriefingNote({ conditions: dailyBriefingConditions(), standard: !!deployment?.ok && isStandardDailyDefinition(deployment.value) }) : '') + (deploymentBase && deploymentBase.id !== 'training' && screens.briefingOpen ? renderDeployment(deploymentBase, deploymentChoices, matchMode === 'cpu' ? ['red'] : ['red', 'blue'], deploymentOpen, deploymentNotice, { catalog: presetCatalog, notice: presetNotice, draftNames: presetDraftNames }) + renderOperationChallenges(renderedMap.id) : ''),
    beginDisabled: deployment !== undefined && !deployment.ok,
    briefing: scenarioDisplayBriefing(renderedMap),
    victoryConditions: [...renderedMap.victoryConditions.map(conditionDescription), ...(renderedDecisionRound === undefined ? [] : [uiText.decisionRule(renderedDecisionRound)])],
    matchMode: campaignRun ? undefined : matchMode,
    conditionHeadings: campaignRun ? { victory: '勝利条件（いずれか達成）', defeat: '敗北条件（いずれか成立）' }
      : matchMode === 'cpu' ? undefined : { victory: '赤軍の勝利条件', defeat: '青軍の勝利条件' },
    spectateDifficulties: { red: redDifficulty, blue: difficulty, levels: cpuDifficulties.map(level => ({ value: level, label: difficultyNames[level] })) },
    defeatConditions: renderedMap.defeatConditions.map(conditionDescription),
    startingGold: deployment?.ok ? createScenarioInitialState(deployment.value).players.red.gold : initialState.players.red.gold,
    turnLimit: renderedMap.turnLimit,
    difficultyName: matchDifficultyName(),
    campaignRun: campaignRun !== undefined,
    campaignPreparation: campaignRun ? {
      support: initialState.scenarioSnapshot?.firstPlayerBonus ?? 0,
      veterans: deployment?.ok ? deployment.value.initialUnits.filter(unit => unit.owner === 'red' && (unit.experience ?? 0) > 0).length : initialState.units.filter(unit => unit.owner === 'red' && (unit.experience ?? 0) > 0).length,
    } : undefined,
  });
  app.innerHTML = `<main class="game-shell">
    <div class="build-info">${renderLocalePicker()}v${escapeHtml(buildInfo.version)} · ${escapeHtml(buildInfo.sha.slice(0, 12))} <button id="diagnostics-export">診断情報を保存</button></div>
    ${localStorage.conflicted ? '<p role="alert">別のタブでデータが変更されました。書き込みを停止しています。バックアップ後に再読み込みしてください。<button id="storage-reload">再読み込み</button></p>' : ''}
    ${!localStorage.persistent ? '<p class="storage-warning" role="alert">ブラウザーの保存領域を利用できません。このタブを閉じるとデータが失われます。バックアップをダウンロードしてください。</p>' : ''}
    <header class="command-bar"><div class="brand"><span class="brand-mark" aria-hidden="true">✦</span><div><h1>MiniStr</h1><p>TACTICAL COMMAND</p></div></div><label class="map-picker">戦域<select id="map" aria-label="戦域マップを選択" ${replayMode || campaignRun ? 'disabled' : ''}>${!availableScenarios().some(map => map.id === renderedMap.id) ? `<option data-user-content value="${escapeHtml(renderedMap.id)}" selected>${escapeHtml(scenarioDisplayName(renderedMap))}</option>` : ''}<optgroup label="組み込み">${[...maps, ...operationScenarios].map(map => `<option data-user-content value="${escapeHtml(map.id)}" ${map.id === renderedMap.id ? 'selected' : ''}>${escapeHtml(scenarioDisplayName(map))}</option>`).join('')}</optgroup>${availableScenarios().filter(map => ![...maps, ...operationScenarios].some(builtIn => builtIn.id === map.id)).length ? `<optgroup label="カスタム">${availableScenarios().filter(map => ![...maps, ...operationScenarios].some(builtIn => builtIn.id === map.id)).map(map => `<option data-user-content value="${escapeHtml(map.id)}" ${map.id === renderedMap.id ? 'selected' : ''}>${escapeHtml(scenarioDisplayName(map))}</option>`).join('')}</optgroup>` : ''}</select></label>${renderedRedDifficulty ? `<label class="map-picker">${uiText.spectateRedDifficulty}<select id="red-difficulty" aria-label="赤軍CPUの難易度を選択" ${replayMode || dailyLocked() ? 'disabled' : ''}>${difficultyOptions(renderedRedDifficulty)}</select></label>` : ''}<label class="map-picker">${spectateDifficulties ? uiText.spectateBlueDifficulty : '難易度'}<select id="difficulty" aria-label="${spectateDifficulties ? '青軍CPU' : 'CPU'}の難易度を選択" ${replayMode || dailyLocked() ? 'disabled' : ''}>${difficultyOptions(renderedDifficulty)}</select></label>${renderCpuSpeedControl(cpuSpeed, 'cpu-speed', replayMode)}<div class="save-controls"><button id="open-title" class="save-action" ${replayMode ? 'disabled' : ''}>${uiText.titleOpen}</button><button id="open-editor" class="save-action" ${replayMode ? 'disabled' : ''}>マップ編集</button><button id="open-campaign" class="save-action" ${replayMode ? 'disabled' : ''}>キャンペーン</button><button id="continue" class="save-action" ${replayMode || !hasSave() ? 'disabled' : ''}>続きから</button><button id="save" class="save-action" ${replayMode ? 'disabled' : ''}>${manualSaveTarget(matchMode) === 'slot' ? uiText.spectateSaveToSlot : '手動セーブ'}</button><button id="delete-save" class="save-action" ${matchSaveDeletionAllowed(matchMode) ? '' : `title="${escapeHtml(uiText.spectateNoSaveDeletion)}"`} ${replayMode || !hasStoredSave() || !matchSaveDeletionAllowed(matchMode) ? 'disabled' : ''}>対局セーブ削除</button><button id="undo" class="save-action" ${canAct && undoAllowed(matchMode) && undoStack.length > 0 ? '' : 'disabled'}>1手戻す</button><button id="import-replay" class="save-action" ${replayMode ? 'disabled' : ''}>JSON取込</button><input id="replay-file" class="visually-hidden" type="file" accept=".json,application/json" aria-label="JSONリプレイファイルを選択"></div><div class="turn-indicator ${renderedGame.activePlayer}"><span>${replayMode ? 'REPLAY' : cpuInProgress ? 'CPU THINKING' : campaignRun ? 'CAMPAIGN' : matchMode === 'spectate' ? 'SPECTATE' : 'TURN'}</span><strong>${cpuInProgress ? (matchMode === 'spectate' ? `${activeLabel} CPU 行動中` : 'CPU 行動中') : concealed ? `${activeLabel}の番` : activeLabel}</strong></div>${cpuInProgress ? `<button id="skip-cpu" class="save-action" ${cpuSkipAllowed(matchContext()) ? '' : 'disabled'} title="${matchMode === 'spectate' ? 'CPU観戦中はスキップできません。CPU速度を変更できます。' : 'CPUの残りの行動を高速に進める'}">CPU をスキップ</button>` : ''}${spectateControl}${wholeBoardControl}<button id="end" class="end-turn" title="現在のターンを終了" aria-label="ターンを終了する" ${!canAct ? 'disabled' : ''}>ターン終了 <span aria-hidden="true">→</span></button></header>
    ${scenarioLoadError ? `<p class="scenario-warning">組み込みシナリオの読み込みに失敗したため、緊急スカーミッシュで起動しています。${escapeHtml(scenarioLoadError)}</p>` : ''}
    <section class="sound-controls" aria-label="音量設定"><label><input id="sound-muted" type="checkbox" ${!soundSettings.muted ? 'checked' : ''}> 効果音</label><label>音量 <input id="sound-volume" type="range" min="0" max="100" value="${Math.round(soundSettings.volume * 100)}" aria-label="効果音の音量"></label>${renderMusicControls(musicSettings)}</section>
    ${!hasSave() && hasStoredSave() ? `<p class="scenario-warning" role="status">${matchSaveDeletionAllowed(matchMode) ? uiText.invalidSaveWarning : uiText.invalidSaveWarningSpectating}</p>` : ''}
    ${replay ? `<section class="replay-toolbar" aria-label="リプレイ再生コントロール"><div><p class="card-kicker">REPLAY</p><strong aria-live="polite">${replay.index} / ${replay.file.commands.length} 手</strong></div><button id="replay-toggle" class="end-turn" aria-label="${replay.playing ? 'リプレイを一時停止' : replay.index >= replay.file.commands.length ? 'リプレイを最初から再生' : 'リプレイを再生'}" ${replay.file.commands.length === 0 ? 'disabled' : ''}>${replay.playing ? '一時停止' : replay.index >= replay.file.commands.length ? 'もう一度再生' : '再生'}</button><button id="replay-step" class="save-action" ${replay.playing || replay.index >= replay.file.commands.length ? 'disabled' : ''}>1手送り</button><label class="replay-speed">速度<select id="replay-speed" aria-label="リプレイ再生速度">${COMMAND_SPEEDS.map(speed => `<option value="${speed}" ${speed === replay!.speed ? 'selected' : ''}>${speed}x</option>`).join('')}</select></label>${renderReplayNavigation(replay.index, replay.file.commands.length, replay.viewpoint, replay.timeline)}<button id="replay-exit" class="save-action">リプレイを終了</button></section>` : ''}
    ${concealed ? '' : `<section class="battle-layout"><div class="battlefield-wrap ${mapTheme}"><div class="battlefield-heading"><div><p>OPERATION MAP</p><h2 data-user-content>${escapeHtml(scenarioDisplayName(renderedMap))}</h2></div><p class="status-message" aria-live="polite">${escapeHtml(message)}</p></div><p id="board-instructions" class="board-instructions">盤面では矢印キーでマスを移動し、Enter または Space で選択・行動、Esc で選択を解除できます。敵部隊を選択またはフォーカスすると、移動範囲と攻撃危険域を確認できます。N キーで次の未行動部隊へ移動します。</p>${spectateCameraControls}${turnStatus}<div class="battlefield-stage">${!replayMode ? renderReconControl(renderedGame, me, canAct, reconTargeting) : ''}${renderControlObjective(renderedGame, renderedMap)}${evacuationAction}${renderFrontlineControls(renderedGame, me, selected, canAct && !replayMode, showSupplyRange, fortifyPending)}${renderBridgeControls(renderedGame, me, selected, canAct && !replayMode, bridgePending)}${unitBriefPanel}<div id="board-viewport" class="board-viewport" tabindex="0" aria-label="盤面スクロール領域" style="max-height:min(70vh, ${boardViewportHeight}px)"><div data-zoom="${boardZoomPercent(boardZoomIndex)}" class="board ${reconTargeting ? 'recon-targeting' : ''}" role="group" data-user-attributes="aria-label" aria-label="${escapeHtml(translateText(`${scenarioDisplayName(renderedMap)}の戦術マップ`))}" aria-describedby="board-instructions" style="grid-template-columns:repeat(${renderedGame.board.width},${tileSize}px);grid-template-rows:repeat(${renderedGame.board.height},${tileSize}px);aspect-ratio:${renderedGame.board.width} / ${renderedGame.board.height}">${board}</div></div></div>${boardZoomControls}<div class="board-production-controls">${productionLauncher}</div><div class="map-legend" aria-label="マップ凡例"><span><i class="legend-dot reachable-dot" aria-hidden="true">移</i>移動可能</span><span><i class="legend-dot danger-dot" aria-hidden="true">危</i>敵の攻撃危険域</span><span><i class="legend-dot enemy-move-dot" aria-hidden="true">敵移</i>選択敵の移動範囲</span>${wholeBoardShown ? '' : '<span><i class="legend-dot fog-dot" aria-hidden="true">?</i>未索敵</span>'}<span><i class="legend-unit ${me}-dot" aria-hidden="true">自</i>自軍${matchMode === 'cpu' ? '' : `（${sideName(matchMode, me)}）`}</span><span><i class="legend-unit ${foe}-dot" aria-hidden="true">敵</i>敵軍${matchMode === 'cpu' ? '' : `（${sideName(matchMode, foe)}）`}</span><span><i class="legend-facility" aria-hidden="true">拠</i>拠点（市・工・空・港・司・補）</span><span><i class="legend-dot facility-ready-dot" aria-hidden="true">産</i>生産可能</span></div>${renderTerrainLegend(renderedMap.theme, terrainLegendOpen)}${tileInspectorPanel}${reconPanel}${analysisPanel}</div>
    <aside id="command-panel" class="command-panel" aria-label="作戦情報" tabindex="-1">${objectivePanel}${unitQueuePanel}${selectedUnitActions}${cpuActivityPanel}<section class="commander-card ${renderedGame.activePlayer}"><img src="${commander.image}" alt="${commander.alt}" width="512" height="768" loading="lazy" decoding="async"><div><p>COMMANDER</p><h2>${commander.title}</h2><span>${commander.label}</span></div></section>${renderLearning(renderedGame, me, commandHistory, learningOpen)}${transportAction}${forecastCard}<section class="intel-card"><p class="card-kicker">RESOURCES</p><div class="resource-row"><span>自軍資金</span><strong>${renderedGame.players[me].gold}<small>G</small></strong></div><div class="resource-row enemy"><span>敵軍資金</span><strong>${wholeBoardShown ? renderedGame.players[foe].gold : '不明'}<small>G</small></strong></div></section><section class="intel-card"><p class="card-kicker">RECON</p><div class="recon-count"><strong>${renderedGame.units.filter(unit => unit.owner === foe && isDeployedUnit(unit) && visible.has(key(unit.position))).length}</strong><span>確認済み敵部隊</span></div></section>${renderProductionCard(productionTargetLine, productionSummary, production)}${turnSetting}${saveSlotManager}<p class="command-tip">歩兵は中立・敵軍の都市、工場、空港、港湾、司令部で<strong>${getLocale() === 'en' ? 'capture' : '占領'}</strong>できます。生産先は盤面の空き「産」マスを選び、工場・空港・港湾から対応する部隊を生産します。輸送艦は歩兵を1部隊搭載し、別の島へ上陸させられます。</p></aside>
  </section>${mobileActionBar}`}</main>${gameOverOverlay}${briefing}${titleOverlay}${shareDialog}${campaignOverlay}${editorOverlay}${concealed ? renderHandoffOverlay(sideName('hotseat', renderedGame.activePlayer)) : ''}${activeTacticalScene ? ('attacker' in activeTacticalScene ? renderBattleScene(activeTacticalScene) : renderActionScene(activeTacticalScene)) : ''}${productionOverlay}`;
  document.body.classList.toggle('production-menu-open', Boolean(productionOverlay));
  restoreScroll();
  if (pendingBoardCenter && spectateCameraControls) {
    centerBoardOnPosition(app, pendingBoardCenter);
    pendingBoardCenter = undefined;
  }
  const effects = pendingPresentationEffects;
  pendingPresentationEffects = [];
  if (effects.length) {
    const interval = cpuInProgress ? CPU_STEP_DELAY_MS / cpuSpeed : replay?.playing ? 1000 / replay.speed : undefined;
    renderPresentationEffects(app, effects, interval === undefined ? 280 : Math.max(40, Math.min(280, interval - 15)));
    for (const effect of effects) {
      if (activeTacticalScene && 'attacker' in activeTacticalScene && ['attack', 'hit', 'destroy'].includes(effect.sound)) continue;
      soundPlayer.play(effect.sound);
    }
  }
  app.querySelector<HTMLButtonElement>('#battle-scene-skip, #tactical-scene-skip')?.addEventListener('click', () => {
    // The CPU waits out the scene's full length; closing it early must not leave the CPU idle.
    if (dismissTacticalScene() && cpuInProgress) resumeCpuStep?.();
  });
  if (gameOverOverlay || briefing || titleOverlay || campaignOverlay || editorOverlay || concealed || activeTacticalScene || productionOverlay || shareDialog) {
    app.querySelector('main')?.setAttribute('inert', '');
    // A briefing control the player just changed keeps focus, so a following
    // Enter or Space does not land on the start button.
    const briefingFocus = briefing && !gameOverOverlay && !editorOverlay && !campaignOverlay && !concealed && focusSelector?.startsWith('#briefing-') ? focusSelector : undefined;
    // On the title, a redraw keeps focus on the control in use (a failed load's
    // notice is announced by its status role).
    const titleFocus = titleOverlay && !gameOverOverlay && !editorOverlay && !campaignOverlay
      && (focusSelector?.startsWith('#title-') || focusSelector?.startsWith('.title-map-card')) ? focusSelector : undefined;
    // Overlays place focus themselves, so the remembered control is always used
    // up here. A stale one (say, the title card just chosen) would otherwise stop
    // the next redraw from remembering the control actually in use.
    const previousProductionFocus = focusSelector;
    focusSelector = undefined;
    const focusTicket = focusRestoreGuard.capture(generation);
    if (productionOverlay) {
      const selector = previousProductionFocus?.startsWith('#production-') ? previousProductionFocus : '#production-facility';
      window.requestAnimationFrame(() => {
        if (!focusRestoreGuard.isCurrent(focusTicket, renderGeneration)) return;
        const target = app.querySelector<HTMLElement>(selector);
        const fallback = app.querySelector<HTMLElement>('#production-facility:not(:disabled), #production-menu-close');
        (target && !('disabled' in target && target.disabled) ? target : fallback)?.focus({ preventScroll: true });
      });
    } else window.setTimeout(() => focusRestoreGuard.isCurrent(focusTicket, renderGeneration) && document.querySelector<HTMLElement>(activeTacticalScene ? ('attacker' in activeTacticalScene ? '#battle-scene-skip' : '#tactical-scene-skip') : gameOverOverlay ? '#result-title' : editorOverlay ? '#editor-close' : campaignOverlay ? '#campaign-close' : titleOverlay ? titleFocus ?? (titleState.resumable ? '#title-resume' : '.title-map-card[aria-current="true"]') : concealed ? '#handoff-start' : shareDialog ? (previousProductionFocus?.startsWith('#share-link-') ? previousProductionFocus : '#share-link-cancel') : briefingFocus ?? '#begin-operation')?.focus(), 0);
  }
  else if (focusSelector) {
    const previousSelector = focusSelector;
    focusSelector = undefined;
    const focusTicket = focusRestoreGuard.capture(generation);
    window.requestAnimationFrame(() => {
      if (!focusRestoreGuard.isCurrent(focusTicket, renderGeneration)) return;
      const target = app.querySelector<HTMLElement>(previousSelector);
      const focusTarget = target && !('disabled' in target && target.disabled) ? target : app.querySelector<HTMLElement>('#command-panel');
      if (allowBoardFocusScroll && focusTarget?.matches('.tile')) focusTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      focusTarget?.focus({ preventScroll: true });
    });
  }
  // Board commands need the side on the device to be active; menus and the result
  // screen stay usable after the match ends, whoever's turn it was.
  app.querySelector<HTMLButtonElement>('#supply-range')?.addEventListener('click', () => { showSupplyRange = !showSupplyRange; focusSelector = '#supply-range'; render(); });
  app.querySelector<HTMLButtonElement>('#fortify-unit')?.addEventListener('click', () => {
    if (!canCommand() || !selected || fortificationError(game, selected)) return;
    bridgePending = undefined; fortifyPending = selected; focusSelector = '#fortify-confirm'; render();
  });
  app.querySelector<HTMLButtonElement>('#fortify-cancel')?.addEventListener('click', () => { fortifyPending = undefined; focusSelector = '#fortify-unit'; render(); });
  app.querySelector<HTMLButtonElement>('#fortify-confirm')?.addEventListener('click', () => {
    if (!canCommand() || !selected || selected !== fortifyPending) return;
    if (dispatch({ type: 'fortify', unitId: selected }, true)) message = '防御陣地を設営しました。地上部隊の防御★+1。';
    fortifyPending = undefined; render();
  });
  app.querySelectorAll<HTMLButtonElement>('.bridge-destroy').forEach(button => button.addEventListener('click', () => {
    if (!canCommand() || !selected) return;
    const destination = { x: Number(button.dataset.x), y: Number(button.dataset.y) };
    if (!window.confirm(getLocale() === 'en' ? 'Destroy this bridge? The engineer will finish its turn.' : 'この橋を破壊しますか？工兵の行動が終了します。')) return;
    dispatch({ type: 'destroyBridge', unitId: selected, destination }, true);
    render();
  }));
  app.querySelector<HTMLButtonElement>('#bridge-unit')?.addEventListener('click', () => {
    if (!canCommand() || !selected || !bridgeDestinations(game, selected).length) return;
    fortifyPending = undefined; reconTargeting = false; bridgePending = { unitId: selected };
    message = '光る水域を選択して架橋地点を確認します。Escで中止できます。';
    focusBoardPosition(bridgeDestinations(game, selected)[0]!);
  });
  app.querySelector<HTMLButtonElement>('#bridge-cancel')?.addEventListener('click', () => { bridgePending = undefined; focusSelector = '#bridge-unit'; render(); });
  app.querySelector<HTMLButtonElement>('#bridge-confirm')?.addEventListener('click', () => {
    if (!canCommand() || !bridgePending?.destination || selected !== bridgePending.unitId) return;
    if (dispatch({ type: 'bridge', unitId: selected, destination: bridgePending.destination }, true)) message = '仮設橋が完成しました。両軍が利用でき、完成位置は公開されます。';
    bridgePending = undefined; render();
  });
  app.querySelector<HTMLButtonElement>('#recon-target')?.addEventListener('click', () => {
    if (!canCommand() || remainingRecon(game, viewer()) <= 0) return;
    reconTargeting = !reconTargeting; selected = undefined;
    message = reconTargeting ? '偵察地点を選択してください。Escで中止できます。' : '偵察を中止しました。';
    render();
    if (reconTargeting) focusBoardPosition(focusedPosition);
  });
  app.querySelector<HTMLButtonElement>('#recon-cancel')?.addEventListener('click', () => { reconTargeting = false; message = '偵察を中止しました。'; focusSelector = '#recon-target'; render(); });
  app.querySelector<HTMLButtonElement>('#daily-copy-id')?.addEventListener('click', () => { void copyDailyCode(app.querySelector('#daily-code')?.textContent ?? ''); });
  app.querySelector<HTMLButtonElement>('#result-title-menu')?.addEventListener('click', () => { app.querySelector<HTMLButtonElement>('#open-title')?.click(); });
  app.querySelectorAll<HTMLButtonElement>('[data-control-x]').forEach(button => button.addEventListener('click', () => {
    centerBoardOnPosition(app, { x: Number(button.dataset.controlX), y: Number(button.dataset.controlY) });
  }));
  app.querySelector<HTMLDetailsElement>('#recon-history')?.addEventListener('toggle', event => { reconOpen = (event.currentTarget as HTMLDetailsElement).open; });
  app.querySelector<HTMLDetailsElement>('#battle-analysis')?.addEventListener('toggle', event => { analysisOpen = (event.currentTarget as HTMLDetailsElement).open; });
  app.querySelector<HTMLInputElement>('#recon-markers')?.addEventListener('change', event => { showReconMarkers = (event.currentTarget as HTMLInputElement).checked; reconOpen = true; focusSelector = '#recon-markers'; render(); });
  app.querySelector<HTMLSelectElement>('#analysis-metric')?.addEventListener('change', event => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const metric = ANALYSIS_METRICS.find(candidate => candidate === value);
    if (!metric) return;
    analysisMetric = metric; analysisOpen = true; focusSelector = '#analysis-metric'; render();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-recon-x]').forEach(button => button.addEventListener('click', () => {
    const position = { x: Number(button.dataset.reconX), y: Number(button.dataset.reconY) };
    if (!Number.isInteger(position.x) || !Number.isInteger(position.y) || position.x < 0 || position.y < 0 || position.x >= renderedGame.board.width || position.y >= renderedGame.board.height) return;
    focusedPosition = position; centerBoardOnPosition(app, position); refreshFocusedTileViews();
  }));
  app.querySelectorAll<HTMLButtonElement>('[data-preset-action]').forEach(button => button.addEventListener('click', () => {
    if (!screens.briefingOpen || !deploymentBase) return;
    const player = button.dataset.presetPlayer;
    const slot = Number(button.dataset.presetSlot);
    if ((player !== 'red' && player !== 'blue') || (player === 'blue' && matchMode === 'cpu') || !Number.isInteger(slot) || slot < 0 || slot > 2) return;
    const action = button.dataset.presetAction;
    const loaded = loadDeploymentPresets(localStorage);
    if (!loaded.ok) { presetCatalog = undefined; presetNotice = loaded.error; deploymentOpen = true; focusSelector = `#briefing-presets-${player}-reset`; render(); return; }
    presetCatalog = loaded.value;
    if (action === 'apply') {
      const preset = presetCatalog.presets.find(entry => entry.scenarioId === deploymentBase!.id && entry.player === player && entry.slot === slot);
      if (!preset) return;
      const result = applyDeploymentPreset(deploymentBase, player, preset);
      if (result.ok) { deploymentChoices[player] = result.value; presetNotice = `「${preset.name}」を適用しました。`; deploymentNotice = ''; }
      else presetNotice = result.error;
    } else if (action === 'save' || action === 'delete') {
      const name = app.querySelector<HTMLInputElement>(`#briefing-preset-${player}-${slot}-name`)?.value ?? '';
      const result = action === 'save' ? saveDeploymentPreset(localStorage, deploymentBase, player, slot, name, deploymentChoices[player]) : deleteDeploymentPreset(localStorage, deploymentBase.id, player, slot);
      if (result.ok) { presetCatalog = result.value; presetNotice = action === 'save' ? '編成プリセットを保存しました。' : '編成プリセットを削除しました。'; delete presetDraftNames[presetNameKey(player, slot)]; }
      else presetNotice = result.error;
    }
    deploymentOpen = true; focusSelector = action === 'delete' ? `#briefing-preset-${player}-${slot}-save` : `#${button.id}`; render();
  }));
  app.querySelectorAll<HTMLButtonElement>('[data-presets-reset]').forEach(button => button.addEventListener('click', () => {
    if (!window.confirm(translateText('編成プリセットの保存データを初期化しますか？必要なら先にバックアップしてください。'))) return;
    const result = resetDeploymentPresets(localStorage);
    if (result.ok) { presetCatalog = result.value; presetNotice = '編成プリセットを初期化しました。'; presetDraftNames = {}; }
    else presetNotice = result.error;
    deploymentOpen = true; focusSelector = '#briefing-deployment-reset'; render();
  }));
  app.querySelector<HTMLDetailsElement>('#learning-panel')?.addEventListener('toggle', event => { learningOpen = (event.currentTarget as HTMLDetailsElement).open; });
  app.querySelector('#title-training')?.addEventListener('click', () => {
    if (!confirmReplaceMatch()) return;
    titleState.leaveTitle(); campaignRun = undefined; campaignOutcome = undefined; restoreUserSettings(); matchMode = 'cpu'; difficulty = 'easy'; learningOpen = true;
    resetGame('training'); render();
  });
  app.querySelector('#diagnostics-export')?.addEventListener('click', () => downloadJson('ministr-diagnostics.json', diagnosticReport({ persistent: localStorage.persistent, bytes: getStorageUsage(localStorage).bytes, locale: document.documentElement.lang, viewport: { width: window.innerWidth, height: window.innerHeight } })));
  app.querySelector('#storage-reload')?.addEventListener('click', () => { if (window.confirm(translateText('進行中の未保存の操作を破棄して再読み込みしますか？'))) window.location.reload(); });
  app.querySelector('#backup-export')?.addEventListener('click', () => {
    const backup = exportBackup(localStorage);
    if (backup.ok) downloadJson('ministr-backup.json', backup.value); else { message = backup.error; titleState.setNotice(message); render(); }
  });
  app.querySelector<HTMLInputElement>('#backup-import')?.addEventListener('change', async event => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    const request = fileReadGate.begin();
    const expectedGame = game; const expectedRevision = screens.revision;
    const isCurrent = () => fileReadGate.isCurrent(request) && screens.revision === expectedRevision && game === expectedGame;
    if (file.size > MAX_BACKUP_BYTES) { message = 'バックアップが大きすぎます。'; titleState.setNotice(message); render(); return; }
    let text: string;
    try { text = await file.text(); } catch { if (!isCurrent()) return; message = 'バックアップファイルを読み込めませんでした。'; titleState.setNotice(message); render(); return; }
    if (!isCurrent()) return;
    const preview = previewBackup(localStorage, text);
    if (!preview.ok) { message = preview.error; titleState.setNotice(message); render(); return; }
    const details = `${preview.value.entryCount}件の項目、${preview.value.saveCount}件のセーブ`
      + `${preview.value.hasScenarios ? '、カスタムシナリオあり' : ''}${preview.value.hasCampaign ? '、キャンペーン記録あり' : ''}${preview.value.hasDaily ? '、日替わりチャレンジ記録あり（旧版では復元できません）' : ''}`
      + `。復元により現在のアプリ項目${preview.value.removedEntryCount}件が削除されます。内容を完全検証してから書き込みます。`;
    if (!window.confirm(translateText(`バックアップ内容を確認してください。\n\n${translateGameText(details)}\n\n現在のデータを先にバックアップしてください。復元しますか？`))) return;
    if (!isCurrent()) return;
    const restored = restoreBackup(localStorage, preview.value);
    if (restored.ok) {
      loadCustomScenarios(localStorage);
      const restoredRecords = loadOperationRecords(localStorage);
      operationCatalog = restoredRecords.ok ? restoredRecords.value : undefined;
      operationNotice = restoredRecords.ok ? '' : restoredRecords.error;
      operationResultGame = undefined;
      const restoredDaily = loadDailyRecords(localStorage);
      dailyCatalog = restoredDaily.ok ? restoredDaily.value : undefined;
      dailyNotice = restoredDaily.ok ? '' : restoredDaily.error;
      dailyOutcome = undefined; dailyResultGame = game; dailyCopyNotice = '';
      const restoredPresets = loadDeploymentPresets(localStorage);
      presetCatalog = restoredPresets.ok ? restoredPresets.value : undefined;
      presetNotice = restoredPresets.ok ? '' : restoredPresets.error;
      presetDraftNames = {};
      const progress = loadCampaignProgress(localStorage);
      if (progress.ok) campaignProgress = progress.value;
      soundSettings = loadSoundSettings(localStorage); soundPlayer.setSettings(soundSettings); musicSettings = loadMusicSettings(localStorage); musicPlayer.setSettings(musicSettings);
      confirmEndTurnWithUnacted = localStorage.getItem(END_TURN_CONFIRM_KEY) !== 'false';
      document.documentElement.lang = setLocale(localStorage.getItem('ministr.locale') === 'en' ? 'en' : 'ja');
    }
    message = restored.ok ? 'バックアップを復元しました。保存一覧から再開できます。' : restored.error;
    titleState.setNotice(message); render();
  });
  app.querySelectorAll<HTMLSelectElement>('[data-locale]').forEach(select => select.addEventListener('change', () => {
    document.documentElement.lang = setLocale(select.value);
    message = uiText.defaultInstruction;
    focusSelector = select.closest('.title-menu') ? '.title-menu [data-locale]' : '[data-locale]';
    try { localStorage.setItem('ministr.locale', getLocale()); } catch { message = getLocale() === 'en' ? 'Language applies to this tab only.' : '言語はこのタブだけに適用します。'; }
    render();
  }));
  const guardCommand = (action: () => void) => () => { if (canCommand()) action(); };
  const guardMenu = (action: () => void) => () => { if (menuAllowed(matchContext())) action(); };
  // The header is redrawn after every CPU command, so a pointer press may land on
  // a button that is replaced before release and never becomes a click. Acting on
  // pointerdown keeps pause reliable at 4x; keyboard activation arrives as a
  // click with detail 0, and the redraw keeps focus on the button by its id.
  const onRedrawnButton = (selector: string, action: () => void) => {
    const button = app.querySelector<HTMLButtonElement>(selector);
    button?.addEventListener('pointerdown', event => { if (event.button === 0) { event.preventDefault(); action(); } });
    button?.addEventListener('click', event => { if (event.detail === 0) action(); });
  };
  onRedrawnButton('#spectate-toggle', () => { if (spectatePaused) resumeSpectate(); else pauseSpectate(); });
  onRedrawnButton('#spectate-follow', () => {
    if (matchMode !== 'spectate' || replay) return;
    spectateFollow = !spectateFollow;
    pendingBoardCenter = undefined;
    if (spectateFollow) {
      spectateLocatedUnitId = undefined;
      const visible = new Set(shownPositions(game).map(key));
      const position = spectateLastAction && visible.has(key(spectateLastAction)) ? spectateLastAction
        : spectatorUnits(game, visible).find(unit => unit.owner === game.activePlayer)?.position;
      if (position) centerSpectatorOn(position);
    }
    message = spectateFollow ? uiText.spectateFollowOn : uiText.spectateFollowOff;
    render();
  });
  app.querySelector<HTMLSelectElement>('#spectate-locate-unit')?.addEventListener('change', event => {
    if (matchMode !== 'spectate' || replay) return;
    const id = (event.currentTarget as HTMLSelectElement).value;
    const unit = spectatorUnits(game, new Set(shownPositions(game).map(key))).find(unit => unit.id === id);
    if (!unit) return;
    spectateFollow = false;
    spectateLocatedUnitId = unit.id;
    centerSpectatorOn(unit.position);
    message = uiText.spectateLocated(`${sideName('spectate', unit.owner)} ${unitNames[unit.kind]}`);
    render();
  });
  onRedrawnButton('#spectate-whole-board', () => {
    if (matchMode !== 'spectate' || replay) return;
    spectateWholeBoard = !spectateWholeBoard;
    message = spectateWholeBoard ? uiText.spectateWholeBoardOn : uiText.spectateWholeBoardOff;
    render();
  });
  app.querySelector<HTMLButtonElement>('#skip-cpu')?.addEventListener('click', () => {
    if (!cpuSkipAllowed(matchContext())) return;
    cpuSkipRequested = true;
    pendingPresentationEffects = [];
    skipCpuImmediately?.();
  });
  app.querySelector('#open-production')?.addEventListener('click', () => openProductionMenu());
  app.querySelector('#mobile-production')?.addEventListener('click', () => openProductionMenu(undefined, '#mobile-production'));
  app.querySelector('#production-menu-close')?.addEventListener('click', closeProductionMenu);
  app.querySelector('#production-menu-backdrop')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeProductionMenu();
  });
  app.querySelector<HTMLSelectElement>('#production-facility')?.addEventListener('change', event => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const facility = idleProductionFacilities(game, viewer(), selectedMap.productionRules).find(candidate => key(candidate.position) === value);
    if (!facility) return;
    selectedFacility = { ...facility.position };
    focusSelector = '#production-facility';
    render();
  });
  const updateSoundSettings = (next: SoundSettings) => {
    soundSettings = next;
    soundPlayer.setSettings(next);
    if (!saveSoundSettings(localStorage, next)) message = '効果音設定を保存できませんでした。';
  };
  app.querySelector<HTMLInputElement>('#sound-muted')?.addEventListener('change', event => {
    updateSoundSettings({ ...soundSettings, muted: !(event.currentTarget as HTMLInputElement).checked });
  });
  app.querySelector<HTMLInputElement>('#sound-volume')?.addEventListener('input', event => {
    updateSoundSettings({ ...soundSettings, volume: Number((event.currentTarget as HTMLInputElement).value) / 100 });
  });
  const updateMusicSettings = (next: MusicSettings) => {
    musicSettings = next;
    musicPlayer.setSettings(next);
    syncMusicControls(app, next);
    const saved = saveMusicSettings(localStorage, next);
    const notice = saved ? '' : translateText('BGM設定を保存できませんでした。');
    app.querySelectorAll<HTMLElement>('.music-settings-notice').forEach(element => { element.textContent = notice; });
    if (!saved) message = notice;
  };
  for (const prefix of ['music', 'title-music']) {
    app.querySelector<HTMLInputElement>(`#${prefix}-muted`)?.addEventListener('change', event => {
      updateMusicSettings({ ...musicSettings, muted: !(event.currentTarget as HTMLInputElement).checked });
    });
    app.querySelector<HTMLInputElement>(`#${prefix}-army-tracks`)?.addEventListener('change', event => {
      updateMusicSettings({ ...musicSettings, armyTracks: (event.currentTarget as HTMLInputElement).checked });
    });
    for (const suffix of ['track', 'blue-track']) app.querySelector<HTMLSelectElement>(`#${prefix}-${suffix}`)?.addEventListener('change', event => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      const track = FIELD_TRACKS.find(candidate => candidate === value);
      if (track) updateMusicSettings({ ...musicSettings, [suffix === 'track' ? 'fieldTrack' : 'blueFieldTrack']: track });
    });
    app.querySelector<HTMLInputElement>(`#${prefix}-volume`)?.addEventListener('input', event => {
      updateMusicSettings({ ...musicSettings, volume: Number((event.currentTarget as HTMLInputElement).value) / 100 });
    });
  }
  app.querySelector<HTMLDetailsElement>('#terrain-legend')?.addEventListener('toggle', event => { terrainLegendOpen = (event.currentTarget as HTMLDetailsElement).open; });
  const changeBoardZoom = (step: number) => () => {
    const next = boardZoomIndex + step;
    if (next < 0 || next >= BOARD_ZOOM_LEVELS.length) return;
    boardZoomIndex = next;
    boardZoomAuto = false;
    if (matchMode === 'spectate' && !replay) {
      centerSpectatorOn(focusedPosition);
    } else focusSelector = `.tile[data-x="${focusedPosition.x}"][data-y="${focusedPosition.y}"]`;
    render();
  };
  app.querySelector<HTMLButtonElement>('#board-zoom-out')?.addEventListener('click', changeBoardZoom(-1));
  app.querySelector<HTMLButtonElement>('#board-zoom-in')?.addEventListener('click', changeBoardZoom(1));
  app.querySelector<HTMLSelectElement>('#title-board-zoom')?.addEventListener('change', event => {
    if (!screens.titleOpen || replayMode) return;
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === 'auto') {
      boardZoomAuto = true;
      syncBoardZoom(game.board.width);
    } else {
      const next = parseBoardZoomIndex(value);
      if (next !== undefined) {
        boardZoomIndex = next;
        boardZoomAuto = false;
      }
    }
    focusSelector = '#title-board-zoom';
    render();
  });
  document.querySelector<HTMLSelectElement>('#map')!.onchange = guardMenu(() => {
    if (!confirmReplaceMatch()) { render(); return; }
    campaignRun = undefined; campaignOutcome = undefined;
    resetGame(document.querySelector<HTMLSelectElement>('#map')!.value);
    message = '作戦ブリーフィングを確認してください。'; render();
  });
  // Red's CPU is set from the header while paused, or on the briefing before the CPUs start.
  const bindDifficulty = (selector: string, apply: (level: CpuDifficulty) => void, allowed: () => boolean) => {
    const select = app.querySelector<HTMLSelectElement>(selector);
    if (select) select.onchange = () => {
      const level = parseCpuDifficulty(select.value);
      if (level && allowed()) apply(level);
      render();
    };
  };
  const menuOpen = () => menuAllowed(matchContext()) && !dailyLocked();
  bindDifficulty('#difficulty', level => { difficulty = level; }, menuOpen);
  bindDifficulty('#red-difficulty', level => { redDifficulty = level; }, menuOpen);
  bindDifficulty('#briefing-red-difficulty', level => { redDifficulty = level; }, () => screens.briefingOpen && !dailyLocked());
  bindDifficulty('#briefing-blue-difficulty', level => { difficulty = level; }, () => screens.briefingOpen && !dailyLocked());
  for (const selector of ['#cpu-speed', '#title-cpu-speed']) {
    app.querySelector<HTMLSelectElement>(selector)?.addEventListener('change', event => {
      if (replayMode || (selector === '#title-cpu-speed' && !screens.titleOpen)) return;
      const next = parseCommandSpeed((event.currentTarget as HTMLSelectElement).value);
      if (next !== undefined) {
        cpuSpeed = next;
        message = `CPUの行動速度を ${cpuSpeed}x にしました。`;
      }
      focusSelector = selector;
      render();
    });
  }
  document.querySelector<HTMLButtonElement>('#end')!.onclick = guardCommand(endPlayerTurn);
  document.querySelector<HTMLButtonElement>('#board-end-turn')?.addEventListener('click', guardCommand(endPlayerTurn));
  document.querySelector<HTMLButtonElement>('#continue')!.onclick = guardMenu(() => { continueSavedGame(); render(); });
  document.querySelector<HTMLButtonElement>('#save')!.onclick = guardMenu(() => {
    if (manualSaveTarget(matchMode) === 'slot') saveNamedSlot(); else if (!localStorage.getItem(MANUAL_SAVE_KEY) || window.confirm(translateText('手動セーブを上書きしますか？'))) persist(MANUAL_SAVE_KEY);
    render();
  });
  document.querySelector<HTMLButtonElement>('#delete-save')!.onclick = guardMenu(() => { if (!matchSaveDeletionAllowed(matchMode) || !window.confirm(translateText('手動セーブとオートセーブを削除しますか？'))) return; const result = deleteSaves(localStorage); message = result.ok ? 'セーブデータを削除しました。' : result.error; render(); });
  document.querySelector<HTMLButtonElement>('#save-new-slot')?.addEventListener('click', guardMenu(() => { saveNamedSlot(); render(); }));
  app.querySelectorAll<HTMLButtonElement>('.load-save-slot').forEach(button => button.addEventListener('click', () => {
    if (!screens.titleOpen && !menuAllowed(matchContext())) return;
    if (continueSavedGame(button.dataset.saveSlot)) titleState.leaveTitle(); else titleState.setNotice(message);
    render();
  }));
  app.querySelectorAll<HTMLButtonElement>('.delete-save-slot').forEach(button => button.addEventListener('click', () => {
    if ((!screens.titleOpen && !menuAllowed(matchContext())) || !window.confirm(translateText('このセーブを削除しますか？'))) return;
    const id = button.dataset.saveSlot ?? '';
    if (['manual', 'auto'].includes(id) && !matchSaveDeletionAllowed(matchMode)) return;
    const result = deleteSaveSlot(localStorage, id);
    message = result.ok ? 'セーブスロットを削除しました。' : result.error;
    render();
  }));
  document.querySelector<HTMLButtonElement>('#undo')!.onclick = guardCommand(() => {
    if (!undoAllowed(matchMode)) return; const checkpoint = undoStack.pop(); if (checkpoint) { game = checkpoint.state; commandHistory.length = checkpoint.commandCount; selected = undefined; message = '1手戻しました。'; } render(); });
  document.querySelector<HTMLButtonElement>('#open-editor')?.addEventListener('click', guardMenu(() => {
    screens.editorOpen = true; editorNotice = '編集したシナリオはJSONとして書き出せます。'; render();
  }));
  document.querySelector<HTMLButtonElement>('#editor-close')?.addEventListener('click', () => { screens.editorOpen = false; titleState.backToTitleIfOpenedThere(); render(); });
  document.querySelector<HTMLButtonElement>('#open-title')?.addEventListener('click', guardMenu(() => {
    titleState.openFromMatch(); render();
  }));
  bindTitleEvents(app, titleEventDeps);
  if (screens.editorOpen) {
    // Keep the existing compact editor markup while adding the production rule
    // as a real form control. The value is part of the exported scenario data.
    const editorFields = app.querySelector<HTMLElement>('.editor-fields');
    if (editorFields && !editorFields.querySelector('#editor-production-rule')) {
      const label = document.createElement('label');
      label.textContent = translateText('生産ルール');
      const select = document.createElement('select');
      select.id = 'editor-production-rule';
      for (const rule of productionRules) {
        const option = document.createElement('option');
        option.value = rule;
        option.textContent = translateText(rule === 'facility-v2' ? '工場・空港・港湾を分離' : '旧形式（工場で航空機を生産）');
        option.selected = rule === editor.data.productionRules;
        select.append(option);
      }
      label.append(select);
      const victory = editorFields.querySelector('#editor-victory')?.parentElement;
      if (victory) editorFields.insertBefore(label, victory);
      else editorFields.append(label);
    }
    const field = <T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector: string) => app.querySelector<T>(selector)!;
    app.querySelector('#editor-undo')?.addEventListener('click', () => { editor = editorHistory.undo(editor); render(); });
    app.querySelector('#editor-redo')?.addEventListener('click', () => { editor = editorHistory.redo(editor); render(); });
    app.querySelector('#editor-paint')?.addEventListener('change', () => { paintMode = field<HTMLSelectElement>('#editor-paint').value as PaintMode; });
    app.querySelector('#editor-resize')?.addEventListener('click', () => {
      const width = Number(field<HTMLInputElement>('#editor-width').value);
      const height = Number(field<HTMLInputElement>('#editor-height').value);
      if (![width, height].every(value => Number.isSafeInteger(value) && value >= 2 && value <= 32)) {
        editorNotice = '幅・高さは2〜32の整数で入力してください。';
        render();
        return;
      }
      const currentWidth = editor.data.board.width;
      const currentHeight = editor.data.board.height;
      if (width === currentWidth && height === currentHeight) {
        editorNotice = '盤面サイズに変更はありません。';
        render();
        return;
      }
      const shrinking = width < currentWidth || height < currentHeight;
      if (shrinking && !window.confirm(translateText('範囲外の地形と部隊を削除してサイズを変更しますか？元に戻せます。'))) return;
      const cropped = editor.data.victoryConditions.flatMap(condition => condition.type === 'hold' || condition.type === 'control' || isEvacuationCondition(condition)
        ? condition.positions.filter(position => position.x >= width || position.y >= height).map(position => `(${position.x + 1}, ${position.y + 1})`)
        : []);
      commitEditor(resizeEditor(editor, width, height));
      editorNotice = cropped.length ? `盤面外になる保持目標があります: ${cropped.join('、')}。勝利条件を修正してください。` : shrinking ? '盤面を縮小しました。範囲外の地形と部隊は削除されました。' : '盤面サイズを変更しました。';
      render();
    });
    app.querySelector('#editor-theme')?.addEventListener('change', () => { commitEditor({ ...editor, data: { ...editor.data, theme: field<HTMLSelectElement>('#editor-theme').value as ScenarioTheme } }); });
    app.querySelector('#editor-load')?.addEventListener('click', () => {
      const map = scenarioById(field<HTMLSelectElement>('#editor-catalog').value);
      if (map) { commitEditor({ ...editor, data: scenarioDefinitionToData(map) }); render(); }
    });
    app.querySelector('#editor-duplicate')?.addEventListener('click', () => {
      commitEditor({ ...editor, data: { ...structuredClone(editor.data), id: 'copy-' + Date.now().toString(36), name: editor.data.name + ' 複製' } }); render();
    });
    app.querySelector('#editor-delete')?.addEventListener('click', () => {
      const id = field<HTMLSelectElement>('#editor-catalog').value;
      const result = deleteCustomMapWithConfirmation(id);
      if (!result) return;
      editorNotice = result.ok ? 'マップを削除しました。' : result.error; render();
    });
    app.querySelector('#editor-save')?.addEventListener('click', () => {
      if (scenarioById(editor.data.id) && !window.confirm(translateText('同じIDのマップを更新しますか？以前の対局は旧定義で再現されます。'))) return;
      const result = saveCustomScenario(localStorage, editor.data);
      editorNotice = result.ok ? '下書きを保存しました。開始前にプレイ可能性を検証してください。' : result.error; render();
    });
    app.querySelector('#editor-add-objective')?.addEventListener('click', () => {
      if (editor.data.victoryConditions.length >= 32) return;
      commitEditor({ ...editor, data: { ...editor.data, victoryConditions: [...editor.data.victoryConditions, structuredClone(editor.data.victoryConditions[0]!)] } }); render();
    });
    app.querySelector('#editor-remove-objective')?.addEventListener('click', () => {
      if (editor.data.victoryConditions.length <= 1) return;
      commitEditor({ ...editor, data: { ...editor.data, victoryConditions: editor.data.victoryConditions.slice(0, -1) } }); render();
    });
    field<HTMLSelectElement>('#editor-tool').onchange = () => { editor = { ...editor, tool: field<HTMLSelectElement>('#editor-tool').value as ScenarioEditorState['tool'] }; };
    field<HTMLSelectElement>('#editor-terrain').onchange = () => { editor = { ...editor, terrain: field<HTMLSelectElement>('#editor-terrain').value as TerrainKind }; };
    field<HTMLSelectElement>('#editor-owner').onchange = () => { const value = field<HTMLSelectElement>('#editor-owner').value; editor = { ...editor, owner: value === '' ? undefined : value as PlayerId }; };
    field<HTMLSelectElement>('#editor-unit-kind').onchange = () => { editor = { ...editor, unitKind: field<HTMLSelectElement>('#editor-unit-kind').value as UnitKind }; };
    field<HTMLSelectElement>('#editor-unit-owner').onchange = () => { editor = { ...editor, unitOwner: field<HTMLSelectElement>('#editor-unit-owner').value as PlayerId }; };
    for (const selector of ['#editor-id', '#editor-name', '#editor-briefing', '#editor-gold'])
      field<HTMLInputElement | HTMLTextAreaElement>(selector).addEventListener('blur', () => editorHistory.finishGroup());
    field<HTMLInputElement>('#editor-id').oninput = () => { commitEditor({ ...editor, data: { ...editor.data, id: field<HTMLInputElement>('#editor-id').value } }, 'field:id'); };
    field<HTMLInputElement>('#editor-name').oninput = () => { commitEditor({ ...editor, data: { ...editor.data, name: field<HTMLInputElement>('#editor-name').value } }, 'field:name'); };
    field<HTMLTextAreaElement>('#editor-briefing').oninput = () => { commitEditor({ ...editor, data: { ...editor.data, briefing: field<HTMLTextAreaElement>('#editor-briefing').value } }, 'field:briefing'); };
    field<HTMLInputElement>('#editor-gold').oninput = () => { commitEditor({ ...editor, data: { ...editor.data, startingGold: Number(field<HTMLInputElement>('#editor-gold').value) } }, 'field:gold'); };
    field<HTMLSelectElement>('#editor-production-rule').onchange = () => { commitEditor({ ...editor, data: { ...editor.data, productionRules: field<HTMLSelectElement>('#editor-production-rule').value as ProductionRule } }); };
    const updateVictory = () => setEditorVictory(field<HTMLSelectElement>('#editor-victory').value as VictoryCondition['type'], Number(field<HTMLInputElement>('#editor-victory-target').value));
    field<HTMLSelectElement>('#editor-victory').onchange = () => { updateVictory(); render(); };
    app.querySelector<HTMLInputElement>('#editor-victory-units')?.addEventListener('change', updateVictory);
    app.querySelector<HTMLButtonElement>('#editor-use-exit')?.addEventListener('click', () => {
      const condition = editor.data.victoryConditions[0];
      if (condition && isEvacuationCondition(condition)) commitEditor({ ...editor, data: { ...editor.data, victoryConditions: [{ ...condition, positions: [{ ...editor.selected }] }, ...editor.data.victoryConditions.slice(1)] } });
      render();
    });
    field<HTMLInputElement>('#editor-victory-target').oninput = updateVictory;
    app.querySelectorAll<HTMLButtonElement>('.editor-tile').forEach(tile => tile.addEventListener('click', () => {
      commitEditor(paintEditor(editor, { x: Number(tile.dataset.editorX), y: Number(tile.dataset.editorY) }, paintMode));
      editorNotice = '盤面を更新しました。'; render();
    }));
    document.querySelector<HTMLButtonElement>('#editor-export')?.addEventListener('click', () => {
      field<HTMLTextAreaElement>('#editor-json').value = exportScenarioEditorJson(editor);
      editorNotice = 'JSONを書き出しました。';
      const notice = app.querySelector<HTMLElement>('#editor-notice');
      if (notice) { notice.hidden = false; notice.textContent = editorNotice; }
    });
    document.querySelector<HTMLButtonElement>('#editor-import')?.addEventListener('click', () => {
      const imported = importScenarioEditorJson(field<HTMLTextAreaElement>('#editor-json').value, editor);
      if (imported.ok) { commitEditor(imported.value); editorNotice = 'JSONを反映しました。'; }
      else editorNotice = imported.error;
      render();
    });
    document.querySelector<HTMLButtonElement>('#editor-validate')?.addEventListener('click', () => {
      const issues = inspectEditorScenario(editor);
      editorNotice = issues.length ? issues.map(issue => `${issue.severity === 'error' ? 'エラー' : '注意'}: ${translateText(issue.message)}`).join('\n') : '形式とプレイ可能性の検査に成功しました。';
      render();
    });
    document.querySelector<HTMLButtonElement>('#editor-start')?.addEventListener('click', () => {
      const issues = inspectEditorScenario(editor);
      if (issues.some(issue => issue.severity === 'error')) { editorNotice = issues.map(issue => issue.message).join('\n'); render(); return; }
      if (!confirmReplaceMatch()) return;
      if (scenarioById(editor.data.id) && !window.confirm(translateText('保存済みマップを更新して開始しますか？'))) return;
      const saved = saveCustomScenario(localStorage, editor.data);
      if (!saved.ok) { editorNotice = saved.error; render(); return; }
      campaignRun = undefined;
      campaignOutcome = undefined;
      screens.editorOpen = false;
      titleState.clearReturn();
      resetGame(saved.value.id);
      message = 'カスタムシナリオを保存して開始しました。';
      render();
    });
  }
  if (!replayMode) {
    app.querySelectorAll<HTMLButtonElement>('.tile').forEach(tile => {
      const position = { x: Number(tile.dataset.x), y: Number(tile.dataset.y) };
      tile.onclick = () => { focusedPosition = position; act(position); if (!bridgePending?.destination) focusBoardPosition(focusedPosition); };
      tile.onkeydown = event => handleBoardKey(event, position);
      tile.onfocus = () => {
        if (focusedPosition.x === position.x && focusedPosition.y === position.y) return;
        focusedPosition = position;
        refreshFocusedTileViews();
      };
    });
    app.querySelectorAll<HTMLButtonElement>('.unit-queue-item').forEach(button => button.addEventListener('click', guardCommand(() => {
      const unit = game.units.find(candidate => candidate.id === button.dataset.unitId);
      if (!unit || !isDeployedUnit(unit) || unit.owner !== viewer() || unit.hasActed) return;
      selected = unit.id;
      message = `${unitNames[unit.kind]}を選択しました。`;
      focusedPosition = { ...unit.position };
      focusSelector = `.tile[data-x="${unit.position.x}"][data-y="${unit.position.y}"]`;
      render();
    })));
    document.querySelector<HTMLButtonElement>('#next-unit')?.addEventListener('click', guardCommand(selectNextUnactedUnit));
    document.querySelector<HTMLInputElement>('#confirm-end-turn')?.addEventListener('change', event => {
      confirmEndTurnWithUnacted = (event.currentTarget as HTMLInputElement).checked;
      try { localStorage.setItem(END_TURN_CONFIRM_KEY, String(confirmEndTurnWithUnacted)); }
      catch { message = '設定を保存できませんでした。'; render(); return; }
      message = confirmEndTurnWithUnacted ? 'ターン終了時の未行動部隊確認を有効にしました。' : 'ターン終了時の未行動部隊確認を無効にしました。';
      render();
    });
    app.querySelectorAll<HTMLButtonElement>('.produce').forEach(button => button.onclick = guardCommand(() => {
      const kind = button.dataset.kind as UnitKind;
      const facilities = idleProductionFacilities(game, viewer(), selectedMap.productionRules);
      const chosen = selectedFacility && facilities.find(facility => key(facility.position) === key(selectedFacility!));
      const facility = chosen ?? facilities.find(candidate => candidate.kinds.includes(kind));
      if (!facility || !facility.kinds.includes(kind)) {
        message = chosen
          ? `${terrainNames[chosen.kind]} (${chosen.position.x + 1}, ${chosen.position.y + 1}) では${unitNames[kind]}を生産できません。`
          : '生産可能な空き施設がありません。';
        render();
        return;
      }
      if (dispatch({ type: 'produce', factory: { ...facility.position }, kind }, true)) {
        message = `${terrainNames[facility.kind]} (${facility.position.x + 1}, ${facility.position.y + 1}) で${unitNames[kind]}を生産しました。`;
        // The new unit occupies the facility, so the chosen target is spent.
        const remaining = idleProductionFacilities(game, viewer(), selectedMap.productionRules);
        const next = remaining.find(candidate => candidate.kinds.includes(kind)) ?? remaining[0];
        selectedFacility = productionMenuOpen && next ? { ...next.position } : undefined;
      }
      if (productionMenuOpen) productionNotice = message;
      render();
    }));
    document.querySelector<HTMLButtonElement>('#clear-production-facility')?.addEventListener('click', guardCommand(() => {
      selectedFacility = undefined;
      message = '生産先を自動選択に戻しました。';
      render();
    }));
    const captureSelected = guardCommand(() => {
      if (!selected) return;
      if (dispatch({ type: 'capture', unitId: selected }, true)) message = '拠点の占領を進めました。';
      render();
    });
    document.querySelector<HTMLButtonElement>('#capture')?.addEventListener('click', captureSelected);
    const waitSelected = guardCommand(() => {
      if (selected && dispatch({ type: 'wait', unitId: selected }, true)) {
        message = 'ユニットの行動を終了しました。';
        selected = undefined;
      }
      render();
    });
    document.querySelector<HTMLButtonElement>('#wait')?.addEventListener('click', waitSelected);
    document.querySelector<HTMLButtonElement>('#evacuate-unit')?.addEventListener('click', guardCommand(() => {
      if (selected && dispatch({ type: 'evacuate', unitId: selected }, true)) { message = '部隊が脱出地点から撤退しました。'; selected = undefined; }
      render();
    }));
    document.querySelector<HTMLButtonElement>('#mobile-wait')?.addEventListener('click', waitSelected);
    // The fixed bar mirrors existing controls rather than owning any new rule.
    document.querySelector<HTMLButtonElement>('#mobile-capture')?.addEventListener('click', captureSelected);
    document.querySelector<HTMLButtonElement>('#mobile-next-unit')?.addEventListener('click', guardCommand(selectNextUnactedUnit));
    document.querySelector<HTMLButtonElement>('#mobile-end')?.addEventListener('click', guardCommand(endPlayerTurn));
    document.querySelector<HTMLButtonElement>('#mobile-panel')?.addEventListener('click', () => {
      const panel = app.querySelector<HTMLElement>('#command-panel');
      panel?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      panel?.focus({ preventScroll: true });
    });
    app.querySelectorAll<HTMLButtonElement>('.merge').forEach(button => button.addEventListener('click', guardCommand(() => {
      if (selected && dispatch({ type: 'merge', unitId: selected, targetId: button.dataset.targetId! }, true)) {
        message = 'ユニットが合流しました。';
        selected = undefined;
      }
      render();
    })));
    app.querySelectorAll<HTMLButtonElement>('.embark').forEach(button => button.addEventListener('click', guardCommand(() => {
      if (selected && dispatch({ type: 'embark', unitId: selected, transportId: button.dataset.transportId! }, true)) {
        message = 'ユニットを輸送部隊に搭載しました。輸送部隊は次のターンから移動できます。'; selected = undefined;
      }
      render();
    })));
    app.querySelectorAll<HTMLButtonElement>('.disembark').forEach(button => button.addEventListener('click', guardCommand(() => {
      if (selected && dispatch({ type: 'disembark', transportId: selected, destination: { x: Number(button.dataset.x), y: Number(button.dataset.y) } }, true)) {
        message = '搭載ユニットを降車させました。'; selected = undefined;
      }
      render();
    })));
  }
  document.querySelector<HTMLButtonElement>('#restart')?.addEventListener('click', guardMenu(() => {
    if (!confirmReplaceMatch()) return;
    resetGame(selectedMap.id, restartDefinition()); message = 'ユニットを選択して行動してください。'; render();
  }));
  document.querySelector<HTMLButtonElement>('#open-campaign')?.addEventListener('click', guardMenu(openCampaignMenu));
  document.querySelector<HTMLButtonElement>('#open-campaign-briefing')?.addEventListener('click', guardMenu(openCampaignMenu));
  document.querySelector<HTMLButtonElement>('#campaign-close')?.addEventListener('click', () => {
    screens.campaignMenuOpen = false;
    screens.briefingOpen = campaignReturnToBriefing;
    campaignReturnToBriefing = false;
    titleState.backToTitleIfOpenedThere();
    render();
  });
  document.querySelector<HTMLButtonElement>('#campaign-skirmish')?.addEventListener('click', () => {
    if (campaignRun && !confirmReplaceMatch()) return;
    const campaignScenarioId = campaignRun?.scenarioId;
    campaignRun = undefined; campaignOutcome = undefined; screens.campaignMenuOpen = false;
    if (campaignScenarioId) resetGame(campaignScenarioId);
    screens.briefingOpen = campaignScenarioId !== undefined || campaignReturnToBriefing; campaignReturnToBriefing = false;
    message = '単体戦モードに戻りました。戦域を自由に選択できます。';
    titleState.backToTitleIfOpenedThere();
    render();
  });
  app.querySelectorAll<HTMLButtonElement>('.campaign-start').forEach(button => {
    button.addEventListener('click', () => startCampaignScenario(button.dataset.campaignId ?? ''));
  });
  document.querySelector<HTMLButtonElement>('#campaign-retry')?.addEventListener('click', () => {
    if (campaignRun) startCampaignScenario(campaignRun.scenarioId);
  });
  document.querySelector<HTMLButtonElement>('#campaign-next')?.addEventListener('click', () => {
    if (campaignOutcome?.nextScenarioId) startCampaignScenario(campaignOutcome.nextScenarioId);
  });
  document.querySelector<HTMLButtonElement>('#campaign-back')?.addEventListener('click', () => {
    screens.campaignMenuOpen = true;
    campaignReturnToBriefing = false;
    render();
  });
  document.querySelector<HTMLButtonElement>('#view-replay')?.addEventListener('click', guardMenu(() => {
    const created = completedReplay();
    if (!created.ok) { message = created.error; render(); return; }
    beginReplay(created.value);
  }));
  document.querySelector<HTMLButtonElement>('#export-replay')?.addEventListener('click', guardMenu(downloadReplay));
  document.querySelector<HTMLButtonElement>('#import-replay')!.onclick = guardMenu(() => document.querySelector<HTMLInputElement>('#replay-file')!.click());
  document.querySelector<HTMLInputElement>('#replay-file')!.onchange = chooseReplayFile;
  document.querySelector<HTMLButtonElement>('#replay-toggle')?.addEventListener('click', () => {
    if (!replay) return;
    if (replay.playing) {
      replay.playing = false;
      commandScheduler.cancel();
    } else if (replay.file.commands.length > 0) {
      if (replay.index >= replay.file.commands.length) {
        replay.state = { ...structuredClone(replay.file.initialState), scenarioId: replay.file.mapId };
        replay.index = 0;
        message = 'リプレイを最初から再生します。';
      }
      replay.playing = true;
      scheduleReplay();
    }
    render();
  });
  const seekReplay = (index: number) => {
    if (!replay) return;
    const result = replay.timeline.seek(index);
    if (!result.ok) { message = result.error; render(); return; }
    commandScheduler.cancel(); dismissTacticalScene(false); pendingPresentationEffects = [];
    replay.playing = false; replay.state = result.value; replay.index = index; render();
  };
  app.querySelector('#replay-back')?.addEventListener('click', () => { if (replay) seekReplay(replay.index - 1); });
  app.querySelector<HTMLInputElement>('#replay-seek')?.addEventListener('change', event => seekReplay(Number((event.currentTarget as HTMLInputElement).value)));
  app.querySelectorAll<HTMLButtonElement>('.replay-event').forEach(button => button.addEventListener('click', () => seekReplay(Number(button.dataset.index))));
  app.querySelector<HTMLSelectElement>('#replay-viewpoint')?.addEventListener('change', event => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (replay && (value === 'red' || value === 'blue' || value === 'all')) { replay.viewpoint = value; render(); }
  });
  document.querySelector<HTMLButtonElement>('#replay-step')?.addEventListener('click', () => { if (replay && !replay.playing) advanceReplay(); });
  document.querySelector<HTMLSelectElement>('#replay-speed')?.addEventListener('change', event => {
    if (!replay) return;
    replay.speed = Number((event.currentTarget as HTMLSelectElement).value) as ReplayRuntime['speed'];
    if (replay.playing) scheduleReplay();
    render();
  });
  document.querySelector<HTMLButtonElement>('#replay-exit')?.addEventListener('click', leaveReplay);
  app.querySelectorAll<HTMLInputElement>('input[name="match-mode"]').forEach(input => input.addEventListener('change', () => {
    // The format can only change on the briefing, before any command is played.
    if (screens.briefingOpen && commandHistory.length === 0 && !campaignRun && !dailyLocked()) matchMode = parseMatchMode(input.value);
    render();
  }));
  app.querySelectorAll<HTMLButtonElement>('.campaign-veteran-rename').forEach(button => button.addEventListener('click', () => {
    if (!screens.campaignMenuOpen) return;
    const stageId = button.dataset.veteranStage!;
    const index = Number(button.dataset.veteranIndex);
    const input = [...app.querySelectorAll<HTMLInputElement>('input[data-veteran-stage]')].find(control => control.dataset.veteranStage === stageId && Number(control.dataset.veteranIndex) === index);
    const renamed = renameCampaignVeteran(campaignProgress, stageId, index, input?.value.trim() ?? '');
    if (!renamed.ok) { campaignNotice = getLocale() === 'en' ? 'Invalid or duplicate callsign.' : '名前が不正か、同じ名前の部隊があります。'; render(); return; }
    const saved = saveCampaignProgress(localStorage, renamed.value);
    if (saved.ok) campaignProgress = renamed.value;
    campaignNotice = saved.ok ? (getLocale() === 'en' ? 'Callsign saved.' : '部隊名を保存しました。') : saved.error;
    render();
  }));
  app.querySelectorAll<HTMLSelectElement>('[data-army-policy]').forEach(control => control.addEventListener('change', () => {
    const side = control.dataset.armyPolicy;
    if (!screens.briefingOpen || commandHistory.length || dailyLocked() || (game.ruleVersion ?? 0) < 12 || (side !== 'red' && side !== 'blue') || !isArmyPolicy(control.value)) return;
    cpuPolicies = { ...cpuPolicies, [side]: control.value };
    render();
  }));
  app.querySelector<HTMLSelectElement>('#briefing-supply-mode')?.addEventListener('change', event => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (!screens.briefingOpen || commandHistory.length > 0 || campaignRun || dailyLocked() || (value !== 'finite' && value !== 'unlimited')) return;
    finiteSupplies = value === 'finite';
    game = { ...game, ruleVersion: finiteSupplies ? CURRENT_RULE_VERSION : BRIDGE_RULE_VERSION };
    initialState = structuredClone(game);
    focusSelector = '#briefing-supply-mode';
    render();
  });
  app.querySelector<HTMLDetailsElement>('#briefing-deployment')?.addEventListener('toggle', event => { deploymentOpen = (event.currentTarget as HTMLDetailsElement).open; });
  app.querySelectorAll<HTMLSelectElement>('[data-deployment-player]').forEach(control => control.addEventListener('change', () => {
    const player = control.dataset.deploymentPlayer;
    if (player !== 'red' && player !== 'blue') return;
    const slot = Number(control.dataset.deploymentSlot);
    if (!deploymentBase || !Number.isInteger(slot) || slot < 0 || slot >= deploymentChoices[player].length) return;
    const definition = deploymentSlots(deploymentBase, player)[slot];
    if (!definition?.choices.includes(control.value as UnitKind)) return;
    deploymentChoices[player][slot] = control.value as UnitKind;
    deploymentNotice = ''; deploymentOpen = true; focusSelector = `#${control.id}`; render();
  }));
  app.querySelector<HTMLButtonElement>('#briefing-deployment-reset')?.addEventListener('click', () => {
    if (!deploymentBase) return;
    deploymentChoices = { red: deploymentSlots(deploymentBase, 'red').map(slot => slot.kind), blue: deploymentSlots(deploymentBase, 'blue').map(slot => slot.kind) };
    deploymentNotice = ''; deploymentOpen = true; focusSelector = '#briefing-deployment-reset'; render();
  });
  document.querySelector<HTMLButtonElement>('#begin-operation')?.addEventListener('click', () => {
    if (!screens.briefingOpen) return;
    const planned = plannedDeployment();
    if (!planned.ok) { deploymentNotice = planned.error; deploymentOpen = true; render(); return; }
    selectedMap = planned.value;
    game = createScenarioInitialState(selectedMap);
    if (!campaignRun && !finiteSupplies) game = { ...game, ruleVersion: BRIDGE_RULE_VERSION };
    initialState = structuredClone(game);
    screens.briefingOpen = false;
    message = matchMode === 'hotseat' ? `2人対戦を開始しました。${sideName('hotseat', game.activePlayer)}から操作してください。`
      : matchMode === 'spectate' ? uiText.spectateStarted : '作戦を開始しました。ユニットを選択してください。';
    if (cpuShouldRun(matchContext())) runCpu();
    render();
  });
  document.querySelector<HTMLButtonElement>('#handoff-start')?.addEventListener('click', beginHandoffTurn);
  localizeControls(app);
}

function focusBoardPosition(position: Position): void {
  if (productionMenuOpen) return;
  focusedPosition = position;
  focusSelector = `.tile[data-x="${position.x}"][data-y="${position.y}"]`;
  render();
  // Focus before the next keydown, including engines that delay animation frames.
  app.querySelector<HTMLElement>(`.tile[data-x="${position.x}"][data-y="${position.y}"]`)?.focus({ preventScroll: true });
}

function handleBoardKey(event: KeyboardEvent, position: Position): void {
  const next = nextBoardPosition(position, game.board.width, game.board.height, event.key);
  if (next) {
    event.preventDefault();
    focusBoardPosition(next);
    return;
  }
  if (event.key === 'Escape' && bridgePending) { event.preventDefault(); event.stopPropagation(); bridgePending = undefined; focusSelector = '#bridge-unit'; render(); return; }
  if (event.key === 'Escape' && selected) {
    event.preventDefault();
    selected = undefined;
    message = 'ユニットの選択を解除しました。';
    render();
    focusBoardPosition(position);
  }
}

function selectNextUnactedUnit(): void {
  const units = unactedOwnUnits(game, viewer());
  if (!units.length) {
    message = '未行動の自軍ユニットはありません。';
    render();
    return;
  }
  const currentIndex = units.findIndex(unit => unit.id === selected);
  const next = units[(currentIndex + 1 + units.length) % units.length]!;
  selected = next.id;
  message = `${unitNames[next.kind]}を選択しました。未行動部隊は残り ${units.length} 部隊です。`;
  focusedPosition = { ...next.position };
  focusSelector = `.tile[data-x="${next.position.x}"][data-y="${next.position.y}"]`;
  render();
}

function endPlayerTurn(): void {
  const remaining = unactedOwnUnits(game, viewer());
  if (confirmEndTurnWithUnacted && remaining.length > 0 && !window.confirm(translateText(`未行動の自軍ユニットが ${remaining.length} 部隊あります。ターンを終了しますか？`))) return;
  if (dispatch({ type: 'endTurn' })) {
    selected = undefined;
    selectedFacility = undefined;
    undoStack = [];
    if (handoffAfterEndTurn(matchMode, game)) {
      // Hide the previous side's view before anything else is drawn.
      handoffPending = true;
      message = '';
    } else if (cpuShouldRun(matchContext())) runCpu();
  }
  render();
}

/** The next hotseat player has the device: reveal their view, starting at their headquarters. */
function beginHandoffTurn(): void {
  if (!handoffPending) return;
  handoffPending = false;
  selected = undefined;
  selectedFacility = undefined;
  const me = viewer();
  const headquarters = game.board.terrain.flatMap((row, y) => row.map((tile, x) => ({ tile, x, y })))
    .find(({ tile }) => tile.kind === 'capital' && tile.owner === me);
  const firstUnit = game.units.find(unit => unit.owner === me && isDeployedUnit(unit));
  focusedPosition = headquarters ? { x: headquarters.x, y: headquarters.y } : firstUnit?.position ? { ...firstUnit.position } : { x: 0, y: 0 };
  focusSelector = `.tile[data-x="${focusedPosition.x}"][data-y="${focusedPosition.y}"]`;
  message = `${sideName('hotseat', me)}の番です。${turnStartNotice}`;
  turnStartNotice = '';
  if (pendingHandoffActionScene) {
    const scene = pendingHandoffActionScene;
    pendingHandoffActionScene = undefined;
    showTacticalScene(scene);
  }
  render();
}

function act(position: Position): void {
  if (!canCommand()) return;
  if (bridgePending) {
    const error = bridgeError(game, bridgePending.unitId, position);
    if (error) message = error;
    else { bridgePending = { ...bridgePending, destination: position }; focusSelector = '#bridge-confirm'; }
    render(); return;
  }
  if (reconTargeting) {
    const applied = dispatch({ type: 'recon', center: position }, true);
    if (applied) { reconTargeting = false; message = `(${position.x + 1}, ${position.y + 1}) の周辺を、この手番中だけ偵察します。`; }
    render(); return;
  }
  const me = viewer();
  const foe = otherPlayer(me);
  const target = game.units.find(unit => isDeployedUnit(unit) && key(unit.position) === key(position));
  const visible = new Set(visiblePositions(game, me).map(key));
  const facility = idleProductionFacilities(game, me, selectedMap.productionRules).find(candidate => key(candidate.position) === key(position));
  // Any other tap drops a pending production target, so a stale one is never
  // carried into the next order.
  const hadFacilityTarget = selectedFacility !== undefined;
  selectedFacility = undefined;
  if (target?.owner === foe && !visible.has(key(position))) {
    if (!moveSelectedUnit(position)) message = 'その地点へは移動できません。';
  } else if (target?.owner === game.activePlayer) {
    selected = target.id;
    message = `${unitNames[target.kind]}を選択しました。`;
  } else if (target?.owner === foe && selected && selectedUnitIsOwn()) {
    if (dispatch({ type: 'attack', unitId: selected, targetId: target.id, ...(selectedWeaponSlot() === undefined ? {} : { weaponSlot: selectedWeaponSlot() }) }, true)) {
      message = '攻撃しました。';
      selected = undefined;
      weaponSelection = undefined;
    }
  } else if (target?.owner === foe) {
    selected = target.id;
    message = `${unitNames[target.kind]}の移動範囲と攻撃危険域を表示しています。`;
  } else if (selected && selectedUnitIsOwn() && moveSelectedUnit(position)) {
    // A reachable facility is a normal movement destination. Production target
    // selection is intentionally available only while no unit is selected.
  } else if (facility && !selected) {
    openProductionMenu(position, `.tile[data-x="${position.x}"][data-y="${position.y}"]`);
    return;
  } else if (moveSelectedUnit(position)) {
    // The helper sets either the normal movement message or the encounter notice.
  } else if (selected && !selectedUnitIsOwn()) {
    selected = undefined;
    message = '敵ユニットの危険域表示を解除しました。';
  } else if (hadFacilityTarget) {
    message = '生産先の指定を解除しました。';
  }
  render();
}

function selectedUnitIsOwn(): boolean {
  return game.units.some(unit => unit.id === selected && unit.owner === viewer());
}
function moveSelectedUnit(destination: Position): boolean {
  if (!selected || !selectedUnitIsOwn()) return false;
  const unitId = selected;
  if (!dispatch({ type: 'move', unitId, destination }, true)) return false;
  const finalPosition = game.units.find(unit => unit.id === unitId);
  message = !!finalPosition && isDeployedUnit(finalPosition)
    && (finalPosition.position.x !== destination.x || finalPosition.position.y !== destination.y)
    ? '敵部隊を発見し、移動を中断しました。'
    : '移動しました。';
  return true;
}
function finishCpuTurn(side: PlayerId, reachedLimit = false): void {
  // Release the CPU first so a failing endTurn cannot leave it "in progress".
  cpuInProgress = false;
  skipCpuImmediately = undefined;
  resumeCpuStep = undefined;
  commandScheduler.cancel();
  try {
    if (game.activePlayer === side && !game.winner) dispatch({ type: 'endTurn' });
  } finally {
    cpuSkipRequested = false;
  }
  undoStack = [];
  if (matchMode === 'spectate') {
    message = reachedLimit ? 'CPU の行動上限に達したため、ターンを終了しました。' : uiText.spectateTurnEnded(sideName(matchMode, side));
    turnStartNotice = '';
    if (cpuShouldRun(matchContext()) && !spectatePaused) {
      // A short gap between sides keeps the turn change readable.
      if (spectateContinues(game, spectatePauseAtTurn)) runCpu(CPU_STEP_DELAY_MS * 2 / cpuSpeed);
      else { spectatePaused = true; message = uiText.spectateTurnLimit(game.turn); }
    }
    render();
    return;
  }
  message = reachedLimit ? 'CPU の行動上限に達したため、ターンを終了しました。'
    : cpuActivity.length ? uiText.enemyTurnComplete : uiText.enemyTurnUnseen;
  if (turnStartNotice) message += ` ${turnStartNotice}`;
  turnStartNotice = '';
  if (persist(AUTO_SAVE_KEY)) message += ' オートセーブしました。';
  render();
}

/** Stops the spectated CPU loop mid-turn; the unfinished turn resumes from the same board. */
function pauseSpectate(): void {
  if (matchMode !== 'spectate' || spectatePaused || replay) return;
  commandScheduler.cancel();
  cpuInProgress = false;
  cpuSkipRequested = false;
  skipCpuImmediately = undefined;
  spectatePaused = true;
  message = uiText.spectatePaused;
  render();
}
function resumeSpectate(): void {
  if (matchMode !== 'spectate' || !spectatePaused) return;
  spectatePaused = false;
  if (!spectateContinues(game, spectatePauseAtTurn)) spectatePauseAtTurn = game.turn + SPECTATE_TURN_LIMIT;
  message = uiText.spectateResumed;
  if (cpuShouldRun(matchContext())) runCpu();
  render();
}

/** Advance one CPU command per scheduler step so the board remains observable. */
function runCpu(initialDelayMs = 0): void {
  if (cpuInProgress || screens.current !== 'battle' || localStorage.conflicted || !cpuShouldRun(matchContext())) return;
  const side = game.activePlayer;
  cpuInProgress = true;
  if (matchMode === 'cpu') cpuActivity = [];
  const maximumSteps = Math.max(30, game.units.filter(unit => isDeployedUnit(unit) && unit.owner === side).length * 3 + 5);
  let steps = 0;
  const advance = (): boolean => {
    try { return advanceStep(); } catch (error) {
      // An unexpected failure must not leave the CPU permanently "in progress".
      console.error(error);
      finishCpuTurn(side);
      message = 'CPU の行動を安全に終了しました。';
      render();
      return false;
    }
  };
  const advanceStep = (): boolean => {
    if (replay || game.activePlayer !== side || game.winner) { finishCpuTurn(side); return false; }
    if (steps >= maximumSteps) { finishCpuTurn(side, true); return false; }
    steps += 1;
    const action = chooseCpuAction(game, cpuDifficultyFor(matchMode, side, { red: redDifficulty, blue: difficulty }), side, dailyLocked() ? 'balanced' : cpuPolicies[side]);
    if (action.type === 'endTurn') { dispatch(action); finishCpuTurn(side); return false; }
    const before = game;
    if (!dispatch(action)) {
      const unitId = action.type === 'bridge' || action.type === 'fortify' || action.type === 'move' || action.type === 'wait' || action.type === 'evacuate' || action.type === 'attack' || action.type === 'merge' || action.type === 'capture' || action.type === 'embark'
        ? action.unitId : action.type === 'disembark' ? action.transportId : undefined;
      if (!unitId || !dispatch({ type: 'wait', unitId })) {
        message = 'CPU の行動を安全に終了しました。';
        finishCpuTurn(side);
        return false;
      }
    }
    if (matchMode === 'cpu') recordVisibleCpuAction(before, action);
    message = matchMode === 'spectate' ? `${sideName(matchMode, side)}のCPUが行動中です。` : 'CPU が行動中です。';
    if (!cpuSkipRequested) render();
    return true;
  };
  skipCpuImmediately = () => {
    if (!cpuSkipAllowed(matchContext())) return;
    // A scene still on screen would hold the CPU for its whole length; drop it first.
    if (activeTacticalScene) { dismissTacticalScene(false); render(); }
    commandScheduler.start({ initialDelayMs: 0, step: advance, nextDelayMs: () => 0 });
  };
  resumeCpuStep = () => {
    commandScheduler.start({
      initialDelayMs: cpuSkipRequested ? 0 : CPU_STEP_DELAY_MS / cpuSpeed,
      step: advance,
      nextDelayMs: () => activeTacticalScene ? activeTacticalSceneDurationMs + 50 : cpuSkipRequested ? 0 : CPU_STEP_DELAY_MS / cpuSpeed,
    });
  };
  commandScheduler.start({
    initialDelayMs,
    step: advance,
    nextDelayMs: () => activeTacticalScene ? activeTacticalSceneDurationMs + 50 : cpuSkipRequested ? 0 : CPU_STEP_DELAY_MS / cpuSpeed,
  });
}
// Orientation changes and window resizes re-derive the default zoom, but never
// overrule a rate the player set with the zoom controls.
window.addEventListener('storage', event => {
  if (event.key !== null && !event.key.startsWith('ministr.')) return;
  localStorage.markExternalChange();
  commandScheduler.cancel(); cpuInProgress = false; spectatePaused = matchMode === 'spectate';
  message = '別タブの変更を検知しました。バックアップ後に再読み込みしてください。'; titleState.setNotice(message); render();
});
window.addEventListener('resize', () => {
  if (!boardZoomAuto) return;
  const previous = boardZoomIndex;
  syncBoardZoom((replay?.state ?? game).board.width);
  if (boardZoomIndex !== previous) render();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && bridgePending) { event.preventDefault(); bridgePending = undefined; focusSelector = '#bridge-unit'; render(); return; }
  if (event.key === 'Escape' && fortifyPending) { event.preventDefault(); fortifyPending = undefined; focusSelector = '#fortify-unit'; render(); return; }
  if (event.key === 'Escape' && reconTargeting) { event.preventDefault(); reconTargeting = false; message = '偵察を中止しました。'; focusSelector = '#recon-target'; render(); return; }
  if (productionMenuOpen) {
    if (event.key === 'Escape') { event.preventDefault(); closeProductionMenu(); }
    return;
  }
  if (event.key === 'Escape') {
    const close = app.querySelector<HTMLButtonElement>('#editor-close, #campaign-close, #briefing-back-to-title, #share-link-cancel');
    if (close) { event.preventDefault(); close.click(); return; }
    if (replay) { event.preventDefault(); leaveReplay(); return; }
  }
  const target = event.target;
  const editingText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
  if (editingText || event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'n') return;
  if (screens.titleOpen || screens.briefingOpen || screens.campaignMenuOpen || screens.editorOpen || !canCommand()) return;
  event.preventDefault();
  selectNextUnactedUnit();
});

installShareLink(titleState, {
  readHash: () => window.location.hash,
  clearHash: clearShareHash,
  onHashChange: listener => window.addEventListener('hashchange', listener),
}, () => render());
render();
