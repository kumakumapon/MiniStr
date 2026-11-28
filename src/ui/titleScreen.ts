import { DEFAULT_TACTICAL_PRESET, renderTacticalPreset } from './tactics';
import { maps, operationScenarios, type PlayerId, type ScenarioTheme } from '../game';
import type { ScenarioDefinition } from '../game/maps';
import type { GeneratedShare } from '../game/shareLink';
import { learningOperationData } from '../game/learningOperations';
import { operationIds, operationRevision } from '../game/operationRecords';
import { dailyConditions, dailyDateKey } from '../game/dailyChallenge';
import type { CommandSpeed } from './commandScheduler';
import { renderDailyCard } from './dailyChallenge';
import { getLocale, localized } from './locale';
import type { MusicSettings } from './music';
import { renderOperationRecords } from './operationsExpansion';
import { renderTitleOverlay } from './overlays';
import { scenarioDisplayName } from './scenarioText';
import { scenarioConditionDescription, scenarioTiming, timingSummary } from './turnTiming';
import type { ScreenController } from './screenController';
import { renderMapGenerator, type GeneratorForm } from './standaloneSystems';
import { uiText } from './strings';
import type { TitleMapCard } from './overlays';
import { armyCountOptions, multiplayerSize, multiplayerVariant, type ArmyCount, type MultiplayerMap } from './matchVariants';
import { defaultCatalogFilters, type CatalogFormat } from './titleCatalog';

export function multiplayerCatalogFormat(map: MultiplayerMap, preview?: (count: ArmyCount) => string): CatalogFormat {
  const en = getLocale() === 'en';
  const terrain = map === 'strait' || map === 'river' ? 'water' : 'land';
  return {
    armies: armyCountOptions(map),
    ...multiplayerSize(map),
    terrain,
    multiplayer: true,
    preview,
    victory:
      map === 'tundra'
        ? en
          ? 'Keep the defender active through round 15, or eliminate it as the attackers.'
          : '守備軍は第15ラウンドまで生存、攻撃側はそれまでに守備軍を脱落させる。'
        : en
          ? 'Last surviving army or team wins.'
          : '最後まで生き残った軍・チームが勝利。',
    timing: map === 'wide' ? (en ? 'No round limit' : '期限なし') : map === 'tundra' ? (en ? '15 rounds' : '15ラウンド') : en ? 'Short or unlimited' : '短期戦／期限なし',
  };
}

const themeNames = localized<Record<ScenarioTheme, string>>(
  { temperate: '温帯', desert: '砂漠', snow: '雪原', urban: '市街地', coastal: '沿岸' },
  { temperate: 'Temperate', desert: 'Desert', snow: 'Snowfield', urban: 'Urban', coastal: 'Coastal' },
);

/** A valid share link waiting for the player's confirmation; the map is already generated in memory only. */
export interface PendingShare {
  share: GeneratedShare;
  scenario: ScenarioDefinition;
  /** Why the last confirmation did not start the operation, announced inside the dialog. */
  status: string;
}

/**
 * Title-screen UI state. Which screen is showing stays with `ScreenController`;
 * everything the title itself remembers between redraws lives here.
 */
export type TitlePanel = 'home' | 'settings' | 'records';

export class TitleState {
  panel: TitlePanel = 'home';
  /** Opened from a match, so the title offers to return to it unchanged. */
  resumable = false;
  /** Why the last title action (continue, replay import) did not leave the title. */
  notice = '';
  /** A campaign menu, editor, or replay opened from the title returns to it when closed. */
  private returnPending = false;
  /** Whether that title could return to a match, restored along with it. */
  private returnResumable = false;
  readonly generatorForm: GeneratorForm = { size: 20, sea: 'coast', seed: 'MiniStr-1' };
  readonly catalogFilters = defaultCatalogFilters();
  generatorOpen = false;
  generatorNotice = '';
  /** Outcome of the last "copy share link" press, announced beside the button. */
  generatorLinkStatus = '';
  /** The link itself, offered in a read-only field when the clipboard is unavailable. */
  generatorLinkText = '';
  /** A valid link held until it can be confirmed; it is kept, not shown, while another screen is up. */
  pendingShare: PendingShare | undefined;
  /** Title control to refocus once the share confirmation closes ('' for the default). */
  shareReturnFocus: string | undefined;
  /** Why an opened link was refused; shown on the title like any other title notice. */
  shareNotice = '';
  musicOpen = false;
  musicPreviewArmy: PlayerId = 'red';
  dailyRecordsOpen = false;
  operationRecordsOpen = false;

