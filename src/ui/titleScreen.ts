import { maps, operationScenarios, type PlayerId, type ScenarioTheme } from '../game';
import type { ScenarioDefinition } from '../game/maps';
import { operationRevision } from '../game/operationRecords';
import { dailyConditions, dailyDateKey } from '../game/dailyChallenge';
import type { CommandSpeed } from './commandScheduler';
import { renderDailyCard } from './dailyChallenge';
import { localized } from './locale';
import type { MusicSettings } from './music';
import { renderOperationRecords } from './operationsExpansion';
import { renderTitleOverlay } from './overlays';
import { conditionDescription, scenarioDisplayName } from './scenarioText';
import type { ScreenController } from './screenController';
import { renderMapGenerator, type GeneratorForm } from './standaloneSystems';
import { uiText } from './strings';

const themeNames = localized<Record<ScenarioTheme, string>>(
  { temperate: '温帯', desert: '砂漠', snow: '雪原', urban: '市街地', coastal: '沿岸' },
  { temperate: 'Temperate', desert: 'Desert', snow: 'Snowfield', urban: 'Urban', coastal: 'Coastal' },
);

/**
 * Title-screen UI state. Which screen is showing stays with `ScreenController`;
 * everything the title itself remembers between redraws lives here.
 */
export class TitleState {
  /** Opened from a match, so the title offers to return to it unchanged. */
  resumable = false;
  /** Why the last title action (continue, replay import) did not leave the title. */
  notice = '';
  /** A campaign menu, editor, or replay opened from the title returns to it when closed. */
  private returnPending = false;
  /** Whether that title could return to a match, restored along with it. */
  private returnResumable = false;
  readonly generatorForm: GeneratorForm = { size: 20, sea: 'coast', seed: 'MiniStr-1' };
  generatorOpen = false;
  generatorNotice = '';
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
    this.resumable = true;
    this.notice = '';
  }
  /** Shows the title from the briefing, which has no match to return to. */
  openFromBriefing(): void {
    this.screens.briefingOpen = false;
    this.screens.titleOpen = true;
    this.resumable = false;
    this.notice = '';
  }
  leaveTitle(): void {
    this.screens.titleOpen = false;
    this.resumable = false;
    this.notice = '';
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
  state: TitleState;
  titleOpen: boolean;
  replayMode: boolean;
  campaignMenuOpen: boolean;
  editorOpen: boolean;
  scenarios: () => readonly ScenarioDefinition[];
  selectedMapId: string;
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
    // Built only while the title shows; every other redraw skips the map list.
    maps: !titleVisible
      ? []
      : context.scenarios().map((map) => ({
          id: map.id,
          name: scenarioDisplayName(map),
          theme: themeNames[map.theme],
          width: map.board.width,
          height: map.board.height,
          startingGold: map.startingGold,
          turnLimit: map.turnLimit,
          victory:
            map.victoryConditions.map(conditionDescription).join(' / ') +
            (context.operationCatalog?.records.some((record) => record.scenarioId === map.id && record.revision === operationRevision(map)) ? ' ／ クリア記録あり' : ''),
          custom: ![...maps, ...operationScenarios].some((builtIn) => builtIn.id === map.id),
          selected: map.id === context.selectedMapId,
          preview: context.mapPreview(map),
        })),
    cpuSpeed: context.cpuSpeed,
    boardZoom: context.boardZoom,
    musicSettings: context.musicSettings,
    musicOpen: state.musicOpen,
    canContinue: context.canContinue,
    daily: titleVisible
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
    generator: titleVisible
      ? renderMapGenerator(state.generatorForm, state.generatorNotice, state.generatorOpen) +
        renderOperationRecords(context.operationCatalog, context.operationNotice, state.operationRecordsOpen)
      : undefined,
    savePicker: titleVisible ? context.savePicker() : '',
    canResume: state.resumable,
    notice:
      state.notice ||
      (!context.storagePersistent ? 'ブラウザーの保存領域を利用できません。このタブ内だけに保存します。終了前にバックアップしてください。' : '') ||
      (!context.canContinue && context.hasStoredSave() ? uiText.titleInvalidSave : ''),
  });
}