  constructor(private readonly screens: ScreenController) {}

  /** Whether closing the screen opened from the title will show the title again. */
  get returnsToTitle(): boolean {
    return this.returnPending;
  }
  setNotice(text: string): void {
    this.notice = text;
  }
  /** Forgets a pending return, for a match started from the screen that was opened from the title. */
  clearReturn(): void {
    this.returnPending = false;
  }
  /** Shows the title from a match, with a way back to it. */
  openFromMatch(): void {
    this.screens.titleOpen = true;
    this.panel = 'home';
    this.resumable = true;
    this.notice = '';
  }
  /** Shows the title from the briefing, which has no match to return to. */
  openFromBriefing(): void {
    this.screens.briefingOpen = false;
    this.screens.titleOpen = true;
    this.panel = 'home';
    this.resumable = false;
    this.notice = '';
  }
  leaveTitle(): void {
    this.screens.titleOpen = false;
    this.resumable = false;
    this.notice = '';
    this.shareNotice = '';
  }
  /** Closing a screen that was opened from the title shows the title again. */
  backToTitleIfOpenedThere(): void {
    if (!this.returnPending) return;
    this.returnPending = false;
    this.screens.briefingOpen = false;
    this.screens.titleOpen = true;
    this.resumable = this.returnResumable;
    this.returnResumable = false;
  }
  /** Leaves the title for a screen that comes back to it, keeping its way back to the match. */
  leaveTitleAndReturn(): void {
    this.returnResumable = this.resumable;
    this.leaveTitle();
    this.returnPending = true;
  }
}

type OperationCatalog = Parameters<typeof renderOperationRecords>[0];
type DailyCatalog = Parameters<typeof renderDailyCard>[0]['catalog'];

/**
 * Values the title needs from the rest of the app, collected by the caller for
 * one redraw. The functions are the parts that are costly or read storage, so
 * they run only while the title is actually shown.
 */
export interface TitleOverlayContext {
  tacticalPreset?: boolean;
  state: TitleState;
  titleOpen: boolean;
  replayMode: boolean;
  campaignMenuOpen: boolean;
  editorOpen: boolean;
  scenarios: () => readonly ScenarioDefinition[];
  selectedMapId: string;
  canResumeMultiplayer?: boolean;
  multiplayerPreview?: (map: MultiplayerMap, count: ArmyCount) => string;
  multiplayerCards?: () => readonly TitleMapCard[];
  mapPreview: (map: ScenarioDefinition) => string;
  operationCatalog: OperationCatalog;
  operationNotice: string;
  dailyCatalog: DailyCatalog;
  dailyNotice: string;
  dailyClock: () => Date;
  savePicker: () => string;
  cpuSpeed: CommandSpeed;
  boardZoom: { index: number; automatic: boolean };
  musicSettings: MusicSettings;
  battleScenesEnabled?: boolean;
  actionScenesEnabled?: boolean;
  canContinue: boolean;
  storagePersistent: boolean;
  hasStoredSave: () => boolean;
}

/** Title markup, or an empty string while another screen is showing. */
export function buildTitleOverlay(context: TitleOverlayContext): string {
  const { state } = context;
  const titleVisible = context.titleOpen && !context.replayMode && !context.campaignMenuOpen && !context.editorOpen;
  return renderTitleOverlay({
    visible: titleVisible,
    panel: state.panel,
    // Built only while the title shows; every other redraw skips the map list.
    maps:
      !titleVisible || state.panel !== 'home'
        ? []
        : [
            ...context.scenarios().map((map): TitleMapCard => {
              const custom = ![...maps, ...operationScenarios].some((builtIn) => builtIn.id === map.id);
              const variant = multiplayerVariant(map.id);
              const cleared = context.operationCatalog?.records.some((record) => record.scenarioId === map.id && record.revision === operationRevision(map));
              return {
                id: map.id,
                name: scenarioDisplayName(map),
                theme: themeNames[map.theme],
                width: map.board.width,
                height: map.board.height,
                startingGold: map.startingGold,
                rules: map.tacticalOptions ? (getLocale() === 'en' ? 'Combined tactics' : '統合戦術') : getLocale() === 'en' ? 'Basic rules' : '基本規則',
                timing: timingSummary(scenarioTiming(map)),
                victory: map.victoryConditions.map((condition) => scenarioConditionDescription(map, condition, 'red')).join(' / '),
                custom,
                selected: map.id === context.selectedMapId,
                preview: context.mapPreview(map),
                category: custom
                  ? 'custom'
                  : learningOperationData.some((data) => data.id === map.id)
                    ? 'exercise'
                    : operationScenarios.some((data) => data.id === map.id)
                      ? 'mission'
                      : 'battle',
                clear: cleared ? 'cleared' : operationIds.has(map.id) ? 'uncleared' : 'untracked',
                formats: [
                  {
                    armies: [2],
                    width: map.board.width,
                    height: map.board.height,
                    terrain: map.board.terrain.some((row) => row.some((tile) => tile.kind === 'sea')) ? 'water' : 'land',
                  },
                  ...(variant ? [multiplayerCatalogFormat(variant, context.multiplayerPreview && ((count) => context.multiplayerPreview!(variant, count)))] : []),
                ],
              };
            }),
            ...(context.multiplayerCards?.() ?? []),
          ],
    catalogFilters: state.catalogFilters,
    cpuSpeed: context.cpuSpeed,
    boardZoom: context.boardZoom,
    musicSettings: context.musicSettings,
    battleScenesEnabled: context.battleScenesEnabled,
    actionScenesEnabled: context.actionScenesEnabled,
    musicOpen: state.musicOpen,
    canContinue: context.canContinue,
    daily:
      titleVisible && state.panel === 'records'
        ? (() => {
            const today = dailyConditions(dailyDateKey(context.dailyClock()));
            return today.ok
              ? renderDailyCard({
                  conditions: today.value,
                  today: context.dailyCatalog?.records.find((record) => record.date === today.value.date),
                  catalog: context.dailyCatalog,
                  notice: context.dailyNotice,
                  recordsOpen: state.dailyRecordsOpen,
                })
              : '';
          })()
        : undefined,
    tactics: titleVisible && state.panel === 'settings' ? renderTacticalPreset(context.tacticalPreset ?? DEFAULT_TACTICAL_PRESET) : undefined,
    generator: titleVisible
      ? renderMapGenerator(state.generatorForm, state.generatorNotice, state.generatorOpen, { status: state.generatorLinkStatus, text: state.generatorLinkText })
      : undefined,
    operationRecords: titleVisible && state.panel === 'records' ? renderOperationRecords(context.operationCatalog, context.operationNotice, state.operationRecordsOpen) : undefined,
    savePicker: titleVisible && state.panel === 'records' ? context.savePicker() : '',
    canResume: state.resumable,
    canResumeMultiplayer: context.canResumeMultiplayer,
    notice:
      state.notice ||
      state.shareNotice ||
      (!context.storagePersistent ? 'ブラウザーの保存領域を利用できません。このタブ内だけに保存します。終了前にバックアップしてください。' : '') ||
      (!context.canContinue && context.hasStoredSave() ? uiText.titleInvalidSave : ''),
  });
}
