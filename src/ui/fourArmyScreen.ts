import { renderMatchActionBar, renderTurnProgress } from './matchHud';
import type { FourArmyFileResult } from '../game/fourArmySpectatorProtocol';
import { armyCountOptions, classicVariant, multiplayerName, multiplayerSize, renderMatchVariants, type ArmyCount, type MultiplayerMap } from './matchVariants';
import { fourArmyBattleIsVisible } from './fourArmyBattleScene';
import { FourArmyTacticalScene } from './fourArmyTacticalScene';
import { fourArmyActionSceneForCommand, fourArmyActionSceneForViewer } from './fourArmyActionScene';
import type { ActionScene } from './actionScene';
import { loadActionSceneSettings, saveActionSceneSetting, renderActionSceneSetting } from './actionSceneSettings';
import { loadBattleSceneSettings, saveBattleSceneSetting, renderBattleSceneSetting } from './battleSceneSettings';
import type { BattleScene } from './battleScene';
import type { CombatSummary } from '../game/combatSummary';
import { createExpandedBattleMap, latestExpandedBattleLayout } from '../game/expandedBattleMap';
import type { FourArmyControlHistory } from '../game/fourArmyControlHistory';
import { battleWinners, fourArmyParticipants } from '../game/smallBattle';
import { renderLogisticsRoster, bindLogisticsRoster } from './logisticsRoster';
import { supplyRange } from './frontline';
import { weatherAt } from '../game/tactics';
import { fourArmyControllers, fourArmyHumanArmies, normalizeFourArmyControllers, type FourArmyControllers } from '../game/fourArmyControl';
import { fourArmyProductionFacilities, fourArmyProductionOptions, fourArmyReadyUnits } from './fourArmyUiModel';
import { BoardInput } from './boardInput';
import { BoardView } from './boardView';
import { nextBoardPosition } from './boardNavigation';
import { BOARD_ZOOM_LEVELS, boardAreaWidth, boardTileSize, boardZoomPercent, clampBoardZoomIndex, defaultBoardZoomIndex } from './boardZoom';
import { fourArmyBoardCells } from './fourArmyBattleView';
import { fourArmyPlanningView } from '../ai/fourArmyObservation';
import type { ThreatPreview } from '../game/threat';
import { fourArmyMovementKind, fourArmyThreats, renderFourArmyTileInfo } from './fourArmyIntel';
import { editFourArmyMusic, fourArmyMusicPlayback, renderFourArmyMusic } from './fourArmyMusic';
import { loadFourArmyMusic, saveFourArmyMusic, type FourArmyMusicSettings } from '../game/musicSettings';
import type { MusicSettings } from './music';
import { renderTerrainLegend } from './terrainLegend';
import { forecastCombat } from '../game/combat';
import type { WeaponSlot } from '../game/units';
import { renderUnitBrief } from './unitBrief';
import { renderProductionCard, renderUnitActionCluster } from './overlays';
import { fourArmyHumanChoices, type FourArmyHumanChoice, type FourArmyHumanAction } from './fourArmyHuman';
import { unitStats } from '../game/units';
import './fourArmyScreen.css';
import { FOUR_ARMY_CPU_VERSION, FOUR_ARMY_LATEST_CPU_VERSION, type FourArmyCpuVersion } from '../ai/fourArmyCpuVersion';
import type { FourArmyCheckpoint } from '../game/fourArmyArchive';
import { FOUR_ARMY_IDS, type FourArmyId } from '../game/fourArmyFoundation';
import { createFourArmyMap32 } from '../game/fourArmyMap32';
import { createFourArmyState, observeFourArmy, type FourArmyMap, type FourArmyCommand, type FourArmyState, type FourArmyObservation } from '../game/fourArmyEngine';
import { defaultFourArmyCpuSettings, isFourArmyCpuSettings, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import {
  FOUR_ARMY_COMMAND_LIMIT,
  FOUR_ARMY_CHECKPOINT_INTERVAL,
  FOUR_ARMY_FILE_BYTES,
  FOUR_ARMY_SAVE_KEYS,
  fourArmySlotName,
  savedFourArmyControllers,
  isFourArmyView,
  type FourArmySpectatorSave,
  type FourArmyView,
} from '../game/fourArmySpectatorSave';
import { exportBackup } from '../game/backup';
import type { StorageLike } from '../game/session';
import type { Position, GameState } from '../game/types';
import { FourArmyCpuSession } from './fourArmyCpuSession';
import { createFourArmyCpuSession } from './fourArmyCpuBrowser';
import { FourArmyFileCodec } from './fourArmyFileCodec';
import { FourArmyReplay } from './fourArmyReplay';
import { CommandScheduler, COMMAND_SPEEDS, parseCommandSpeed, type CommandSpeed } from './commandScheduler';
import { fourArmyDisplay, type FourArmyDisplay } from './fourArmyBoard';
import { getLocale } from './locale';
import { escapeHtml } from './strings';
import { terrainNames, unitNames } from './labels';
import { downloadJson } from './download';
import { renderStorageWriterNotice, type StorageWriterState } from './storageWriter';
import {
  advanceFourArmyExperience,
  emptyFourArmyExperience,
  initialFourArmyExperience,
  fourArmyExperienceManifest,
  observedFourArmyEvent,
  type FourArmyExperience,
  type FourArmyObservedEvent,
} from '../game/fourArmyExperience';
import { FOUR_ARMY_AUTO_SAVE_KEY } from '../game/fourArmySpectatorSave';
import { FourArmyUndoHistory, canUndoFourArmyCommand } from './fourArmyUndo';
import { FourArmyAutosave } from './fourArmyAutosave';
import { fourArmyEventText, fourArmyEventSound, renderFourArmyHistory, renderFourArmyResult } from './fourArmyExperienceView';
import type { SoundEvent } from './presentationEffects';

const text = (ja: string, en: string) => (getLocale() === 'en' ? en : ja);
export function canReplayFourArmySave(saved: FourArmySpectatorSave): boolean {
  if (saved.archive.payload.state.outcome.type !== 'ongoing') return true;
  if (saved.format === 'ministr-four-army-configurable' && saved.schemaVersion === 6 && saved.controlHistory.events.length > 0) return false;
  const humans = fourArmyHumanArmies(savedFourArmyControllers(saved));
  return humans.length <= 1 || !humans.some((army) => saved.archive.payload.state.alive.includes(army));
}

const armyName = (a: FourArmyId) => text(`第${a.slice(-1)}軍`, `Army ${a.slice(-1)}`);
const options = (values: readonly string[], current: string, names: readonly string[]) =>
  values.map((v, i) => `<option value="${v}" ${v === current ? 'selected' : ''}>${escapeHtml(names[i]!)}</option>`).join('');
interface Dependencies {
  storage: StorageLike;
  persistent: () => boolean;
  writable: () => boolean;
  conflicted: () => boolean;
  writerState: () => StorageWriterState;
  retrySaving: () => void;
  onOpen: () => void;
  allowClassicMap?: (map: string) => boolean;
  onClose: (classicMap?: string) => void;
  onTitle?: () => void;
  onLocale: (locale: 'ja' | 'en') => void;
  onGesture: () => void;
  onMusic?: (settings: MusicSettings) => void;
  titlePresentation?: () => { speed: CommandSpeed; zoomIndex: number; automatic: boolean };
  onSound?: (sound: SoundEvent) => void;
  onBattleSound?: (scene: BattleScene) => (() => void) | undefined;
  createSession?: (state: FourArmyState, settings: FourArmyCpuSettings, cpuVersion: FourArmyCpuVersion, humanArmy?: FourArmyId | FourArmyControllers) => FourArmyCpuSession;
  codec?: FourArmyFileCodec;
  autosaveCodec?: FourArmyFileCodec;
}

/** Separate state owner and DOM surface: no four-army state reaches legacy scores, saves or commands. */
export class FourArmyScreen {
  readonly root = document.createElement('div');
  private session?: FourArmyCpuSession;
  private map?: FourArmyMap;
  private prefix: FourArmyCommand[] = [];
  private replay?: FourArmyReplay;
  private checkpoints: FourArmyCheckpoint[] = [];
  private phase: 'menu' | 'watch' = 'menu';
  private setupMode: 'spectator' | 'human' | 'custom' = 'human';
  private expandedRules = true;
  private tacticalRules = true;
  private setupControllers = fourArmyControllers(['army1', 'army2']);
  private controllers = fourArmyControllers();
  private controlHistory: FourArmyControlHistory = { initial: fourArmyControllers(), events: [] };
  private handoff = false;
  private concealedRendered = false;
  private setupHuman: FourArmyId = 'army1';
  private get humanArmy(): FourArmyId | undefined {
    const humans = fourArmyHumanArmies(this.controllers);
    const state = this.replay?.state ?? this.session?.state;
    const actor = state?.round.order[state.round.index];
    return humans.length === 1 ? humans[0] : actor && humans.includes(actor) ? actor : (humans.find((a) => state?.alive.includes(a)) ?? humans[0]);
  }
  private get rawHumanTurn(): boolean {
    const state = this.session?.state;
    return !!state && !this.replay && !state.paused && state.outcome.type === 'ongoing' && this.controllers[state.round.order[state.round.index]!] === 'human';
  }
  private get concealed(): boolean {
    const state = this.session?.state;
    return (
      this.phase === 'watch' &&
      !this.replay &&
      (this.handoff || fourArmyHumanArmies(this.controllers).length > 1) &&
      !!state &&
      state.outcome.type === 'ongoing' &&
      fourArmyHumanArmies(this.controllers).some((a) => state.alive.includes(a)) &&
      (this.handoff || !this.rawHumanTurn)
    );
  }
  private prepareHandoff(): void {
    this.handoff = fourArmyHumanArmies(this.controllers).length > 1 && this.rawHumanTurn;
    if (this.humanArmy) this.view = this.humanArmy;
  }

  private humanSource?: Position;
  private humanAction?: FourArmyHumanAction;
  private weaponSlot?: WeaponSlot;
  private production?: Position;
  private choicesKey = '';
  private observationCache?: { key: string; observation: FourArmyObservation; projection: GameState };
  private threat?: ThreatPreview;
  private threatKey = '';
  private showThreats = false;
  private music: FourArmyMusicSettings;
  private musicApplied?: { settings: FourArmyMusicSettings; actor?: FourArmyId };
  private boardPointerPending = false;
  private boardModelKey = '';
  private boardView = new BoardView();
  private boardInput = new BoardInput();
  private humanChoices: FourArmyHumanChoice[] = [];
  private settings = defaultFourArmyCpuSettings();
  private cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION;
  private order: FourArmyId[] = [...FOUR_ARMY_IDS];
  private setupMap: MultiplayerMap = 'compact';
  private setupCount: 2 | 3 | 4 = 4;
  private setupParticipants: FourArmyId[] = [...FOUR_ARMY_IDS];
  private setupTeamMode = false;
  private setupTeams: Record<FourArmyId, FourArmyId> = { army1: 'army1', army2: 'army2', army3: 'army1', army4: 'army2' };
  private setupEnding: 'short' | 'unlimited' = 'short';
  private get setupArmies(): readonly FourArmyId[] {
    return this.setupMap === 'wide' ? FOUR_ARMY_IDS : this.setupParticipants;
  }
  private get displayedArmies(): readonly FourArmyId[] {
    return this.phase === 'watch' && this.map ? fourArmyParticipants(this.map) : this.setupArmies;
  }
  private get mapTitle(): string {
    return this.mapName(this.map?.match?.sourceMapId ?? 'wide');
  }
  private mapName(source: MultiplayerMap | 'skirmish'): string {
    return multiplayerName(source === 'skirmish' ? 'compact' : source);
  }
  private seed = '1512';
  private name = '';
  private view: FourArmyView = 'all';
  private speed: CommandSpeed = 1;
  private selected: Position = { x: 3, y: 3 };
  private zoomIndex = 2;
  private automaticZoom = false;
  private cell = boardTileSize(this.zoomIndex);
  private confirmEndTurn = true;
  private mobileMarkup = '';
  private briefMarkup = '';
  private humanMarkup = '';
  private saveButtons: HTMLButtonElement[] = [];
  private settingInputs: HTMLSelectElement[] = [];
  private generation = 0;
  private running = false;
  private busy = false;
  private notice = '';
  private savedSignature = '';
  private verifiedRecord?: { signature: string; text: string };
  private scheduler = new CommandScheduler();
  private codec: FourArmyFileCodec;
  private importMode: 'resume' | 'replay' = 'resume';
  private experience = emptyFourArmyExperience();
  private experienceRevision = 0;
  private recordRevision = 0;
  private historyMarkupKey = '';
  private resultMarkup = '';
  private undoHistory = new FourArmyUndoHistory();
  private autosave: FourArmyAutosave;
  private autoTurn?: string;
  private autoSnapshot?: FourArmySpectatorSave;
  private battleScenesEnabled = true;
  private battlePreferenceSaved = true;
  private tacticalScene: FourArmyTacticalScene;
  private actionScenesEnabled = true;
  private actionPreferenceSaved = true;
  private queuedAction?: ActionScene;
  private handoffAction?: ActionScene;
  private feedback?: FourArmyObservedEvent;
  private feedbackTimer?: ReturnType<typeof setTimeout>;
  constructor(private deps: Dependencies) {
    this.music = loadFourArmyMusic(deps.storage);
    window.addEventListener('resize', () => this.resizeBoard());
    this.battleScenesEnabled = loadBattleSceneSettings(deps.storage).multiArmy;
    this.actionScenesEnabled = loadActionSceneSettings(deps.storage).multiArmy;
    this.tacticalScene = new FourArmyTacticalScene(this.root, {
      pause: () => this.pause(text('一時停止しました。', 'Paused.')),
      menu: () => {
        this.pause(undefined, false);
        this.phase = 'menu';
        this.shell();
      },
      disable: (kind) => (kind === 'battle' ? this.setBattleScenes(false) : this.setActionScenes(false)),
      sound: deps.onBattleSound,
    });
    this.codec = deps.codec ?? new FourArmyFileCodec();
    this.autosave = new FourArmyAutosave(
      deps.storage,
      () => deps.writable() && !deps.conflicted(),
      () => this.paintAutosave(),
      deps.autosaveCodec,
    );
    this.root.className = 'four-screen';
    this.root.id = 'four-army-screen';
    this.root.setAttribute('role', 'main');
    this.root.setAttribute('aria-labelledby', 'four-heading');
    this.root.hidden = true;
    document.body.append(this.root);
    this.root.addEventListener('click', (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>('button');
      if (button && !button.disabled) {
        this.deps.onGesture();
        void this.click(button);
      }
    });
    this.root.addEventListener('change', (e) => {
      void this.change(e.target as HTMLInputElement);
    });
    this.root.addEventListener('input', (e) => {
      const v = e.target as HTMLInputElement;
      if (v.id === 'four-music-volume') {
        this.changeMusic(v);
        return;
      }
      if (v.id === 'four-confirm-end') return;
      if (v.id === 'four-name') this.name = v.value;
      else if (v.id === 'four-seed') this.seed = v.value;
    });
    this.root.addEventListener('keydown', (e) => this.key(e));
    this.root.addEventListener(
      'pointerdown',
      (e) => {
        this.boardPointerPending = !!(e.target as Element).closest('#four-board > button.tile');
      },
      true,
    );
    this.root.addEventListener('pointerup', () => {
      this.boardPointerPending = false;
    });
    this.root.addEventListener('pointercancel', () => {
      this.boardPointerPending = false;
      this.paint();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.active) this.pause(text('画面を離れたため一時停止しました。', 'Paused while the page is in the background.'));
    });
    window.addEventListener('pagehide', () => {
      if (this.active) this.pause();
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
  private query<T extends Element = HTMLElement>(selector: string): T | null {
    if (/^#[a-zA-Z0-9-]+$/.test(selector)) {
      const element = document.getElementById(selector.slice(1));
      if (element && this.root.contains(element)) return element as unknown as T;
    }
    return this.root.querySelector<T>(selector);
  }
  get active(): boolean {
    return !this.root.hidden;
  }
  private get count(): number {
    return this.prefix.length + (this.session?.commandCount ?? 0);
  }
  private signature(): string {
    return [this.recordRevision, this.count, this.name, JSON.stringify(this.settings), JSON.stringify(this.controllers), this.view, this.speed].join('|');
  }
  private get dirty(): boolean {
    return !!this.session && this.signature() !== this.savedSignature;
  }
  open(setup?: { map: MultiplayerMap; count: ArmyCount; mode?: 'cpu' | 'spectate' | 'hotseat' }): void {
    if (setup) {
      this.setupMap = setup.map;
      this.setArmyCount(setup.count);
      if (setup.mode) {
        this.setupMode = setup.mode === 'spectate' ? 'spectator' : setup.mode === 'hotseat' ? 'custom' : 'human';
        if (setup.mode === 'hotseat') this.setupControllers = fourArmyControllers(['army1', 'army2']);
      }
    }
    if (this.battlePreferenceSaved) this.battleScenesEnabled = loadBattleSceneSettings(this.deps.storage).multiArmy;
    if (this.actionPreferenceSaved) this.actionScenesEnabled = loadActionSceneSettings(this.deps.storage).multiArmy;
    this.deps.onOpen();
    this.root.hidden = false;
    this.phase = 'menu';
    this.notice = '';
    this.shell();
  }
  restoreMusicSettings(): void {
    this.music = loadFourArmyMusic(this.deps.storage);
    if (this.active) this.shell();
  }
  refreshStorage(): void {
    if (this.deps.conflicted())
      this.pause(text('別タブで保存が変更されました。書き出してから再読み込みしてください。', 'Saved data changed in another tab. Export before reloading.'));
    else this.paint();
  }
  private get humanTurn(): boolean {
    return this.rawHumanTurn && !this.handoff && !this.tacticalScene.active;
  }
  private get lockedView(): boolean {
    const state = this.session?.state;
    return !!state && state.outcome.type === 'ongoing' && fourArmyHumanArmies(this.controllers).some((a) => state.alive.includes(a));
  }
  private clearHuman(): void {
    this.humanSource = undefined;
    this.humanAction = undefined;
    this.humanChoices = [];
    this.choicesKey = '';
    this.threat = undefined;
    this.threatKey = '';
    this.weaponSlot = undefined;
    this.closeProduction(false);
  }
  private pause(message?: string, redraw = true, keepHandoff = false): void {
    this.queuedAction = undefined;
    if (!keepHandoff) this.handoffAction = undefined;
    this.tacticalScene.dismiss(false);
    this.clearFeedback();
    this.clearHuman();
    this.generation++;
    this.scheduler.cancel();
    this.codec.cancel();
    this.replay?.cancel();
    this.session?.pause();
    this.running = false;
    this.busy = false;
    if (message !== undefined) this.notice = message;
    if (this.active && redraw) this.paint();
  }
  private replaceAllowed(): boolean {
    return (
      !this.dirty ||
      window.confirm(text('未保存の4軍対局を置き換えますか？必要な記録は先に保存・書き出ししてください。', 'Replace the unsaved four-army match? Save or export the record first.'))
    );
  }
  private leave(classicMap?: string): void {
    this.pause();
    if (!this.replaceAllowed()) return;
    this.autosave.cancel();
    this.autoSnapshot = undefined;
    this.undoHistory.clear();
    this.experience = emptyFourArmyExperience();
    this.session?.stop();
    this.session = undefined;
    this.replay = undefined;
    this.map = undefined;
    this.observationCache = undefined;
    this.prefix = [];
    this.checkpoints = [];
    this.verifiedRecord = undefined;
    this.boardInput.update(null);
    this.boardView.update(null, [], 'four-army');
    this.root.replaceChildren();
    this.savedSignature = '';
    this.autoTurn = undefined;
    this.root.hidden = true;
    this.musicApplied = undefined;
    this.deps.onClose(classicMap);
  }
  private participantForm(): string {
    return `<fieldset><legend>${text('参加軍（2〜4軍）', 'Participants (2–4)')}</legend>${FOUR_ARMY_IDS.map((a) => `<label><input type="checkbox" id="four-active-${a}" data-active-army="${a}" ${this.setupArmies.includes(a) ? 'checked' : ''}>${armyName(a)}</label>`).join('')}<label><input id="four-team-mode" type="checkbox" ${this.setupTeamMode ? 'checked' : ''}>${text('固定チーム戦', 'Fixed teams')}</label>${this.setupTeamMode ? this.setupArmies.map((a) => `<label>${armyName(a)}<select data-team="${a}">${options(FOUR_ARMY_IDS, this.setupTeams[a], ['A', 'B', 'C', 'D'])}</select></label>`).join('') : ''}<p class="four-hint">${text('不参加軍は配置・手番・収入なし。チームは2組以上。味方の通常視界を共有し、資金・施設補給・部隊操作・偵察は軍別です。', 'Inactive armies have no units, turns or income. Use at least two teams. Allies share ordinary vision; funds, facility service, controls and reconnaissance stay army-specific.')}</p></fieldset>`;
  }
  private liveControllerForm(): string {
    if (!this.session || this.replay || this.session.state.outcome.type !== 'ongoing') return '';
    return `<details><summary>${text('操作担当を変更', 'Change controllers')}</summary><p>${text('変更時にCPUを停止します。残り行動を引き継ぎ、変更履歴を保存します。', 'Changing pauses CPUs. Remaining actions and the switch history are preserved.')}</p>${fourArmyParticipants(
      this.session.state,
    )
      .filter((a) => this.session!.state.alive.includes(a))
      .map(
        (a) =>
          `<label>${armyName(a)}<select data-live-controller="${a}" ${this.deps.conflicted() || this.controlHistory.events.length >= 256 ? 'disabled' : ''}>${options(['human', 'cpu'], this.controllers[a], [text('人間', 'Human'), 'CPU'])}</select></label>`,
      )
      .join('')}</details>`;
  }
  private switchController(army: FourArmyId, value: string): void {
    if (
      !this.session ||
      !this.map ||
      this.replay ||
      this.deps.conflicted() ||
      !this.session.state.alive.includes(army) ||
      this.session.state.outcome.type !== 'ongoing' ||
      !['human', 'cpu'].includes(value) ||
      value === this.controllers[army] ||
      this.controlHistory.events.length >= 256
    )
      return;
    this.pause();
    const controls = { ...this.controllers, [army]: value } as FourArmyControllers;
    const history = structuredClone(this.controlHistory);
    history.events.push({ at: this.count, army, from: this.controllers[army], to: value as 'human' | 'cpu' });
    this.install(this.map, this.session.state, [...this.prefix, ...this.session.commands], this.checkpoints, this.cpuVersion, controls, {
      experience: this.experience,
      controlHistory: history,
    });
    this.clearHuman();
    this.view = this.humanArmy ?? 'all';
    this.handoff = !!this.humanArmy && this.rawHumanTurn;
    this.notice = text('操作担当を変更しました。残り行動を引き継ぎます。', 'Controller changed. Remaining actions are preserved.');
    this.autoTurn = undefined;
    this.shell();
    this.autoSnapshot = this.snapshot();
    void this.autosave.write(this.autoSnapshot);
  }
  get canReturnFromTitle(): boolean {
    return !this.active && !!this.session;
  }

  resumeFromTitle(): void {
    if (!this.canReturnFromTitle) return;
    this.openMatch();
  }

  private openMatch(): void {
    if (!this.active) {
      this.deps.onOpen();
      this.root.hidden = false;
    }
    this.phase = 'watch';
    this.shell();
  }

  private suspend(): void {
    this.pause(undefined, false);
    this.concealedRendered = false;
    this.boardInput.update(null);
    this.boardView.update(null, [], 'four-army');
    this.root.replaceChildren();
    this.root.hidden = true;
    this.musicApplied = undefined;
  }

  private returnToTitle(): void {
    if (!this.deps.onTitle) return;
    this.suspend();
    this.deps.onTitle();
  }

  private setArmyCount(count: ArmyCount): void {
    this.setupCount = count;
    this.setupParticipants = FOUR_ARMY_IDS.slice(0, count);
    this.order = [...this.setupArmies];
    if (!this.setupArmies.includes(this.setupHuman)) this.setupHuman = this.setupArmies[0]!;
  }

  private setupMatchControllers(): FourArmyControllers {
    if (this.setupMode === 'custom') return fourArmyControllers(this.setupArmies.filter((army) => this.setupControllers[army] === 'human'));
    return fourArmyControllers(this.setupMode === 'human' ? [this.setupHuman] : []);
  }
  private rejectSetup(message: string): void {
    this.notice = message;
    const details = this.query<HTMLDetailsElement>('#four-setup-options');
    if (details) details.open = true;
    this.paint();
  }
  private start(): void {
    if (!/^\d{1,10}$/.test(this.seed) || Number(this.seed) > 0xffffffff) {
      this.rejectSetup(text('seedは0〜4294967295の整数を入力してください。', 'Enter an integer seed from 0 to 4294967295.'));
      return;
    }
    const teams = this.setupMap !== 'wide' && this.setupTeamMode ? this.setupTeams : undefined;
    if (teams && new Set(this.setupArmies.map((army) => teams[army])).size < 2) {
      this.rejectSetup(text('参加軍を2組以上のチームに分けてください。', 'Assign participating armies to at least two teams.'));
      return;
    }
    const rules = this.expandedRules ? { version: 1 as const, tactics: this.tacticalRules } : undefined;
    const made =
      this.setupMap === 'wide'
        ? createFourArmyMap32(Number(this.seed), this.order, 1, rules)
        : createExpandedBattleMap({
            sourceMapId: this.setupMap === 'compact' ? 'skirmish' : this.setupMap,
            layoutVersion: latestExpandedBattleLayout(this.setupMap === 'compact' ? 'skirmish' : this.setupMap, this.setupArmies.length),
            participants: this.setupArmies,
            seed: Number(this.seed),
            order: this.order,
            ending: this.setupEnding,
            rules,
            teams,
          });
    if (!made.ok) {
      this.rejectSetup(text(`手番には参加${this.setupArmies.length}軍を1回ずつ指定してください。`, 'Use each army exactly once in the turn order.'));
      return;
    }
    if (!this.replaceAllowed()) return;
    const state = createFourArmyState(made.value);
    if (!state.ok) {
      this.notice = state.error;
      this.paint();
      return;
    }
    this.install(made.value, state.value, [], [], FOUR_ARMY_LATEST_CPU_VERSION, this.setupMatchControllers());
    this.view = this.humanArmy ?? 'all';
    const presentation = this.deps.titlePresentation?.();
    this.speed = presentation?.speed ?? 1;
    this.automaticZoom = presentation?.automatic ?? false;
    this.setZoom(this.automaticZoom ? defaultBoardZoomIndex(boardAreaWidth(window.innerWidth), state.value.board.width) : (presentation?.zoomIndex ?? 2));
    this.name = this.mapTitle;
    this.savedSignature = '';
    this.autoTurn = undefined;
    this.notice = this.humanTurn
      ? text('あなたの手番です。自軍の部隊または施設を選択してください。', 'Your turn. Select your unit or facility.')
      : text('CPUは停止中です。CPU進行または1手進めるを選んでください。', 'CPUs are paused. Choose Run CPUs or Step.');
    this.shell();
    if (this.map?.match) this.locate();
    if (fourArmyHumanArmies(this.controllers).length > 0 && !this.rawHumanTurn) void this.play();
  }
  private install(
    map: FourArmyMap,
    state: FourArmyState,
    commands: readonly FourArmyCommand[],
    checkpoints: FourArmyCheckpoint[] = [],
    cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION,
    humanArmy?: FourArmyId | FourArmyControllers,
    support?: { controlHistory?: FourArmyControlHistory; experience?: FourArmyExperience; keepUndo?: boolean; keepAutosave?: boolean },
  ): void {
    this.pause(undefined, false);
    this.boardModelKey = '';
    this.session?.stop();
    if (!support?.keepUndo) this.undoHistory.clear();
    if (!support?.keepAutosave) {
      this.autosave.cancel();
      this.autoSnapshot = undefined;
    }
    this.map = structuredClone(map);
    this.observationCache = undefined;
    this.prefix = structuredClone([...commands]);
    this.checkpoints = checkpoints;
    this.verifiedRecord = undefined;
    this.replay = undefined;
    this.cpuVersion = cpuVersion;
    this.controllers = normalizeFourArmyControllers(humanArmy);
    this.controlHistory = structuredClone(support?.controlHistory ?? { initial: this.controllers, events: [] });
    this.session = this.deps.createSession?.(state, this.settings, cpuVersion, humanArmy) ?? createFourArmyCpuSession(state, this.settings, cpuVersion, humanArmy);
    this.recordRevision++;
    this.experience = structuredClone(support?.experience ?? initialFourArmyExperience(state, this.count));
    if (support?.experience) {
      const current = initialFourArmyExperience(state, this.count);
      for (const army of FOUR_ARMY_IDS) {
        const contacts = new Map(this.experience.sightings[army].map((r) => [r.unitId, r]));
        for (const r of current.sightings[army]) contacts.set(r.unitId, r);
        this.experience.sightings[army] = [...contacts.values()].sort((a, b) => b.at - a.at || (a.unitId < b.unitId ? -1 : 1)).slice(0, 128);
      }
    }
    this.experienceRevision++;
    this.historyMarkupKey = '';
    this.resultMarkup = '';
    if (!support?.keepAutosave) this.autoTurn = this.turnKey(state);
    const session = this.session;
    session.onCommit = (before, command, after, combat) => {
      if (this.session !== session) return;
      this.recordRevision++;
      this.experience = advanceFourArmyExperience(this.experience, before, command, after, this.count);
      this.experienceRevision++;
      if (this.controllers[command.actor] === 'cpu' || command.type === 'endTurn' || command.type === 'resume') this.undoHistory.clear();
      const actor = after.round.order[after.round.index]!;
      if (
        after.outcome.type === 'ongoing' &&
        fourArmyHumanArmies(this.controllers).length > 1 &&
        this.controllers[actor] === 'human' &&
        (actor !== command.actor || before.round.round !== after.round.round)
      ) {
        this.handoff = true;
        this.view = actor;
        this.clearHuman();
      }
      this.presentScenes(combat, before, command, after);
      const event = observedFourArmyEvent(before, command, after, this.view, this.count);
      if (event) this.presentFeedback(event);
    };
    this.phase = 'watch';
    this.selected = { ...map.capitals[this.humanArmy ?? fourArmyParticipants(map)[0]!] };
    this.prepareHandoff();
  }
  private async play(): Promise<void> {
    if (!this.session || this.deps.conflicted()) return;
    if (this.running || this.busy) {
      this.pause(text('一時停止しました。', 'Paused.'));
      return;
    }
    if (this.replay?.position === this.replay?.commands.length && this.replay) return;
    if (!this.replay && (this.rawHumanTurn || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session.state.outcome.type !== 'ongoing')) return;
    this.pause(undefined, false);
    const generation = this.generation;
    this.running = true;
    this.notice = '';
    if (!this.replay) {
      this.session.resume();
      this.captureCheckpoint();
    }
    if (this.tacticalScene.active) {
      this.paint();
      while (this.tacticalScene.active) {
        await this.tacticalScene.finished();
        if (generation !== this.generation) return;
      }
    }
    if (this.rawHumanTurn) {
      this.prepareHandoff();
      this.pause(undefined, true, true);
      return;
    }
    this.scheduler.start({ initialDelayMs: 450 / this.speed, nextDelayMs: () => 450 / this.speed, step: () => this.advance(generation) });
    this.paint();
  }
  private async advance(generation: number): Promise<boolean> {
    if (generation !== this.generation || !this.session) return false;
    const humanWasAlive = fourArmyHumanArmies(this.controllers).some((a) => this.session!.state.alive.includes(a));
    this.busy = true;
    this.paintControls();
    try {
      if (this.replay) {
        const before = this.replay.state,
          command = this.replay.commands[this.replay.position];
        await this.replay.seek(this.replay.position + 1);
        if (generation === this.generation && command) {
          this.presentScenes(this.replay.lastCombat, before, command, this.replay.state);
          const event = observedFourArmyEvent(before, command, this.replay.state, this.view, this.replay.position);
          if (event) this.presentFeedback(event);
        }
      } else if (this.count < FOUR_ARMY_COMMAND_LIMIT) await this.session.step();
      if (generation !== this.generation) return false;
      if (!this.replay) this.captureCheckpoint();
      this.busy = false;
      while (this.tacticalScene.active) {
        this.paint();
        await this.tacticalScene.finished();
        if (generation !== this.generation) return false;
      }
      const state = this.replay?.state ?? this.session.state;
      if (!this.replay && humanWasAlive && !fourArmyHumanArmies(this.controllers).some((a) => state.alive.includes(a)))
        this.pause(text('自軍が脱落しました。残りの対局を観戦できます。', 'Your army was eliminated. You can watch the remaining match.'));
      else if (this.rawHumanTurn) {
        this.prepareHandoff();
        this.pause(undefined, true, true);
      } else if (this.replay && this.replay.position === this.replay.commands.length) this.pause(text('リプレイの終端です。', 'End of replay.'));
      else if (!this.replay && state.paused)
        this.pause(text('100ラウンドの区切りで停止しました。CPU進行で次の手番を開始します。', 'Paused at the 100-round boundary. Run CPUs starts the next turn.'));
      else if (!this.replay && state.outcome.type !== 'ongoing')
        this.pause(text('対局は終了しました。記録を保存・再生できます。', 'The match has ended. You can save or replay the record.'));
      else if (!this.replay && this.count >= FOUR_ARMY_COMMAND_LIMIT)
        this.pause(text('記録の上限に達しました。保存・書き出しで記録を保持できます。', 'The record limit was reached. Save or export to keep the record.'));
      this.paint();
      return this.running;
    } catch {
      if (generation === this.generation)
        this.pause(text('CPUの処理に失敗したため停止しました。CPU進行で再試行できます。', 'CPU processing failed. Paused; choose Run CPUs to retry.'));
      return false;
    }
  }
  private async step(): Promise<void> {
    if (!this.session || this.deps.conflicted()) return;
    this.pause();
    if (this.replay) {
      if (this.replay.position < this.replay.commands.length) await this.seek(this.replay.position + 1);
      return;
    }
    if (this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session.state.outcome.type !== 'ongoing') return;
    this.session.resume();
    this.captureCheckpoint();
    if (this.rawHumanTurn) {
      this.prepareHandoff();
      this.pause();
      return;
    }
    const generation = this.generation;
    await this.advance(generation);
    if (generation === this.generation) this.session.pause();
  }
  private async seek(position: number): Promise<void> {
    if (!this.replay) return;
    const before = this.replay.state,
      previous = this.replay.position,
      command = this.replay.commands[previous];
    this.pause(undefined, false);
    const generation = this.generation;
    this.busy = true;
    this.paintControls();
    try {
      await this.replay.seek(position);
      if (generation === this.generation) {
        this.busy = false;
        if (position === previous + 1 && command) {
          this.presentScenes(this.replay.lastCombat, before, command, this.replay.state);
          const event = observedFourArmyEvent(before, command, this.replay.state, this.view, position);
          if (event) this.presentFeedback(event);
        }
        this.paint();
      }
    } catch {
      if (generation === this.generation) this.pause(text('リプレイを再現できませんでした。', 'The replay could not be reconstructed.'));
    }
  }
  private snapshot(): FourArmySpectatorSave {
    if (!this.session || !this.map) throw Error('No four-army match');
    return {
      format: 'ministr-four-army-configurable',
      controllers: structuredClone(this.controllers),
      schemaVersion: ['four-army-cpu-v6', FOUR_ARMY_LATEST_CPU_VERSION].includes(this.cpuVersion) || this.controlHistory.events.length > 0 ? 6 : this.map.match ? 5 : 4,
      ...(['four-army-cpu-v6', FOUR_ARMY_LATEST_CPU_VERSION].includes(this.cpuVersion) || this.controlHistory.events.length > 0
        ? { controlHistory: structuredClone(this.controlHistory) }
        : {}),
      experience: fourArmyExperienceManifest(this.experience),
      cpuVersion: this.cpuVersion,
      name: this.name.trim() || text('四方の前線', 'Four Fronts'),
      savedAt: new Date().toISOString(),
      settings: structuredClone(this.settings),
      view: this.view,
      speed: this.speed,
      archive: {
        format: 'ministr-four-army-save',
        schemaVersion: this.session.state.engineVersion,
        ruleset:
          this.session.state.engineVersion === 1
            ? 'four-army-v1'
            : this.session.state.engineVersion === 2
              ? 'four-army-v2'
              : this.session.state.engineVersion === 3
                ? 'four-army-v3'
                : this.session.state.engineVersion === 4
                  ? 'four-army-v4'
                  : 'four-army-v5',
        payload: { map: this.map, commands: [...this.prefix, ...this.session.commands], state: this.session.state },
      },
    } as FourArmySpectatorSave;
  }
  private captureCheckpoint(): void {
    if (this.session && this.count > 0 && this.count % FOUR_ARMY_CHECKPOINT_INTERVAL === 0 && this.checkpoints.at(-1)?.position !== this.count)
      this.checkpoints.push({ position: this.count, state: this.session.state });
  }
  private turnKey(state: FourArmyState): string {
    return `${state.round.round}:${state.round.index}:${state.round.order[state.round.index]}`;
  }
  private ensureAutosave(): void {
    if (!this.active || this.phase !== 'watch' || this.replay || !this.session || !this.rawHumanTurn) return;
    const turn = this.turnKey(this.session.state);
    if (turn === this.autoTurn) return;
    this.autoTurn = turn;
    this.autoSnapshot = this.snapshot();
    void this.autosave.write(this.autoSnapshot);
  }
  private paintAutosave(): void {
    const root = this.query('#four-auto-status');
    if (!root) return;
    let raw: string | null;
    try {
      raw = this.deps.storage.getItem(FOUR_ARMY_AUTO_SAVE_KEY);
    } catch {
      root.textContent = text('自動保存領域を読み出せません。', 'Autosave storage is unavailable.');
      return;
    }
    const messages = {
      idle: raw === null ? text('自動保存はまだありません。', 'No autosave yet.') : text('自動保存あり（読込時に検証）。', 'Autosave available; verified when loaded.'),
      saving: text('手番開始の状態を自動保存中…操作は続けられます。', 'Saving the turn-start position… You may continue playing.'),
      saved: raw === null ? text('自動保存は削除済みです。', 'Autosave deleted.') : text('人間軍の手番開始を自動保存しました。', 'Human turn-start position autosaved.'),
      'blocked-original': text(
        '元の自動保存を確認できず、上書きを止めています。原本を書き出して確認してください。',
        'Existing autosave could not be verified and was kept. Export its original before reviewing it.',
      ),
      'blocked-writer': text('このタブでは自動保存できません。書込権を確認するかJSONを書き出してください。', 'This tab cannot autosave. Check write access or export JSON.'),
      conflict: text('自動保存が別の場所で更新されたため、上書きを止めました。', 'Autosave changed elsewhere and was not overwritten.'),
      failed: text(
        '自動保存できませんでした。既存の保存は保持しています。容量・書込権を確認してください。',
        'Autosave failed; existing saves are unchanged. Check capacity and write access.',
      ),
    };
    root.textContent = messages[this.autosave.status];
    for (const id of ['four-auto-load', 'four-auto-export', 'four-auto-delete']) {
      const button = this.query<HTMLButtonElement>('#' + id);
      if (button) button.disabled = raw === null || (id === 'four-auto-delete' && (!this.deps.writable() || this.deps.conflicted()));
    }
    const retry = this.query<HTMLButtonElement>('#four-auto-retry');
    if (retry) {
      retry.hidden = !this.autoSnapshot || ['idle', 'saving', 'saved', 'blocked-original'].includes(this.autosave.status);
      retry.disabled = !this.deps.writable() || this.deps.conflicted();
    }
  }
  private setBattleScenes(enabled: boolean): void {
    this.battleScenesEnabled = enabled;
    this.battlePreferenceSaved = saveBattleSceneSetting(this.deps.storage, 'multiArmy', enabled);
    if (!enabled && this.tacticalScene.kind === 'battle') this.tacticalScene.dismiss();
    if (!this.battlePreferenceSaved) {
      this.notice = text('バトルシーン設定はこの画面だけに適用します。保存領域を確認してください。', 'Battle scene preference applies to this screen only. Check storage.');
      const notice = this.query('#four-notice');
      if (notice) notice.textContent = this.notice;
    }
    this.root.querySelectorAll<HTMLInputElement>('[data-battle-scenes="multiArmy"]').forEach((input) => {
      input.checked = enabled;
    });
  }
  private setActionScenes(enabled: boolean): void {
    this.actionScenesEnabled = enabled;
    this.actionPreferenceSaved = saveActionSceneSetting(this.deps.storage, 'multiArmy', enabled);
    if (!enabled) {
      this.queuedAction = undefined;
      this.handoffAction = undefined;
      if (this.tacticalScene.kind === 'action') this.tacticalScene.dismiss();
    }
    if (!this.actionPreferenceSaved) {
      this.notice = text(
        '占領・補給演出の設定はこの画面だけに適用します。保存領域を確認してください。',
        'Capture and supply preference applies to this screen only. Check storage.',
      );
      const notice = this.query('#four-notice');
      if (notice) notice.textContent = this.notice;
    }
    this.root.querySelectorAll<HTMLInputElement>('[data-action-scenes="multiArmy"]').forEach((input) => {
      input.checked = enabled;
    });
  }
  private showAction(scene: ActionScene): void {
    if (this.actionScenesEnabled && this.active && this.phase === 'watch' && !this.concealed && !document.hidden) this.tacticalScene.show(scene, this.running);
  }
  private presentScenes(combat: CombatSummary<FourArmyId> | undefined, before: FourArmyState, command: FourArmyCommand, after: FourArmyState): void {
    if (!this.active || this.phase !== 'watch' || document.hidden) return;
    const resolved = this.actionScenesEnabled ? fourArmyActionSceneForCommand(before, command, after) : undefined;
    const action = resolved ? fourArmyActionSceneForViewer(resolved, before, after, this.view) : undefined;
    if (this.concealed) {
      if (this.handoff && action?.kind === 'logistics') this.handoffAction = action;
      return;
    }
    this.presentBattle(combat, before, after);
    if (!action) return;
    if (!this.tacticalScene.active) this.showAction(action);
    else {
      const generation = this.generation;
      this.queuedAction = action;
      void this.tacticalScene.finished().then(() => {
        if (generation !== this.generation) return;
        const next = this.queuedAction;
        this.queuedAction = undefined;
        if (next) this.showAction(next);
      });
    }
  }
  private presentBattle(combat: CombatSummary<FourArmyId> | undefined, before: FourArmyState, after: FourArmyState): void {
    if (
      !combat ||
      !this.battleScenesEnabled ||
      !this.active ||
      this.phase !== 'watch' ||
      this.concealed ||
      document.hidden ||
      !fourArmyBattleIsVisible(combat, before, after, this.view)
    )
      return;
    this.tacticalScene.show(combat, this.running);
  }
  private clearFeedback(): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = undefined;
    this.feedback = undefined;
    this.root.querySelectorAll('.four-action-focus').forEach((tile) => tile.classList.remove('four-action-focus'));
    const status = this.query('#four-action-feedback');
    if (status) status.textContent = '';
  }
  private presentFeedback(event: FourArmyObservedEvent): void {
    const sound = fourArmyEventSound(event);
    if (!sound || !this.active || this.phase !== 'watch' || this.concealed || document.hidden) return;
    this.clearFeedback();
    this.feedback = event;
    if (this.tacticalScene.kind !== 'battle') this.deps.onSound?.(sound);
    this.feedbackTimer = setTimeout(() => this.clearFeedback(), 650);
  }
  private paintSupport(state: FourArmyState): void {
    const position = this.replay?.position ?? this.count;
    const key = `${this.experienceRevision}:${this.view}:${getLocale()}:${position}`;
    if (this.historyMarkupKey !== key) {
      const markup = renderFourArmyHistory(this.experience, this.view, position);
      const contacts = this.query('#four-sightings'),
        events = this.query('#four-events');
      if (contacts) contacts.innerHTML = markup.contacts;
      if (events) events.innerHTML = markup.events;
      this.historyMarkupKey = key;
    }
    const undo = this.query<HTMLButtonElement>('#four-undo');
    const undoHost = this.query<HTMLElement>('#four-undo-controls');
    if (undoHost)
      undoHost.hidden =
        !!this.replay || fourArmyHumanArmies(this.controllers).length !== 1 || state.outcome.type !== 'ongoing' || !this.humanArmy || !state.alive.includes(this.humanArmy);
    if (undo) {
      undo.disabled = !this.humanTurn || this.busy || !this.undoHistory.length || this.deps.conflicted();
      undo.textContent = text('1手戻す', 'Undo one command') + ` (${this.undoHistory.length})`;
    }
    const result = renderFourArmyResult(state, this.controllers, position, !!this.replay, this.deps.conflicted());
    const resultRoot = this.query('#four-result-host');
    if (resultRoot && result !== this.resultMarkup) {
      resultRoot.innerHTML = result;
      this.resultMarkup = result;
      if (result && !this.replay) this.query<HTMLElement>('#four-result-title')?.focus({ preventScroll: true });
    }
    const status = this.query('#four-action-feedback');
    if (status) status.textContent = this.feedback ? fourArmyEventText(this.feedback) : '';
    const target = this.feedback?.to ?? this.feedback?.from;
    if (target) this.query(`#four-board > button[data-x="${target.x}"][data-y="${target.y}"]`)?.classList.add('four-action-focus');
    this.paintAutosave();
    this.ensureAutosave();
  }
  private undo(): void {
    if (!this.humanTurn || this.replay || !this.session || !this.map || this.busy || this.deps.conflicted() || fourArmyHumanArmies(this.controllers).length !== 1) return;
    const entry = this.undoHistory.pop();
    if (!entry) return;
    const commands = [...this.prefix, ...this.session.commands];
    const command = commands[entry.position];
    const unitId = command && 'unitId' in command ? command.unitId : undefined;
    const unit = entry.state.units.find((u) => u.id === unitId);
    const selected = unit?.position ?? this.selected,
      zoom = this.zoomIndex;
    this.install(
      this.map,
      entry.state,
      commands.slice(0, entry.position),
      this.checkpoints.filter((p) => p.position <= entry.position),
      this.cpuVersion,
      this.controllers,
      { experience: entry.experience, keepUndo: true, controlHistory: this.controlHistory, keepAutosave: true },
    );
    this.zoomIndex = zoom;
    this.cell = boardTileSize(zoom);
    this.selected = { ...selected };
    if (unit?.position) this.humanSource = { ...unit.position };
    this.notice = text('1手戻しました。情報取得・戦闘・CPU進行をまたいでは戻せません。', 'One command undone. Undo cannot cross discoveries, combat or CPU progress.');
    this.shell();
    this.locate();
  }
  private rematch(): void {
    if (!this.session || !this.map || this.replay || this.session.state.outcome.type === 'ongoing' || this.deps.conflicted() || !this.replaceAllowed()) return;
    const made = createFourArmyState(this.map);
    if (!made.ok) {
      this.notice = made.error;
      this.paint();
      return;
    }
    this.install(this.map, made.value, [], [], this.cpuVersion, this.controllers);
    this.view = this.humanArmy ?? 'all';
    this.savedSignature = '';
    this.autoTurn = undefined;
    this.notice = text('同じ条件で新しい対局を開始しました。', 'Started a new match with the same conditions.');
    this.shell();
    if (fourArmyHumanArmies(this.controllers).length && !this.rawHumanTurn) void this.play();
  }
  private verificationProgress(done: number, total: number): void {
    this.notice = text('履歴を検証中', 'Verifying history') + ` ${done.toLocaleString()}/${total.toLocaleString()}`;
    const notice = this.query('#four-notice');
    if (notice) notice.textContent = this.notice;
  }
  private async save(slot?: number): Promise<void> {
    if (!this.session) return;
    this.pause();
    if (slot !== undefined && (!this.deps.writable() || this.deps.conflicted())) {
      this.notice = text('このタブでは保存できません。JSONを書き出してください。', 'Saving is unavailable in this tab. Export JSON instead.');
      this.paint();
      return;
    }
    if (slot !== undefined) {
      try {
        if (this.deps.storage.getItem(FOUR_ARMY_SAVE_KEYS[slot]!) !== null && !window.confirm(text('この4軍保存を上書きしますか？', 'Overwrite this four-army save?'))) return;
      } catch {
        this.notice = text('保存領域を読み出せません。', 'Saved data could not be read.');
        this.paint();
        return;
      }
    }
    const generation = this.generation;
    this.busy = true;
    this.notice = text('保存内容を確認しています…', 'Checking the saved record…');
    this.paint();
    const signature = this.signature();
    let encoded: string;
    if (this.verifiedRecord?.signature === signature) {
      encoded = this.verifiedRecord.text;
      this.busy = false;
    } else {
      const result = await this.codec.run(this.snapshot(), (done, total) => this.verificationProgress(done, total));
      if (generation !== this.generation || !result) return;
      this.busy = false;
      if (!result.ok) {
        this.notice = text('保存できませんでした。記録と既存の保存は保持しています。', 'Could not save. The record and existing saves are unchanged.') + ' ' + result.error;
        this.paint();
        return;
      }
      encoded = result.value.text;
      this.checkpoints = result.value.checkpoints;
      this.verifiedRecord = { signature, text: encoded };
    }
    try {
      if (slot === undefined) downloadJson('ministr-four-army.json', encoded);
      else {
        if (!this.deps.writable() || this.deps.conflicted()) throw Error('Four-army writer ownership changed');
        this.deps.storage.setItem(FOUR_ARMY_SAVE_KEYS[slot]!, encoded);
        this.savedSignature = this.signature();
      }
      this.notice = slot === undefined ? text('JSONを書き出しました。', 'JSON exported.') : text('4軍専用枠へ保存しました。', 'Saved to the four-army slot.');
    } catch {
      this.notice = text('保存容量または書込権限を確認してください。既存の保存は保持しています。', 'Check storage capacity or write access. Existing saves are unchanged.');
    }
    this.paint();
    this.slots();
  }
  private async load(textValue: string, mode: 'resume' | 'replay'): Promise<void> {
    this.pause(undefined, false);
    const generation = this.generation;
    this.busy = true;
    this.notice = text('記録を検証しています…', 'Verifying the record…');
    this.paint();
    const result = await this.codec.run(textValue, (done, total) => this.verificationProgress(done, total));
    if (generation !== this.generation || !result) return;
    this.busy = false;
    if (!result.ok) {
      this.notice = text('読み込めませんでした。現在の対局と保存は保持しています。', 'Could not load. The current match and saved data are unchanged.') + ' ' + result.error;
      this.paint();
      return;
    }
    const error = this.openVerifiedRecord(result.value, mode);
    if (error) {
      this.notice = error;
      this.paint();
    }
  }

  /** The caller has verified the record with FourArmyFileCodec. An error leaves the live match intact. */
  openVerifiedRecord(record: FourArmyFileResult, mode: 'resume' | 'replay'): string | undefined {
    const saved = record.save;
    if (mode === 'replay' && !canReplayFourArmySave(saved)) {
      return text(
        '進行中の複数人対局は再生できません。「対局を読込」で再開してください。現在の対局と保存は保持しています。',
        'An ongoing local multiplayer match cannot be replayed. Import as a match to resume. The current match and saves are unchanged.',
      );
    }
    if (!this.replaceAllowed()) return text('読み込みをキャンセルしました。', 'Loading cancelled.');
    this.pause(undefined, false);
    const incomingControllers = savedFourArmyControllers(saved);
    this.settings = structuredClone(saved.settings);
    this.speed = saved.speed;
    this.automaticZoom = false;
    this.setZoom(2);
    this.name = saved.name;
    this.seed = String(saved.archive.payload.map.seed);
    this.order = [...saved.archive.payload.map.order];
    const match = saved.archive.payload.map.match;
    this.setupParticipants = [...fourArmyParticipants(saved.archive.payload.map)];
    this.setupCount = this.setupParticipants.length as 2 | 3 | 4;
    this.setupMap = match?.version === 2 ? (match.sourceMapId === 'skirmish' ? 'compact' : match.sourceMapId) : match ? 'compact' : 'wide';
    this.setupEnding = match?.ending ?? 'unlimited';
    this.setupTeamMode = match?.version === 2 && new Set(Object.values(match.teams)).size < match.participants.length;
    if (match?.version === 2) this.setupTeams = { ...this.setupTeams, ...match.teams };

    this.expandedRules = !!saved.archive.payload.map.rules;
    this.tacticalRules = saved.archive.payload.map.rules?.tactics ?? false;
    this.install(saved.archive.payload.map, saved.archive.payload.state, saved.archive.payload.commands, record.checkpoints, saved.cpuVersion, incomingControllers, {
      experience: record.experience,
      controlHistory: saved.format === 'ministr-four-army-configurable' && saved.schemaVersion === 6 ? saved.controlHistory : undefined,
    });
    this.view = saved.view;
    this.prepareHandoff();
    this.setupMode = 'custom';
    this.setupControllers = structuredClone(this.controllers);
    this.setupHuman = this.humanArmy ?? 'army1';
    this.savedSignature = this.signature();
    if (mode === 'replay') this.replay = new FourArmyReplay(this.map!, [...this.prefix], this.checkpoints);
    this.notice = text('停止状態で読み込みました。', 'Loaded and paused.');
    this.openMatch();
    return undefined;
  }
  private async file(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.pause();
    const generation = this.generation,
      mode = this.importMode;
    if (file.size > FOUR_ARMY_FILE_BYTES) {
      this.notice = text('ファイルは8MB以内にしてください。', 'Choose a file no larger than 8MB.');
      this.paint();
      return;
    }
    try {
      const raw = await file.text();
      if (generation === this.generation && this.active) await this.load(raw, mode);
    } catch {
      if (generation === this.generation) {
        this.notice = text('ファイルを読み出せません。', 'The file could not be read.');
        this.paint();
      }
    }
  }
  private async click(button: HTMLButtonElement): Promise<void> {
    const id = button.id;
    if (id === 'four-undo') {
      this.undo();
      return;
    }
    if (id === 'four-rematch') {
      this.rematch();
      return;
    }
    if (button.dataset.fourSighting) {
      const [x, y] = button.dataset.fourSighting.split(',').map(Number);
      if (Number.isInteger(x) && Number.isInteger(y) && x! >= 0 && y! >= 0 && x! < (this.map?.board.width ?? 0) && y! < (this.map?.board.height ?? 0)) {
        this.clearHuman();
        this.selected = { x: x!, y: y! };
        this.notice = text('最終目撃地点を表示しています。現在の敵位置とは限りません。', 'Showing the last sighting; this may not be the current enemy position.');
        this.paint();
        this.locate();
      }
      return;
    }
    if (id === 'four-auto-retry') {
      if (this.autoSnapshot) await this.autosave.write(this.autoSnapshot);
      return;
    }
    if (id === 'four-auto-load' || id === 'four-auto-export' || id === 'four-auto-delete') {
      this.pause();
      this.autosave.cancel();
      try {
        const raw = this.deps.storage.getItem(FOUR_ARMY_AUTO_SAVE_KEY);
        if (raw === null) return;
        if (id === 'four-auto-load') await this.load(raw, 'resume');
        else if (id === 'four-auto-export') downloadJson('ministr-four-army-autosave-original.json', raw);
        else if (
          this.deps.writable() &&
          !this.deps.conflicted() &&
          window.confirm(text('4軍の自動保存だけを削除しますか？手動保存2枠は保持します。', 'Delete only the four-army autosave? Both manual slots are kept.'))
        ) {
          if (!this.deps.writable() || this.deps.conflicted() || this.deps.storage.getItem(FOUR_ARMY_AUTO_SAVE_KEY) !== raw)
            this.notice = text('確認中に自動保存か書込権が変わったため、削除を止めました。', 'Autosave or write access changed during confirmation; deletion was cancelled.');
          else {
            this.deps.storage.removeItem(FOUR_ARMY_AUTO_SAVE_KEY);
            this.autosave.reset();
          }
        }
      } catch {
        this.notice = text('自動保存を読み出し・変更できません。原本は保持しています。', 'Autosave could not be read or changed. Its original is kept.');
      }
      this.paint();
      this.paintAutosave();
      return;
    }
    if (id === 'four-recon' && this.humanTurn) {
      this.clearHuman();
      this.humanAction = 'recon';
      this.notice = text('偵察地点を選択してください。Escで取消。', 'Choose a recon center. Esc cancels.');
      this.paint();
      this.focusTile();
      return;
    }
    if (id === 'four-handoff-start') {
      if (!this.rawHumanTurn || this.deps.conflicted()) return;
      this.handoff = false;
      this.concealedRendered = false;
      this.clearHuman();
      if (this.humanArmy && this.map) this.selected = { ...this.map.capitals[this.humanArmy] };
      this.shell();
      const action = this.handoffAction;
      this.handoffAction = undefined;
      if (action) this.showAction(action);
      return;
    }
    if (button.dataset.forecastTarget && this.session && this.humanArmy) {
      const o = observeFourArmy(this.session.state, this.humanArmy);
      const target = o.ok ? o.value.units.find((u) => u.id === button.dataset.forecastTarget) : undefined;
      if (target?.position) {
        this.selected = { ...target.position };
        this.paint();
        this.focusTile();
      }
      return;
    }
    if (button.dataset.fourUnit && this.humanTurn && this.session) {
      const unit = this.session.state.units.find((u) => u.id === button.dataset.fourUnit && u.owner === this.humanArmy && u.position);
      if (unit?.position) {
        this.clearHuman();
        this.selected = { ...unit.position };
        this.humanSource = { ...unit.position };
        this.paint();
        this.locate();
      }
      return;
    }
    if (button.dataset.productionKind && this.production && this.session && this.humanArmy) {
      const observed = observeFourArmy(this.session.state, this.humanArmy);
      if (observed.ok) {
        const choice = fourArmyHumanChoices(observed.value, this.production).find((c) => c.command.type === 'produce' && c.command.kind === button.dataset.productionKind);
        if (choice) {
          const before = this.count;
          await this.applyHuman(choice);
          if (this.count > before && this.humanTurn) this.openProduction();
        }
      }
      return;
    }
    if (id === 'four-production-close') {
      this.closeProduction();
      return;
    }
    if (id === 'four-next-unit' || id === 'four-mobile-next') {
      this.nextUnit();
      return;
    }
    if (id === 'four-mobile-panel') {
      this.query<HTMLElement>('#four-command-panel')?.focus();
      return;
    }
    if (id === 'four-open-production' || id === 'four-mobile-production') {
      this.openProduction();
      return;
    }
    if (button.dataset.quickAction) {
      const choice = this.humanChoices.find((c) => c.action === button.dataset.quickAction);
      if (choice) await this.applyHuman(choice);
      return;
    }
    if (id === 'four-human-cancel') {
      this.clearHuman();
      this.paint();
      return;
    }
    if (id === 'four-human-watch') {
      this.view = 'all';
      this.paint();
      await this.play();
      return;
    }
    if (button.dataset.humanChoice !== undefined) {
      if (!this.humanTurn || this.busy || this.deps.conflicted()) return;
      const choice = this.humanChoices[Number(button.dataset.humanChoice)];
      if (!choice) return;
      if (choice.target) {
        this.humanAction = choice.action;
        this.paint();
      } else await this.applyHuman(choice);
      return;
    }
    if (id === 'four-title') {
      this.returnToTitle();
      return;
    }
    if (id === 'four-close') {
      this.leave();
      return;
    }
    if (id === 'four-start') {
      this.start();
      return;
    }
    if (id === 'four-setup-confirm') {
      this.query<HTMLDetailsElement>('#four-setup-options')!.open = false;
      this.query<HTMLButtonElement>('#four-start')?.focus();
      return;
    }
    if (id === 'four-return' && this.session) {
      this.pause(undefined, false);
      this.phase = 'watch';
      this.shell();
      return;
    }
    if (id === 'four-menu') {
      this.pause(undefined, false);
      this.replay = undefined;
      this.phase = 'menu';
      this.shell();
      return;
    }
    if (id === 'four-toggle' || id === 'four-mobile-toggle') {
      await this.play();
      return;
    }
    if (id === 'four-step') {
      await this.step();
      return;
    }
    if (id === 'four-upgrade-cpu' && this.session && this.map && !this.replay && this.cpuVersion !== FOUR_ARMY_LATEST_CPU_VERSION) {
      this.pause();
      this.install(this.map, this.session.state, [...this.prefix, ...this.session.commands], this.checkpoints, FOUR_ARMY_LATEST_CPU_VERSION, this.controllers, {
        experience: this.experience,
        controlHistory: this.controlHistory,
      });
      this.savedSignature = '';
      this.notice = text(
        '履歴を保持して改善版CPUへ切り替えました。停止状態です。保存すると切替後の判断を使います。',
        'Switched to the improved CPU, retaining the record. Paused; saving preserves the new CPU choice.',
      );
      this.shell();
      return;
    }
    if (id === 'four-replay' && this.session && this.map) {
      if ((fourArmyHumanArmies(this.controllers).length > 1 || this.controlHistory.events.length > 0) && this.session.state.outcome.type === 'ongoing') {
        this.notice = text('対局中の複数人操作では再生できません。', 'Replay is available after the local match ends.');
        this.paint();
        return;
      }
      this.pause();
      // Applied live commands and imported prefixes are already verified. Reuse their snapshots.
      this.replay = new FourArmyReplay(this.map, [...this.prefix, ...this.session.commands], this.checkpoints);
      this.shell();
      return;
    }
    if (id === 'four-replay-close') {
      this.pause();
      this.replay = undefined;
      this.shell();
      return;
    }
    if (id === 'four-previous' && this.replay) {
      await this.seek(Math.max(0, this.replay.position - 1));
      return;
    }
    if (id === 'four-replay-start') {
      await this.seek(0);
      return;
    }
    if (id === 'four-replay-end' && this.replay) {
      await this.seek(this.replay.commands.length);
      return;
    }
    if (id === 'four-export' || id === 'four-result-export' || button.hasAttribute('data-storage-write-export')) {
      await this.save();
      return;
    }
    if (id === 'four-import' || id === 'four-import-replay') {
      this.pause();
      this.importMode = id === 'four-import' ? 'resume' : 'replay';
      this.query<HTMLInputElement>('#four-file')!.click();
      return;
    }
    if (id === 'four-backup') {
      const backup = exportBackup(this.deps.storage);
      if (backup.ok) downloadJson('ministr-backup.json', backup.value);
      else {
        this.notice = backup.error;
        this.paint();
      }
      return;
    }
    if (button.hasAttribute('data-storage-write-retry')) {
      this.deps.retrySaving();
      return;
    }
    if (button.hasAttribute('data-storage-write-reload')) {
      window.location.reload();
      return;
    }
    if (button.dataset.saveSlot !== undefined) {
      await this.save(Number(button.dataset.saveSlot));
      return;
    }
    if (button.dataset.loadSlot !== undefined) {
      try {
        const raw = this.deps.storage.getItem(FOUR_ARMY_SAVE_KEYS[Number(button.dataset.loadSlot)]!);
        if (raw !== null) await this.load(raw, 'resume');
      } catch {
        this.notice = text('保存を読み出せません。', 'The save could not be read.');
        this.paint();
      }
      return;
    }
    if (button.dataset.deleteSlot !== undefined) {
      this.pause();
      if (!this.deps.writable() || !window.confirm(text('この4軍保存を削除しますか？', 'Delete this four-army save?'))) return;
      try {
        this.deps.storage.removeItem(FOUR_ARMY_SAVE_KEYS[Number(button.dataset.deleteSlot)]!);
        this.slots();
      } catch {
        this.notice = text('保存を削除できません。', 'The save could not be deleted.');
        this.paint();
      }
      return;
    }
    if (id === 'four-zoom-in' || id === 'four-zoom-out') {
      this.automaticZoom = false;
      this.setZoom(this.zoomIndex + (id === 'four-zoom-in' ? 1 : -1));
      this.paint();
      return;
    }
    if (id === 'four-fit') {
      this.fit();
      this.paint();
      return;
    }
    if (id === 'four-locate') {
      const select = this.query<HTMLSelectElement>('#four-unit');
      const state = this.replay?.state ?? this.session?.state;
      if (state && select) {
        const u = fourArmyDisplay(state, this.view).units.find((u) => u.id === select.value);
        if (u?.position) {
          this.selected = { ...u.position };
          this.paint();
          this.locate();
        }
      }
    }
  }
  private async change(input: HTMLInputElement): Promise<void> {
    if (input.hasAttribute('data-four-music')) {
      if (input.id !== 'four-music-volume') this.changeMusic(input);
      return;
    }
    if (input.id === 'four-show-threats') {
      this.showThreats = input.checked;
      this.paint();
      return;
    }
    if (input.dataset.actionScenes === 'multiArmy') {
      this.setActionScenes(input.checked);
      return;
    }
    if (input.dataset.battleScenes === 'multiArmy') {
      this.setBattleScenes(input.checked);
      return;
    }
    if (input.id === 'four-rules') {
      this.expandedRules = input.value === 'expanded';
      this.shell();
      return;
    }
    if (input.id === 'four-tactics') {
      this.tacticalRules = input.checked;
      return;
    }
    if (input.id === 'four-map' && ['compact', 'outpost', 'strait', 'frontier', 'wide'].includes(input.value)) {
      this.setupMap = input.value as typeof this.setupMap;
      if (this.setupMap === 'wide') {
        this.setupCount = 4;
        this.setupParticipants = [...FOUR_ARMY_IDS];
      }
      this.order = [...this.setupArmies];
      if (!this.setupArmies.includes(this.setupHuman)) this.setupHuman = this.setupArmies[0]!;
      this.shell();
      return;
    }
    if (input.id === 'four-count' || input.id === 'four-variants') {
      const classic = classicVariant(this.setupMap);
      if (input.value === 'standard' && classic) {
        if (this.deps.allowClassicMap?.(classic) === false) {
          this.shell();
          return;
        }
        this.suspend();
        this.deps.onClose(classic);
        return;
      }
      const count = Number(input.value) as ArmyCount;
      if (armyCountOptions(this.setupMap).includes(count)) {
        this.setArmyCount(count);
        this.shell();
      }
      return;
    }
    if (input.dataset.activeArmy && this.setupMap !== 'wide') {
      const ids = FOUR_ARMY_IDS.filter((a) => (a === input.dataset.activeArmy ? input.checked : this.setupParticipants.includes(a)));
      if (ids.length >= 2) {
        this.setupParticipants = ids;
        this.setupCount = ids.length as 2 | 3 | 4;
        this.order = [...ids];
        if (!ids.includes(this.setupHuman)) this.setupHuman = ids[0]!;
      }
      this.shell();
      return;
    }
    if (input.id === 'four-team-mode') {
      this.setupTeamMode = input.checked;
      this.shell();
      return;
    }
    if (input.dataset.team && FOUR_ARMY_IDS.includes(input.value as FourArmyId)) {
      this.setupTeams[input.dataset.team as FourArmyId] = input.value as FourArmyId;
      return;
    }
    if (input.dataset.liveController) {
      this.switchController(input.dataset.liveController as FourArmyId, input.value);
      return;
    }
    if (input.id === 'four-ending' && (input.value === 'short' || input.value === 'unlimited')) {
      this.setupEnding = input.value;
      this.shell();
      return;
    }
    if (input.dataset.controller && this.setupArmies.includes(input.dataset.controller as FourArmyId) && (input.value === 'human' || input.value === 'cpu')) {
      this.setupControllers[input.dataset.controller as FourArmyId] = input.value;
      this.shell();
      return;
    }
    if (input.id === 'four-production-facility') {
      const [x, y] = input.value.split(',').map(Number);
      this.closeProduction(false);
      if (x !== undefined && y !== undefined) this.openProduction({ x, y });
      this.query<HTMLElement>('#four-production-facility')?.focus();
      return;
    }
    if (input.id === 'four-confirm-end') {
      this.confirmEndTurn = input.checked;
      return;
    }
    if (input.id === 'four-attack-weapon') {
      this.weaponSlot = input.value === '0' ? 0 : input.value === '1' ? 1 : undefined;
      this.paint();
      this.query<HTMLElement>('#four-attack-weapon')?.focus({ preventScroll: true });
      return;
    }
    if (input.id === 'four-file') {
      await this.file(input);
      return;
    }
    if (input.id === 'four-locale' && (input.value === 'ja' || input.value === 'en')) {
      this.pause(undefined, false);
      this.deps.onLocale(input.value);
      this.shell();
      return;
    }
    if (input.id === 'four-mode' && (input.value === 'human' || input.value === 'spectator' || input.value === 'custom')) {
      this.setupMode = input.value;
      this.shell();
      return;
    }
    if (input.id === 'four-human-army' && this.setupArmies.some((a) => a === input.value)) {
      this.setupHuman = input.value as FourArmyId;
      this.shell();
      return;
    }
    if (input.id === 'four-view' && isFourArmyView(input.value) && (input.value === 'all' || this.displayedArmies.includes(input.value))) {
      if (this.lockedView) {
        input.value = this.humanArmy!;
        return;
      }
      this.view = input.value;
      this.pause();
      return;
    }
    if (input.id === 'four-speed') {
      const speed = parseCommandSpeed(input.value);
      if (speed) {
        this.pause(undefined, false);
        this.speed = speed;
        this.paint();
      }
      return;
    }
    if (input.id === 'four-position' && this.replay) {
      await this.seek(Number(input.value));
      return;
    }
    if (input.dataset.order !== undefined) {
      this.order[Number(input.dataset.order)] = input.value as FourArmyId;
      return;
    }
    const army = input.dataset.army;
    if (army && FOUR_ARMY_IDS.some((a) => a === army)) {
      const next = structuredClone(this.settings),
        key = army as FourArmyId;
      if (input.dataset.setting === 'difficulty') next[key].difficulty = input.value as (typeof next)[typeof key]['difficulty'];
      if (input.dataset.setting === 'policy') next[key].policy = input.value as (typeof next)[typeof key]['policy'];
      if (isFourArmyCpuSettings(next)) {
        this.pause(undefined, false);
        this.settings = next;
        this.session?.configure(next);
        this.notice = text('設定を変更し、一時停止しました。', 'Settings changed. Paused.');
        this.paint();
      }
    }
  }
  private key(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.production) this.closeProduction();
      else if (this.humanTurn) {
        this.clearHuman();
        this.paint();
        this.focusTile();
      } else this.pause(text('一時停止しました。', 'Paused.'));
      return;
    }
    if (this.production || (e.target as Element).matches('input, select, textarea')) return;
    if (e.key.toLowerCase() === 'n' && this.humanTurn) {
      e.preventDefault();
      this.nextUnit();
      return;
    }
    if (!(e.target as Element).closest('#four-board')) return;
    const next = nextBoardPosition(this.selected, this.map!.board.width, this.map!.board.height, e.key);
    if (next) {
      e.preventDefault();
      this.selected = next;
      this.paint();
      this.locate();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void this.chooseHumanTile();
    }
  }
  private fit(): void {
    this.automaticZoom = false;
    this.setZoom(0);
  }
  private focusTile(): void {
    const tile = this.query('#four-board')?.children.item(this.selected.y * (this.map?.board.width ?? 32) + this.selected.x) as HTMLElement | null;
    tile?.focus({ preventScroll: true });
  }
  private locate(): void {
    const viewport = this.query<HTMLElement>('.four-map-viewport');
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (this.selected.x + 0.5) * this.cell - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, (this.selected.y + 0.5) * this.cell - viewport.clientHeight / 2);
    this.focusTile();
  }
  private nextUnit(): void {
    if (!this.humanTurn || !this.session || this.busy || this.deps.conflicted()) return;
    const units = this.session.state.units.filter((u) => u.owner === this.humanArmy && u.position && !u.hasActed);
    if (!units.length) return;
    const current = units.findIndex((u) => u.position?.x === this.humanSource?.x && u.position?.y === this.humanSource?.y);
    const unit = units[(current + 1) % units.length]!;
    this.clearHuman();
    this.selected = { ...unit.position! };
    this.humanSource = { ...this.selected };
    this.paint();
    this.locate();
  }
  private settingsForm(): string {
    return this.displayedArmies
      .map(
        (a) =>
          `<div class="four-setting-row"><strong class="four-army-label ${a}">${armyName(a)}</strong><label>${text('難易度', 'Difficulty')}<select id="four-difficulty-${a}" data-army="${a}" data-setting="difficulty">${options(['easy', 'normal', 'hard'], this.settings[a].difficulty, [text('易しい', 'Easy'), text('普通', 'Normal'), text('難しい', 'Hard')])}</select></label><label>${text('方針', 'Policy')}<select id="four-policy-${a}" data-army="${a}" data-setting="policy">${options(['balanced', 'offensive', 'defensive'], this.settings[a].policy, [text('均衡', 'Balanced'), text('攻勢', 'Offensive'), text('守勢', 'Defensive')])}</select></label></div>`,
      )
      .join('');
  }
  private fileTools(): string {
    return `<details class="four-tools"><summary>${text('保存・リプレイ', 'Saves & replay')}</summary><label>${text('記録名', 'Record name')}<input id="four-name" maxlength="40" value="${escapeHtml(this.name)}"></label><div class="four-buttons">${FOUR_ARMY_SAVE_KEYS.map((_, i) => `<button data-save-slot="${i}">${text(`保存${i + 1}へ保存`, `Save to slot ${i + 1}`)}</button>`).join('')}<button id="four-export">${text('JSONを書き出す', 'Export JSON')}</button><button id="four-import">${text('JSONから再開', 'Import match')}</button><button id="four-import-replay">${text('JSONをリプレイ', 'Import replay')}</button><button id="four-backup">${text('全データをバックアップ', 'Back up all data')}</button></div><div id="four-slots"></div><section class="four-auto-tools"><h3>${text('手番開始の自動保存', 'Turn-start autosave')}</h3><p id="four-auto-status" role="status"></p><div class="four-buttons"><button id="four-auto-load">${text('自動保存から再開', 'Resume autosave')}</button><button id="four-auto-export">${text('自動保存の原本を書出し', 'Export autosave original')}</button><button id="four-auto-delete">${text('自動保存を削除', 'Delete autosave')}</button><button id="four-auto-retry" hidden>${text('自動保存を再試行', 'Retry autosave')}</button></div></section><p class="four-hint">${text('3・4軍専用の手動2枠と自動1枠です。自動保存は人間軍の手番開始時に更新し、手動枠・通常対局・研究保存を上書きしません。記録は65,536命令・8MBまで。ブラウザーの空き容量により保存できない場合はJSONを書き出してください。', 'Two manual slots and one turn-start autosave for multi-army play. Autosave never overwrites manual, normal or research saves. Records support up to 65,536 commands and 8MB. Export JSON if browser storage is full.')}</p></details><input id="four-file" type="file" accept=".json,application/json" hidden>`;
  }
  private setZoom(index: number): void {
    this.zoomIndex = clampBoardZoomIndex(index);
    this.cell = boardTileSize(this.zoomIndex);
  }
  private resizeBoard(): void {
    if (!this.active || this.phase !== 'watch' || !this.automaticZoom || !this.map) return;
    const index = defaultBoardZoomIndex(boardAreaWidth(window.innerWidth), this.map.board.width);
    if (index === this.zoomIndex) return;
    this.setZoom(index);
    this.paint();
  }
  private changeMusic(input: HTMLInputElement | HTMLSelectElement): void {
    const next = editFourArmyMusic(this.music, input);
    if (!next) return;
    this.music = next;
    this.applyMusic();
    if (input.id === 'four-music-by-army') {
      this.root.querySelectorAll<HTMLSelectElement>('[data-four-music-army]').forEach((select) => (select.disabled = !next.armyTracks));
    }
    const status = this.query('#four-music-status');
    const saved = saveFourArmyMusic(this.deps.storage, next);
    if (status) status.textContent = saved ? '' : text('BGM設定を保存できません。変更はこのタブだけに適用します。', 'Could not save BGM settings. Changes apply to this tab.');
  }
  private applyMusic(): void {
    if (!this.active || !this.deps.onMusic) return;
    const state = this.replay?.state ?? this.session?.state;
    const actor = this.phase === 'watch' && !this.concealed && this.music.armyTracks ? state?.round.order[state.round.index] : undefined;
    if (this.musicApplied?.settings === this.music && this.musicApplied.actor === actor) return;
    this.musicApplied = { settings: this.music, actor };
    this.deps.onMusic(fourArmyMusicPlayback(this.music, actor));
  }

  private setupMenu(music: string): string {
    const open = this.query<HTMLDetailsElement>('#four-setup-options')?.open ?? false;
    const armies = this.setupArmies.length;
    const humans = fourArmyHumanArmies(this.setupMatchControllers());
    const cpuCount = armies - humans.length;
    const controls = !humans.length
      ? text(`CPU ${cpuCount}軍で観戦`, `Watch ${cpuCount} CPU${cpuCount === 1 ? '' : 's'}`)
      : humans.length === 1
        ? text(`${armyName(humans[0]!)}を操作・CPU ${cpuCount}軍`, `Play as ${armyName(humans[0]!)} · ${cpuCount} CPU${cpuCount === 1 ? '' : 's'}`)
        : text(`人間 ${humans.length}軍・CPU ${cpuCount}軍`, `${humans.length} human armies · ${cpuCount} CPU${cpuCount === 1 ? '' : 's'}`);
    const { width, height } = multiplayerSize(this.setupMap);
    const ending =
      this.setupMap !== 'wide' && this.setupEnding === 'short'
        ? text(`${armies === 3 ? 21 : 20}ラウンド判定`, `${armies === 3 ? 21 : 20}-round decision`)
        : text('決着まで', 'Last army standing');
    const format = this.setupMap !== 'wide' && this.setupTeamMode ? text('固定チーム', 'Fixed teams') : text('個人戦', 'Free-for-all');

    return `<section class="four-start-card" aria-labelledby="four-start-map">
      <div>
        <h2 id="four-start-map">${this.mapName(this.setupMap)}</h2>
        <p id="four-start-summary">${width} × ${height} · ${controls} · ${format} · ${ending}</p>
      </div>
      <div class="four-start-choices">
        ${renderMatchVariants(this.setupMap, armies as ArmyCount, 'four-variants')}
        <label>${text('対局方式', 'Mode')}<select id="four-mode">${options(['spectator', 'human', 'custom'], this.setupMode, [text('CPU観戦', 'Watch CPUs'), text('対CPU', 'Play against CPUs'), text('交代プレイ・軍別設定', 'Local play / army setup')])}</select></label>
      </div>
      <div class="four-buttons">
        <button id="four-start" class="four-primary" aria-describedby="four-start-summary">${humans.length ? text(`${armies}軍対局を開始`, `Start ${armies}-army play`) : text('CPU観戦を開く', 'Open CPU observation')}</button>
        ${this.session ? `<button id="four-return">${text('進行中の対局へ戻る', 'Return to match')}</button>` : ''}
      </div>
    </section>
    <details id="four-setup-options" class="four-setup-options" ${open ? 'open' : ''}>
      <summary id="four-setup-summary">${text('詳細設定', 'Match setup')}</summary>
      <div class="four-setup">
        <section class="four-brief"><label>${text('マップ', 'Map')}<select id="four-map">${options(['compact', 'outpost', 'strait', 'frontier', 'wide'], this.setupMap, [text('小型：緑の国境 18×14', 'Compact: Green Border 18×14'), text('小型：前哨基地強襲 18×14', 'Compact: Outpost Assault 18×14'), text('水域：交差海峡 17×15', 'Water: Cross Strait 17×15'), text('広域：新・四方の前線 32×32', 'Wide: New Four Fronts 32×32'), text('従来：四方の前線 32×32（4軍）', 'Legacy: Four Fronts 32×32 (4 armies)')])}</select></label><label>${text('参加軍数', 'Armies')}<select id="four-count" ${this.setupMap === 'wide' ? 'disabled' : ''}>${options(['2', '3', '4'], String(this.setupCount), [text('2軍', '2 armies'), text('3軍', '3 armies'), text('4軍', '4 armies')])}</select></label>${this.setupMap !== 'wide' ? `${this.participantForm()}<label>${text('終了方式', 'Ending')}<select id="four-ending">${options(['short', 'unlimited'], this.setupEnding, [text(`短期戦：${this.setupCount === 3 ? 21 : 20}ラウンド判定`, `Short: ${this.setupCount === 3 ? 21 : 20}-round decision`), text('決着まで（期限なし）', 'Last army standing (unlimited)')])}</select></label><p class="four-hint">${this.setupEnding === 'short' ? text(`${this.setupCount === 3 ? 21 : 20}R終了時にチームの拠点数 → 合計HPで判定。同点は引分。3・4軍は毎ラウンド先手が交代します。`, `After round ${this.setupCount === 3 ? 21 : 20}: team properties, then HP; tied draw. Initiative rotates each round with 3–4 armies.`) : text('期限による判定はなく、長期化する場合があります。', 'No round-limit decision; this may take longer.')}</p>` : ''}<label>${text('操作する軍', 'Your army')}<select id="four-human-army" ${this.setupMode !== 'human' ? 'disabled' : ''}>${options(this.setupArmies, this.setupHuman, this.setupArmies.map(armyName))}</select></label>${this.setupMode === 'custom' ? `<fieldset><legend>${text('各軍の操作', 'Army controllers')}</legend>${this.setupArmies.map((a) => `<label>${armyName(a)}<select id="four-controller-${a}" data-controller="${a}">${options(['human', 'cpu'], this.setupControllers[a], [text('人間', 'Human'), 'CPU'])}</select></label>`).join('')}<p>${text('複数軍の人間操作は同端末で交代します。チームは開始時の設定で固定です。', 'Human armies take turns on this device. Teams are fixed at match start.')}</p></fieldset>` : ''}<label>${text('ゲーム規則', 'Rules')}<select id="four-rules">${options(['expanded', 'classic'], this.expandedRules ? 'expanded' : 'classic', [text('偵察・設営・兵站指示', 'Recon, engineering and logistics'), text('従来の4軍規則', 'Original four-army rules')])}</select></label>${this.expandedRules ? `<label><input id="four-tactics" type="checkbox" ${this.tacticalRules ? 'checked' : ''}>${text('陸戦統合戦術：同時射撃・待伏せ・地形・天候・ZOC', 'Land tactics: simultaneous fire, ambush, cover, weather, ZOC')}</label>` : ''}<label>${text('seed', 'Seed')}<input id="four-seed" inputmode="numeric" maxlength="10" value="${escapeHtml(this.seed)}"></label><fieldset><legend>${text('手番順', 'Turn order')}</legend><div class="four-order">${this.order.map((a, i) => `<label>${i + 1}<select id="four-order-${i}" data-order="${i}">${options(this.setupArmies, a, this.setupArmies.map(armyName))}</select></label>`).join('')}</div></fieldset><p>${text('司令部または全部隊を失うと脱落します。個人戦は最後の1軍、固定チーム戦は最後のチームが勝利します。', 'Losing headquarters or all units eliminates an army. The last army or fixed team wins.')}</p><p>${width !== 32 ? text('各軍4部隊・基本資金6,000。搭載込み上限8部隊。人間1軍で20〜30分を目指す小型対局です（実時間は操作速度等で変わります）。', 'Each army starts with 4 units and 6,000 gold; cap 8 including cargo. Designed for shorter play: 20–30 minutes is a target, not a timer.') : text('各軍8部隊・基本資金10,000。搭載込み上限16部隊。100ラウンドごとに停止します。', 'Each army starts with 8 units and 10,000 gold; cap 16 including cargo. Pauses every 100 rounds.')}</p></section>
        <section><h2>${text('軍別CPU設定', 'Army CPU settings')}</h2>${this.settingsForm()}<p class="four-hint">${text('各軍を人間／CPUに設定できます。複数人操作では交代時に視界を保護します。設定変更は一時停止します。', 'Configure each army as Human or CPU. Local handoffs protect each army’s view. Setting changes pause play.')}</p></section>
      </div>
      <button id="four-setup-confirm" class="four-primary">${text('開始ボタンへ', 'Go to start button')}</button>
    </details>
    <section class="four-setup-tools" aria-label="${text('BGM・保存・リプレイ', 'Music, saves and replay')}">${music}${this.fileTools()}</section>`;
  }

  private renderObjectives(): string {
    const match = this.map?.match;
    const teams = match?.version === 2 && new Set(match.participants.map((army) => match.teams[army])).size < match.participants.length;
    const win = teams ? text('最後の生存チームが勝利', 'The last team standing wins') : text('最後の生存軍が勝利', 'The last army standing wins');
    const decision =
      match?.ending === 'short'
        ? text(
            `${match.roundLimit}ラウンド終了時に拠点数、残存HPで判定。同点は引き分け。`,
            `After round ${match.roundLimit}, compare properties, then remaining HP. A tie is a draw.`,
          )
        : '';
    return `<details class="four-objectives"><summary>${text('作戦目標', 'Objectives')}</summary><p>${win}</p><p>${text('司令部または全部隊を失うと脱落します。', 'An army is eliminated if it loses its headquarters or all of its units.')}</p>${decision ? `<p>${decision}</p>` : ''}</details>`;
  }

  private shell(): void {
    if (this.concealed) {
      this.renderConcealed();
      return;
    }
    this.concealedRendered = false;
    this.boardModelKey = '';
    this.briefMarkup = '';
    this.humanMarkup = '';
    this.historyMarkupKey = '';
    this.resultMarkup = '';
    const focus = (document.activeElement as HTMLElement | null)?.id;
    const music = renderFourArmyMusic(this.music, this.query<HTMLDetailsElement>('#four-music-settings')?.open ?? false);
    const legend = renderTerrainLegend('temperate', this.query<HTMLDetailsElement>('#four-terrain-legend')?.open ?? false, 'four-terrain-legend');
    const sceneSettings = renderBattleSceneSetting('multiArmy', this.battleScenesEnabled) + renderActionSceneSetting('multiArmy', this.actionScenesEnabled);
    const head = `<header class="four-header command-bar"><div><p class="four-kicker">MINISTR / MULTI-ARMY</p><h1 id="four-heading" tabindex="-1">${text(`${this.displayedArmies.length}軍対局・観戦`, `${this.displayedArmies.length}-army play & watch`)}</h1></div><label>${text('言語', 'Language')}<select id="four-locale"><option value="ja" ${getLocale() === 'ja' ? 'selected' : ''}>日本語</option><option value="en" ${getLocale() === 'en' ? 'selected' : ''}>English</option></select></label>${this.phase === 'menu' ? sceneSettings : ''}${this.deps.onTitle ? `<button id="four-title">${text('タイトルへ', 'Title')}</button>` : ''}<button id="four-close">${text('タイトルへ', 'Title')}</button></header><div id="four-storage"></div><p id="four-notice" role="status"></p>`;
    if (this.phase === 'menu') this.root.innerHTML = head + this.setupMenu(music);
    else
      this.root.innerHTML =
        head +
        `<div id="four-result-host"></div><div class="four-playback-row"><button id="four-toggle" class="four-primary"></button><details class="four-playback-options" ${this.humanArmy ? '' : 'open'}><summary>${text('対局設定・保存', 'Match settings & saves')}</summary><section class="four-toolbar" aria-label="${text('観戦操作', 'Spectator controls')}"><button id="four-step">${text('1手進める', 'Step')}</button><label>${text('速度', 'Speed')}<select id="four-speed">${options(
          COMMAND_SPEEDS.map(String),
          String(this.speed),
          COMMAND_SPEEDS.map((s) => s + '×'),
        )}</select></label><label>${text('視点', 'View')}<select id="four-view">${options(['all', ...this.displayedArmies], this.view, [text('全体表示', 'Whole board'), ...this.displayedArmies.map(armyName)])}</select></label><button id="four-menu">${text('開始条件', 'Setup')}</button><button id="four-replay">${text('リプレイ再生', 'Replay record')}</button></section></details></div>${renderTurnProgress('', { id: 'four-turn', tone: 'four-turn' })}<p id="four-action-feedback" class="four-action-feedback" role="status" aria-live="polite"></p><details class="four-armies"><summary>${text('軍別情報', 'Army information')}</summary><div id="four-army-info"></div></details><div class="four-layout battle-layout"><section class="four-map-panel battlefield-wrap theme-temperate"><div class="four-map-heading"><h2>${this.mapTitle}</h2><div class="four-buttons"><button id="four-zoom-out" aria-label="${text('盤面を縮小', 'Zoom out')}">−</button><button id="four-fit">${text('縮小', 'Overview')}</button><span id="four-zoom-label" aria-live="polite"></span><button id="four-zoom-in" aria-label="${text('盤面を拡大', 'Zoom in')}">＋</button></div></div><div id="four-brief"></div><div class="four-map-viewport board-viewport"><div id="four-board" class="board" tabindex="-1" role="group" aria-label="${text(`${this.displayedArmies.length}軍対局盤面`, `${this.displayedArmies.length}-army board`)}" aria-describedby="four-selection"></div></div><label class="four-threat-control"><input id="four-show-threats" type="checkbox" ${this.showThreats ? 'checked' : ''}> ${text('敵の脅威範囲', 'Enemy threat range')}</label><p class="four-hint">${text('部隊→移動先・敵をタップして操作。矢印で移動、Enter／Spaceで操作、Nで次の未行動部隊、Escで選択取消。盤面は縦横にスクロールできます。', 'Select a unit, then tap a destination or enemy. Arrows navigate; Enter/Space act; N selects the next ready unit; Esc clears selection. Scroll to explore the board.')}</p>${legend}<details id="four-tile-info"><summary>${text('マス情報', 'Tile information')}</summary><div id="four-tile-rows"></div></details><p id="four-threat-hint" class="four-hint" hidden>${text('視認済みの敵の移動と射程から計算した目安です。敵の残弾・燃料・未発見の部隊は使いません。', 'Estimate from the movement and range of visible enemies. Remaining enemy ammo, fuel and unseen units are excluded.')}</p></section><aside class="four-inspector command-panel" id="four-command-panel" tabindex="-1" aria-label="${text('作戦情報', 'Operation information')}">${this.renderObjectives()}<section id="four-human-panel" class="four-human" aria-label="${text('自軍操作', 'Your army controls')}" hidden></section><section id="four-undo-controls" class="four-undo-controls" hidden><button id="four-undo">${text('1手戻す', 'Undo one command')}</button><details><summary>${text('戻せる操作', 'Undo limits')}</summary><p class="four-hint">${text('単一人間軍の同じ手番内で、情報が増えない可逆操作を最大8手。戦闘・偵察・新しい視界の取得・CPU進行・読込より前には戻せません。', 'One human army: up to eight reversible commands in this turn. Undo cannot cross combat, reconnaissance, new visibility, CPU progress or loading.')}</p></details></section><section><h2>${text('選択情報', 'Selection')}</h2><output id="four-selection"></output><label>${text('表示中の部隊', 'Visible units')}<select id="four-unit"></select></label><button id="four-locate">${text('部隊へ移動', 'Locate unit')}</button></section><details class="four-history"><summary>${text('目撃履歴', 'Sighting history')}</summary><div id="four-sightings"></div></details><details class="four-history"><summary>${text('観測済みの行動', 'Observed actions')}</summary><div id="four-events"></div></details>${this.liveControllerForm()}<details><summary>${text('軍別CPU設定', 'Army CPU settings')}${this.replay ? text('（保存時）', ' (at save)') : ''}</summary>${this.settingsForm()}${!this.map?.pathVersion ? `<p class="four-hint">${text('この保存の移動・接触規則を維持しています。回転に対応した新規則は新しい対局で使います。', 'This record retains its movement and contact rules. New matches use the rotation-consistent rules.')}</p>` : ''}${this.cpuVersion !== FOUR_ARMY_LATEST_CPU_VERSION ? `<p class="four-hint">${text('旧保存のCPU判断を維持しています。切り替えると、この先の判断に改善版を使います。元の保存は再保存するまで変わりません。', 'This record retains its original CPU. Switching changes future decisions; the saved original is kept until you save again.')}</p>${!this.replay ? `<button id="four-upgrade-cpu">${text('改善版CPUへ切り替え', 'Use improved CPU')}</button>` : ''}` : ''}</details>${music}${this.fileTools()}</aside></div>${this.replay ? `<section class="four-replay-controls"><strong>${text('リプレイ', 'Replay')}</strong><button id="four-replay-start">|◀</button><button id="four-previous">◀</button><label>${text('命令位置', 'Command position')}<input id="four-position" type="range" min="0" max="${this.replay.commands.length}" value="${this.replay.position}"></label><output id="four-replay-count"></output><button id="four-replay-end">▶|</button><button id="four-replay-close">${text('対局へ戻る', 'Return to match')}</button></section>` : ''}`;
    if (this.phase === 'watch') {
      this.mobileMarkup = '';
      this.query('#four-command-panel')?.insertAdjacentHTML(
        'beforeend',
        `<section class="sound-controls" aria-label="${text('演出設定', 'Animation settings')}">${sceneSettings}</section>`,
      );
      this.root.insertAdjacentHTML('beforeend', '<div id="four-mobile-host"></div><div id="four-production-host"></div>');
    } else this.boardInput.update(null);
    if (this.phase === 'watch' && this.humanArmy) {
      const language = this.query('#four-locale')?.parentElement;
      if (language) this.query('.four-toolbar')?.append(language);
    }
    this.saveButtons = [...this.root.querySelectorAll<HTMLButtonElement>('[data-save-slot]')];
    this.settingInputs = [...this.root.querySelectorAll<HTMLSelectElement>('[data-setting]')];
    this.slots();
    this.paint();
    if (this.phase === 'watch') this.locate();
    (focus ? document.getElementById(focus) : null)?.focus({ preventScroll: true });
    if (!this.root.contains(document.activeElement)) this.query<HTMLElement>('#four-heading')?.focus({ preventScroll: true });
  }
  private slots(): void {
    const root = this.query('#four-slots');
    if (!root) return;
    root.innerHTML = FOUR_ARMY_SAVE_KEYS.map((key, i) => {
      try {
        const raw = this.deps.storage.getItem(key),
          name = fourArmySlotName(raw);
        return `<div class="four-slot"><strong>${text(`保存${i + 1}`, `Slot ${i + 1}`)}: ${escapeHtml(raw === null ? text('空き', 'Empty') : (name ?? text('読込時に検証', 'Checked on load')))}</strong><button data-load-slot="${i}" ${raw === null ? 'disabled' : ''}>${text('再開', 'Resume')}</button><button data-delete-slot="${i}" ${raw === null || !this.deps.writable() ? 'disabled' : ''}>${text('削除', 'Delete')}</button></div>`;
      } catch {
        return `<p>${text('保存領域を読み出せません。', 'Saved data could not be read.')}</p>`;
      }
    }).join('');
  }
  private paintControls(): void {
    if (this.concealed) {
      this.renderConcealed();
      return;
    }
    const button = this.query<HTMLButtonElement>('#four-toggle');
    if (button) {
      // Keep the native button target stable between pointerdown and click during CPU updates.
      const label = this.running || this.busy ? text('一時停止', 'Pause') : this.replay ? text('リプレイ再生', 'Play replay') : text('CPU進行', 'Run CPUs');
      if (button.textContent !== label) button.textContent = label;
      const pressed = String(this.running || this.busy);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      button.hidden = !this.replay && (this.rawHumanTurn || this.session?.state.outcome.type !== 'ongoing');
      button.disabled =
        (!!this.replay && this.replay.position >= this.replay.commands.length) ||
        (!!this.session &&
          (this.deps.conflicted() || (!this.replay && (this.rawHumanTurn || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session.state.outcome.type !== 'ongoing'))));
    }
    const step = this.query<HTMLButtonElement>('#four-step');
    if (step)
      step.disabled =
        this.busy ||
        this.running ||
        this.deps.conflicted() ||
        (!this.replay && (this.rawHumanTurn || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session?.state.outcome.type !== 'ongoing')) ||
        (!!this.replay && this.replay.position >= this.replay.commands.length);
    this.saveButtons.forEach((b) => (b.disabled = !this.session || this.busy || !this.deps.writable()));
    const exp = this.query<HTMLButtonElement>('#four-export');
    if (exp) exp.disabled = !this.session || this.busy;
    const view = this.query<HTMLSelectElement>('#four-view');
    if (view) {
      view.disabled = this.lockedView;
      view.value = this.view;
    }
    this.settingInputs.forEach((s) => (s.disabled = !!this.replay));
  }
  private paint(): void {
    this.applyMusic();
    if (this.concealed) {
      this.renderConcealed();
      return;
    }
    if (this.concealedRendered) {
      this.concealedRendered = false;
      this.shell();
      return;
    }
    this.root.dataset.mode = this.humanArmy ? 'human' : 'spectator';
    this.root.dataset.recordCount = String(this.count);
    this.root.dataset.checkpoints = String(this.checkpoints.length);
    this.root.dataset.replayStates = String(this.replay?.cachedStates ?? 0);
    const notice = this.query('#four-notice');
    if (notice) notice.textContent = this.notice;
    const storage = this.query('#four-storage');
    if (storage)
      storage.innerHTML = this.deps.persistent()
        ? renderStorageWriterNotice(this.deps.writerState())
        : `<p class="four-hint">${text('このタブ内だけに保存します。終了前にJSONを書き出してください。', 'Saves last only in this tab. Export JSON before closing.')}</p>`;
    if (this.lockedView) this.view = this.humanArmy!;
    this.paintAutosave();
    this.paintControls();
    if (this.phase !== 'watch' || !this.session) return;
    const state = this.replay?.state ?? this.session.state,
      display = fourArmyDisplay(state, this.view),
      actor = state.round.order[state.round.index]!;
    const turn = this.query('#four-turn')!;
    let status = `${text('ラウンド', 'Round')} ${state.decision?.round ?? state.round.round}${state.match?.ending === 'short' ? '/' + state.match.roundLimit : ''} · ${armyName(actor)} · ${this.replay ? (this.running ? text('リプレイ再生中', 'Replaying') : text('リプレイ停止中', 'Replay paused')) : this.busy ? text('CPU処理中', 'CPU working') : this.running ? text('CPU進行中', 'CPUs running') : this.humanTurn ? text('操作待ち', 'Awaiting your orders') : text('CPU停止中', 'CPUs paused')} · ${this.replay ? this.replay.position : this.count} ${text('命令', 'commands')}${state.outcome.type === 'victory' ? ' · ' + battleWinners(state).map(armyName).join(' / ') + ' ' + text('勝利', 'wins') : state.outcome.type === 'draw' ? ' · ' + text('引き分け', 'Draw') : ''}`;
    if (this.humanArmy)
      status +=
        ' · ' +
        armyName(this.humanArmy) +
        (state.outcome.type === 'victory' && battleWinners(state).includes(this.humanArmy)
          ? text('（あなたの勝利）', ' (You win)')
          : !state.alive.includes(this.humanArmy)
            ? text('（あなたは敗北）', ' (You lost)')
            : this.humanTurn
              ? text('（あなたの手番）', ' (Your turn)')
              : text('（あなた）', ' (You)'));
    if (turn.textContent !== status) turn.textContent = status;
    const progress = turn.closest('.map-turn-status');
    if (progress) progress.className = 'map-turn-status four-turn ' + actor;
    this.paintHuman();
    this.query('#four-army-info')!.innerHTML = fourArmyParticipants(state)
      .map((a) => {
        const p = display.players[a],
          count = display.units.filter((u) => u.owner === a).length;
        return `<div class="four-army-label ${a}"><strong>${armyName(a)}${state.match?.version === 2 ? ' · ' + text('チーム ', 'Team ') + String.fromCharCode(64 + Number(state.match.teams[a].slice(-1))) : ''} ${a === actor ? '◀' : ''}</strong><span>${state.alive.includes(a) ? text('生存', 'Active') : text('脱落', 'Eliminated')}</span><span>${this.view === 'all' || this.view === a ? count + '/' + (state.setup?.unitLimitPerArmy ?? 16) : text('視認 ', 'Seen ') + count}</span><span>${p ? `${p.gold.toLocaleString()} G · +${p.income.toLocaleString()}` : text('資金非公開', 'Funds hidden')}</span></div>`;
      })
      .join('');
    const board = this.query<HTMLElement>('#four-board')!;
    const boardKey = [
      this.count,
      this.replay?.position ?? 'live',
      this.view,
      getLocale(),
      this.selected.x,
      this.selected.y,
      this.humanSource?.x,
      this.humanSource?.y,
      this.humanAction,
      this.weaponSlot,
      this.threatKey,
      this.cell,
    ].join(':');
    if (boardKey !== this.boardModelKey) {
      board.style.gridTemplateColumns = `repeat(${display.board.width}, ${this.cell}px)`;
      board.style.gridAutoRows = `${this.cell}px`;
      const choices = this.humanChoices.filter((c) => c.command.type !== 'attack' || this.weaponSlot === undefined || c.command.weaponSlot === this.weaponSlot);
      const supplyObservation = this.humanArmy ? observeFourArmy(state, this.humanArmy) : undefined;
      const supply = supplyObservation?.ok ? supplyRange(fourArmyPlanningView(supplyObservation.value), 'red') : undefined;
      this.boardView.update(board, fourArmyBoardCells(display, this.selected, this.humanSource, choices, this.humanAction, this.threat, supply), 'four-army');
      this.boardModelKey = boardKey;
    }
    this.boardInput.update(this.query<HTMLElement>('#four-board'), {
      click: (p) => {
        this.selected = p;
        void this.chooseHumanTile();
      },
      key: (e) => {
        this.key(e);
        e.stopPropagation();
      },
      focus: (p) => {
        if (this.selected.x === p.x && this.selected.y === p.y) return;
        this.selected = p;
        // Opening a taller brief during pointerdown moves the tile before click.
        if (!this.boardPointerPending) this.paint();
      },
    });
    const zoom = this.query('#four-zoom-label');
    if (zoom) zoom.textContent = boardZoomPercent(this.zoomIndex) + '%';
    this.query<HTMLButtonElement>('#four-zoom-out')!.disabled = this.zoomIndex === 0;
    this.query<HTMLButtonElement>('#four-zoom-in')!.disabled = this.zoomIndex === BOARD_ZOOM_LEVELS.length - 1;
    this.selection(display);
    const intel = this.observationCache;
    if (intel) {
      const kind = fourArmyMovementKind(intel.observation, this.humanSource ?? this.selected);
      const details = this.query('#four-tile-rows')!;
      const markup = renderFourArmyTileInfo(display, this.selected, intel.projection, kind);
      if (details.innerHTML !== markup) details.innerHTML = markup;
    }
    this.query<HTMLInputElement>('#four-show-threats')!.disabled = this.view === 'all';
    this.query<HTMLElement>('#four-threat-hint')!.hidden = !this.showThreats || this.view === 'all';
    const select = this.query<HTMLSelectElement>('#four-unit')!,
      previous = select.value;
    const unitOptions = display.units
      .filter((u) => u.position)
      .map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(armyName(u.owner) + ' ' + unitNames[u.kind] + ' ' + u.id)}</option>`)
      .join('');
    if (select.innerHTML !== unitOptions) select.innerHTML = unitOptions;
    if ([...select.options].some((o) => o.value === previous)) select.value = previous;
    const range = this.query<HTMLInputElement>('#four-position');
    if (range && this.replay) {
      range.value = String(this.replay.position);
      this.query('#four-replay-count')!.textContent = `${this.replay.position}/${this.replay.commands.length}`;
    }
    this.paintSupport(state);
  }
  private attackChoice(): FourArmyHumanChoice | undefined {
    if (!this.session || !this.humanArmy || !this.humanSource) return;
    const observed = observeFourArmy(this.session.state, this.humanArmy);
    if (!observed.ok) return;
    const view = fourArmyPlanningView(observed.value);
    const attacker = view.units.find((u) => u.owner === 'red' && u.position?.x === this.humanSource?.x && u.position?.y === this.humanSource?.y);
    const target = view.units.find((u) => u.owner === 'blue' && u.position?.x === this.selected.x && u.position.y === this.selected.y);
    if (!attacker || !target) return;
    const forecast = forecastCombat(view, attacker, target, this.weaponSlot);
    if (!forecast.ok) return;
    return this.humanChoices.find((c) => c.command.type === 'attack' && c.command.targetId === target.id && c.command.weaponSlot === forecast.value.attackWeapon);
  }
  private async chooseHumanTile(): Promise<void> {
    if (!this.humanTurn || !this.session || this.busy || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.deps.conflicted()) {
      this.paint();
      return;
    }
    if (this.humanAction === 'recon' && this.humanArmy) {
      await this.applyHuman({ action: 'recon', command: { actor: this.humanArmy, type: 'recon', center: { ...this.selected } } });
      return;
    }
    const at = (p: Position | undefined) => p?.x === this.selected.x && p.y === this.selected.y;
    const target = this.session.state.units.find((u) => at(u.position) && u.owner === this.humanArmy);
    const choice = this.humanAction
      ? this.humanChoices.find((c) => c.action === this.humanAction && at(c.target))
      : (this.attackChoice() ?? this.humanChoices.find((c) => c.action === 'move' && at(c.target)));
    if (choice) {
      await this.applyHuman(choice);
      return;
    }
    if (this.humanAction) this.notice = text('枠で示した対象マスを選んでください。', 'Choose an outlined target tile.');
    else if (target) {
      this.clearHuman();
      this.humanSource = { ...this.selected };
      this.notice = text('移動先または敵を選択してください。', 'Choose a destination or enemy.');
    } else if (!this.humanSource) {
      this.openProduction(this.selected);
    } else this.notice = text('このマスには命令できません。選択解除はEscです。', 'No action is available on this tile. Esc clears selection.');
    this.paint();
    this.focusTile();
  }
  private actionName(action: FourArmyHumanAction): string {
    const names: Record<FourArmyHumanAction, [string, string]> = {
      bridge: ['架橋（1000G）', 'Build bridge (1,000 G)'],
      destroyBridge: ['橋を破壊', 'Demolish bridge'],
      fortify: ['陣地設営（500G）', 'Fortify (500 G)'],
      recon: ['広域偵察', 'Recon'],
      'ambush-primary': ['主武器で待伏せ', 'Prepare primary ambush'],
      'ambush-secondary': ['副武器で待伏せ', 'Prepare secondary ambush'],
      logistics: ['兵站指示', 'Logistics orders'],
      repairReserve: ['修理留保資金', 'Repair reserve'],
      move: ['移動', 'Move'],
      'attack-primary': ['主武器で攻撃', 'Primary attack'],
      'attack-secondary': ['副武器で攻撃', 'Secondary attack'],
      merge: ['合流', 'Merge'],
      embark: ['搭載', 'Embark'],
      disembark: ['降車', 'Disembark'],
      wait: ['待機', 'Wait'],
      capture: ['占領', 'Capture'],
      produce: ['生産', 'Produce'],
      endTurn: ['手番を終了', 'End turn'],
    };
    return text(...names[action]);
  }
  private choiceName(choice: FourArmyHumanChoice): string {
    const command = choice.command;
    return (
      this.actionName(choice.action) +
      (command.type === 'produce' ? ' ' + unitNames[command.kind] + ' · ' + unitStats[command.kind].cost.toLocaleString() + ' G' : '') +
      (choice.target ? ` (${choice.target.x + 1}, ${choice.target.y + 1})` : '') +
      (choice.counterDamage ? ' · ' + text('予測反撃 ', 'Estimated counter ') + choice.counterDamage.min + '–' + choice.counterDamage.max : '') +
      (choice.damage ? ' · ' + text('予測ダメージ ', 'Estimated damage ') + choice.damage.min + '–' + choice.damage.max : '')
    );
  }
  private paintHuman(): void {
    const panel = this.query<HTMLElement>('#four-human-panel');
    if (!panel || !this.session) return;
    panel.hidden = !this.humanArmy;
    const state = this.replay?.state ?? this.session.state;
    const viewer = this.view === 'all' ? (this.humanArmy ?? state.round.order[state.round.index]!) : this.view;
    const observationKey = `${this.count}:${this.replay?.position ?? 'live'}:${this.view}`;
    const cached = this.observationCache?.key === observationKey ? this.observationCache : undefined;
    const observed = cached ? { ok: true as const, value: cached.observation } : observeFourArmy(state, viewer);
    if (!observed.ok) return;
    const projection = cached?.projection ?? fourArmyPlanningView(observed.value);
    if (!cached) {
      if (this.view === 'all') projection.units = state.units.map((u) => ({ ...u, owner: u.owner === viewer ? 'red' : 'blue' }));
      this.observationCache = { key: observationKey, observation: observed.value, projection };
    }
    const source = this.humanSource;
    const unit = projection.units.find((u) => u.owner === 'red' && u.position?.x === source?.x && u.position?.y === source?.y);
    const canAct = this.humanTurn && !this.busy && !this.deps.conflicted() && this.count < FOUR_ARMY_COMMAND_LIMIT;
    const inspected = !source && canAct ? projection.units.find((u) => u.owner === 'blue' && u.position?.x === this.selected.x && u.position.y === this.selected.y) : undefined;
    const union = this.showThreats && this.view !== 'all';
    const targetKind = union ? unit?.kind : undefined;
    const threatKey = union || inspected ? `${observationKey}:${union ? 'all' : inspected!.id}:${targetKind ?? ''}` : '';
    if (threatKey !== this.threatKey) {
      this.threatKey = threatKey;
      this.threat = threatKey ? fourArmyThreats(observed.value, projection, union ? undefined : inspected?.id, targetKind) : undefined;
    }
    const cacheKey = canAct ? `${this.count}:${source?.x},${source?.y}` : '';
    if (!cacheKey) {
      this.humanChoices = [];
      this.choicesKey = '';
    } else if (cacheKey !== this.choicesKey) {
      // No selection means only the turn control is available; facilities have their own menu.
      this.humanChoices = fourArmyHumanChoices(observed.value, source ?? { x: -1, y: -1 });
      this.choicesKey = cacheKey;
    }
    const displayedUnit =
      observed.value.units.find((u) => u.id === unit?.id) ?? observed.value.units.find((u) => u.position?.x === this.selected.x && u.position.y === this.selected.y);
    const brief = renderUnitBrief(
      projection,
      'red',
      this.view === 'all' ? new Set(state.board.terrain.flatMap((row, y) => row.map((_, x) => `${x},${y}`))) : new Set(observed.value.visible.map((p) => `${p.x},${p.y}`)),
      unit?.id,
      this.selected,
      this.weaponSlot,
      canAct,
      this.view === 'all',
    )
      .replace('<h3>', '<h3>' + (displayedUnit ? escapeHtml(armyName(displayedUnit.owner)) + ' · ' : ''))
      .replace('id="unit-brief"', 'id="four-unit-brief"')
      .replace('id="attack-weapon"', 'id="four-attack-weapon"');
    const briefRoot = this.query('#four-brief')!;
    briefRoot.className = displayedUnit?.owner ?? '';
    if (this.briefMarkup !== brief) {
      briefRoot.innerHTML = brief;
      this.briefMarkup = brief;
    }
    if (!this.humanArmy) {
      this.query('#four-mobile-host')!.innerHTML = '';
      return;
    }
    let html = `<p class="card-kicker">COMMAND</p><h2 tabindex="-1">${escapeHtml(armyName(this.humanArmy))} · ${text('あなた', 'You')}</h2>`;
    if (this.replay) html += `<p>${text('リプレイ中は命令できません。', 'Commands are disabled during replay.')}</p>`;
    else if (!state.alive.includes(this.humanArmy))
      html += `<p>${text('自軍は脱落しました。記録を保存するか、残りの対局を観戦できます。', 'Your army was eliminated. Save the record or watch the remaining match.')}</p>${state.outcome.type === 'ongoing' ? `<button id="four-human-watch">${text('残りを観戦', 'Watch the remaining match')}</button>` : ''}`;
    else if (state.outcome.type !== 'ongoing') html += `<p>${text('対局は終了しました。', 'The match has ended.')}</p>`;
    else if (state.paused) html += `<p>${text('100ラウンドの区切りです。CPU進行で次の手番を開始します。', 'Paused at a 100-round boundary. Run CPUs starts the next turn.')}</p>`;
    else if (!this.humanTurn) html += `<p>${text('敵CPUの手番です。停止中はCPU進行で続けられます。', 'Enemy CPU turn. Choose Run CPUs when paused.')}</p>`;
    else if (!canAct) html += `<p>${text('現在は命令できません。記録を書き出して保持してください。', 'Commands are unavailable. Export to keep the record.')}</p>`;
    else {
      html += `<p>${observed.value.player.gold.toLocaleString()} G · ${observed.value.units.filter((u) => u.owner === this.humanArmy).length}/${observed.value.unitLimitPerArmy ?? 16}</p>`;
      html += `<p class="four-human-source">${unit ? escapeHtml(unitNames[unit.kind] + ' ' + unit.id) : text('部隊を選択してください', 'Select a unit')}</p>`;
      if (observed.value.extensions)
        html += `<button id="four-recon" ${observed.value.extensions.recon.remaining > 0 ? '' : 'disabled'}>${text('広域偵察', 'Recon')} ${observed.value.extensions.recon.remaining}/2</button>`;
      if (projection.tactics)
        html += `<p>${text('陸戦統合戦術', 'Land tactics')} · ${weatherAt(projection) === 'rain' ? text('雨：視界−1', 'Rain: vision −1') : text('晴れ', 'Clear')} · ${text('同時射撃・ZOC', 'Simultaneous fire, ZOC')}${unit?.ambush !== undefined ? ' · ' + text('待伏せ準備中', 'Ambush prepared') : ''}</p>`;

      const actions = this.humanChoices.map((choice, i) => {
        if (['move', 'attack-primary', 'attack-secondary', 'produce', 'endTurn'].includes(choice.action)) return '';
        if (this.humanChoices.findIndex((c) => c.action === choice.action) !== i) return '';
        return `<button class="capture" data-human-choice="${i}" data-human-action="${choice.action}">${escapeHtml(this.actionName(choice.action))}</button>`;
      });
      html += renderUnitActionCluster(actions);
      if (source) html += `<button id="four-human-cancel" class="save-action">${text('選択解除', 'Clear selection')} <kbd>Esc</kbd></button>`;
      const preview = this.humanAction
        ? this.actionName(this.humanAction) + ' · ' + text('枠で示した対象を選択', 'Choose an outlined target')
        : this.attackChoice()
          ? this.choiceName(this.attackChoice()!)
          : text('部隊→移動先・敵を選択して操作', 'Select a unit, then a destination or enemy');
      html += `<p id="four-human-preview" class="four-hint" role="status">${escapeHtml(preview)}</p>`;
      const attacks = this.humanChoices.filter((c) => c.command.type === 'attack' && (this.weaponSlot === undefined || c.command.weaponSlot === this.weaponSlot));
      const targets = [...new Set(attacks.map((c) => (c.command.type === 'attack' ? c.command.targetId : '')))];
      if (targets.length)
        html += `<section class="forecast-card"><p class="card-kicker">${text('戦闘予測（確認だけでは攻撃しません）', 'Forecasts (inspect without attacking)')}</p>${targets
          .map((id) => {
            const choices = attacks.filter((c) => c.command.type === 'attack' && c.command.targetId === id);
            const predicted = unit
              ? forecastCombat(
                  projection,
                  unit,
                  projection.units.find((u) => u.id === id)!,
                  this.weaponSlot,
                )
              : undefined;
            const choice = choices.find((c) => c.command.type === 'attack' && predicted?.ok && c.command.weaponSlot === predicted.value.attackWeapon) ?? choices[0]!;
            const target = observed.value.units.find((u) => u.id === id)!;
            return `<button class="save-action four-forecast" data-forecast-target="${escapeHtml(id)}">${escapeHtml(armyName(target.owner) + ' ' + unitNames[target.kind])} · HP ${target.hp} · ${escapeHtml(this.choiceName(choice))}</button>`;
          })
          .join('')}</section>`;

      html += `<button id="four-open-production" class="save-action">${text('生産メニュー', 'Production')}</button>`;
      const end = this.humanChoices.findIndex((c) => c.action === 'endTurn');
      html += `<button class="end-turn" data-human-choice="${end}" data-human-action="endTurn">${text('ターン終了', 'End turn')} →</button>`;
    }
    if (observed.value.rules) {
      const ownView: GameState =
        observed.value.match?.version === 2
          ? {
              ...projection,
              units: projection.units.map((u) => ({ ...u, owner: observed.value.units.find((original) => original.id === u.id)!.owner === viewer ? 'red' : 'blue' })),
              board: {
                ...projection.board,
                terrain: projection.board.terrain.map((row, y) =>
                  row.map((t, x) => ({
                    ...t,
                    owner: observed.value.board.terrain[y]![x]!.owner === undefined ? undefined : observed.value.board.terrain[y]![x]!.owner === viewer ? 'red' : 'blue',
                  })),
                ),
              },
            }
          : projection;
      html += renderLogisticsRoster(ownView, 'red', canAct, unit?.id, 'four-');
    }
    const unacted = canAct ? fourArmyReadyUnits(observed.value) : [];
    if (canAct)
      html += `<section class="unit-queue-card"><div><p class="card-kicker">UNIT STATUS</p><h2>${text('未行動部隊', 'Ready units')} <strong>${unacted.length}</strong></h2></div><ol>${unacted.map((u) => `<li><button class="unit-queue-item" data-four-unit="${escapeHtml(u.id)}"><span class="${u.owner}" aria-hidden="true">${u.owner.slice(-1)}</span>${escapeHtml(unitNames[u.kind])}<em>${u.hp}</em></button></li>`).join('')}</ol><button id="four-next-unit" class="save-action" ${unacted.length ? '' : 'disabled'}>${text('次の未行動部隊', 'Next ready unit')} <kbd>N</kbd></button></section>`;
    if (canAct)
      html += `<section class="turn-setting"><label><input type="checkbox" id="four-confirm-end" ${this.confirmEndTurn ? 'checked' : ''}>${text('未行動部隊がいる時にターン終了を確認する', 'Confirm end turn when ready units remain')}</label></section>`;
    if (this.humanMarkup !== html) {
      panel.innerHTML = html;
      this.humanMarkup = html;
    }
    if (observed.value.rules)
      bindLogisticsRoster(
        panel,
        () => this.paint(),
        (command) => {
          if ((command.type === 'logistics' || command.type === 'repairReserve') && this.humanArmy)
            void this.applyHuman({ action: command.type, command: { ...command, actor: this.humanArmy } });
        },
        (id) => {
          const own = observed.value.units.find((u) => u.id === id && u.owner === this.humanArmy);
          const deployed = own?.position ? own : observed.value.units.find((u) => u.id === own?.embarkedIn && u.owner === this.humanArmy);
          if (deployed?.position) {
            this.clearHuman();
            this.selected = { ...deployed.position };
            this.humanSource = { ...deployed.position };
            this.paint();
            this.locate();
          }
        },
        'four-',
      );
    const showMobile = !this.replay && state.alive.includes(this.humanArmy) && state.outcome.type === 'ongoing';
    const mobile = showMobile
      ? renderMatchActionBar([
          { id: 'four-mobile-next', label: text('未行動', 'Ready'), icon: '▶', enabled: unacted.length > 0, count: unacted.length },
          { command: 'wait', label: text('行動終了', 'Wait'), icon: '✓', enabled: canAct && this.humanChoices.some((choice) => choice.action === 'wait') },
          { command: 'capture', label: text('占領', 'Capture'), icon: '⚑', enabled: canAct && this.humanChoices.some((choice) => choice.action === 'capture') },
          { id: 'four-mobile-production', label: text('生産', 'Build'), icon: '＋', enabled: canAct },
          { id: 'four-mobile-panel', label: text('作戦情報', 'Info'), icon: '☰' },
          canAct
            ? { command: 'endTurn', label: text('ターン終了', 'End turn'), icon: '→', primary: true, enabled: this.humanChoices.some((choice) => choice.action === 'endTurn') }
            : {
                id: 'four-mobile-toggle',
                label: this.running || this.busy ? text('一時停止', 'Pause') : text('CPU進行', 'Run CPUs'),
                primary: true,
                enabled: !this.deps.conflicted() && this.count < FOUR_ARMY_COMMAND_LIMIT,
              },
        ])
      : '';
    const mobileRoot = this.query('#four-mobile-host')!;
    if (this.mobileMarkup !== mobile) {
      mobileRoot.innerHTML = mobile;
      this.mobileMarkup = mobile;
    }
  }
  private openProduction(position?: Position): void {
    if (!this.humanTurn || !this.session || !this.humanArmy || this.busy || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.deps.conflicted()) return;
    const o = observeFourArmy(this.session.state, this.humanArmy);
    if (!o.ok) return;
    const candidates = fourArmyProductionFacilities(o.value);
    const target = position ? candidates.find((p) => p.x === position.x && p.y === position.y) : candidates[0];
    if (!target) {
      if (!position) {
        this.notice = text('生産可能な空き施設がありません。', 'No idle production facility is available.');
        this.paint();
      }
      return;
    }
    this.clearHuman();
    this.selected = { ...target };
    this.production = { ...target };
    this.paint();
    const buttons = fourArmyProductionOptions(o.value, target)
      .map(({ kind, cost, reason }) => {
        const why =
          reason === 'limit'
            ? text('部隊数が上限です', 'Unit limit reached')
            : reason === 'funds'
              ? text(`資金不足（あと ${cost - o.value.player.gold}G）`, `Need ${cost - o.value.player.gold} more gold`)
              : reason
                ? text('この施設では生産できません', 'Unavailable at this facility')
                : text('生産可能', 'Available');
        return `<button class="production-option" data-production-kind="${kind}" ${reason ? 'disabled' : ''}><span>${escapeHtml(unitNames[kind])}</span><strong>${cost.toLocaleString()} G</strong><small>${text('移動', 'Move')} ${unitStats[kind].movement} · ${text('射程', 'Range')} ${unitStats[kind].range.join('–')}</small><small>${escapeHtml(why)}</small></button>`;
      })
      .join('');
    const facilities = `<label>${text('生産先', 'Production facility')}<select id="four-production-facility">${candidates.map((p) => `<option value="${p.x},${p.y}" ${p.x === target.x && p.y === target.y ? 'selected' : ''}>${escapeHtml(terrainNames[o.value.board.terrain[p.y]![p.x]!.kind])} (${p.x + 1}, ${p.y + 1})</option>`).join('')}</select></label><p>${text('空き施設', 'Idle facilities')} ${candidates.length} · ${text('生産後は次の空き施設へ進みます', 'Continues at the next idle facility')}</p>`;
    this.query('#four-production-host')!.innerHTML =
      `<dialog id="four-production-dialog" class="four-production-dialog" aria-modal="true" aria-labelledby="four-production-title"><h2 id="four-production-title">${text('生産メニュー', 'Production')}</h2>${renderProductionCard(facilities, `<p>${o.value.player.gold.toLocaleString()} G · ${o.value.units.filter((u) => u.owner === this.humanArmy).length}/${o.value.unitLimitPerArmy ?? 16}</p>`, buttons)}<button id="four-production-close">${text('閉じる', 'Close')} <kbd>Esc</kbd></button></dialog>`;
    const dialog = this.query<HTMLDialogElement>('#four-production-dialog')!;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.closeProduction();
    });
    this.query<HTMLElement>('#four-production-close')?.focus();
  }
  private closeProduction(focus = true): void {
    const position = this.production;
    this.production = undefined;
    this.query<HTMLDialogElement>('#four-production-dialog')?.close?.();
    this.query('#four-production-host')?.replaceChildren();
    if (focus && position) {
      this.selected = position;
      this.paint();
      this.focusTile();
    }
  }
  private async applyHuman(choice: FourArmyHumanChoice): Promise<void> {
    if (!choice || !this.session || !this.humanTurn || this.busy || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.deps.conflicted()) return;
    if (
      choice.command.type === 'endTurn' &&
      this.confirmEndTurn &&
      this.session.state.units.some((u) => u.owner === this.humanArmy && u.position && !u.hasActed) &&
      !window.confirm(text('未行動部隊が残っています。ターンを終了しますか？', 'Ready units remain. End your turn?'))
    )
      return;
    const command = choice.command;
    if (command.type === 'fortify' && !window.confirm(text('500Gで陣地を設営し、この部隊の行動を終了しますか？', 'Spend 500 gold to fortify and finish this unit’s action?')))
      return;
    const weaponSlot = this.weaponSlot;
    const selectedSource = this.humanSource;
    const before = this.session.state,
      beforeExperience = this.experience,
      position = this.count;
    this.pause(undefined, false);
    if (!this.session.submit(command)) {
      this.notice = text('この命令は実行できません。盤面を確認してください。', 'This command could not be applied. Check the board.');
      this.paint();
      return;
    }
    if (canUndoFourArmyCommand(before, command, this.session.state, this.controllers)) this.undoHistory.push({ position, state: before, experience: beforeExperience });
    else this.undoHistory.clear();
    if (command.type === 'move' || command.type === 'logistics') {
      const moved = this.session.state.units.find((u) => u.id === command.unitId);
      if (moved?.position) {
        this.selected = { ...moved.position };
        this.humanSource = { ...moved.position };
        this.weaponSlot = weaponSlot;
      }
    }
    if (command.type === 'repairReserve') this.humanSource = selectedSource;
    this.captureCheckpoint();
    if (command.type === 'endTurn') this.prepareHandoff();
    this.notice =
      command.type === 'move'
        ? text('移動しました。未知の敵への接触時は途中で停止します。', 'Moved. Contact with an unseen enemy can stop movement early.')
        : text('命令を実行しました。', 'Command applied.');
    this.paint();
    if (this.tacticalScene.active) {
      const generation = this.generation;
      while (this.tacticalScene.active) {
        await this.tacticalScene.finished();
        if (generation !== this.generation || !this.active || this.phase !== 'watch') return;
      }
      this.paint();
    }
    const state = this.session.state;
    if (fourArmyHumanArmies(this.controllers).length > 0 && !fourArmyHumanArmies(this.controllers).some((a) => state.alive.includes(a))) {
      this.notice = text('自軍が脱落しました。残りの対局を観戦できます。', 'Your army was eliminated. You can watch the remaining match.');
      this.paint();
      return;
    }
    if (!state.paused && state.outcome.type === 'ongoing' && !this.rawHumanTurn) await this.play();
  }
  private renderConcealed(): void {
    this.clearFeedback();
    this.clearHuman();
    this.boardInput.update(null);
    this.boardView.update(null, [], 'four-army');
    const actor = this.session?.state.round.order[this.session.state.round.index];
    if (!this.concealedRendered) {
      this.root.innerHTML = `<header class="four-header"><h1 id="four-heading" tabindex="-1">${text(this.displayedArmies.length + '軍対局', this.displayedArmies.length + '-army match')}</h1>${this.deps.onTitle ? `<button id="four-title">${text('タイトルへ', 'Title')}</button>` : ''}<button id="four-close">${text('戻る', 'Back')}</button></header><section class="four-handoff"><h2 id="four-handoff-title" tabindex="-1"></h2><p>${text('端末を交代してください。盤面は次の操作開始まで表示しません。', 'Pass the device. The board stays hidden until the next player starts.')}</p><button id="four-handoff-start" class="four-primary">${text('操作を開始', 'Start turn')}</button><button id="four-toggle" class="four-primary"></button><button id="four-menu">${text('開始条件・保存', 'Setup and saves')}</button></section>`;
      this.concealedRendered = true;
      this.query<HTMLElement>('#four-handoff-title')?.focus();
    }
    this.query('#four-handoff-title')!.textContent = this.session?.state.paused
      ? text('100ラウンドの区切りです', 'Paused at a 100-round boundary')
      : this.rawHumanTurn && actor
        ? text(`${armyName(actor)}の番です`, `${armyName(actor)}'s turn`)
        : text('CPUの手番です', 'CPU turn');
    this.query<HTMLButtonElement>('#four-handoff-start')!.hidden = !this.rawHumanTurn;
    const play = this.query<HTMLButtonElement>('#four-toggle')!;
    play.hidden = this.rawHumanTurn;
    play.textContent = this.running || this.busy ? text('一時停止', 'Pause') : text('CPUを続ける', 'Continue CPUs');
    play.setAttribute('aria-pressed', String(this.running || this.busy));
    play.disabled = this.deps.conflicted();
    this.query<HTMLButtonElement>('#four-handoff-start')!.disabled = this.deps.conflicted();
    this.applyMusic();
    this.ensureAutosave();
  }
  private selection(display: FourArmyDisplay): void {
    const p = this.selected,
      tile = display.board.terrain[p.y]![p.x]!,
      u = display.units.find((u) => u.position?.x === p.x && u.position.y === p.y),
      seen = !display.visible || display.visible.has(`${p.x},${p.y}`);
    let info = `(${p.x + 1}, ${p.y + 1}) ${terrainNames[tile.kind]}${tile.owner ? ' · ' + armyName(tile.owner) : ''}`;
    if (!seen) info += ' · ' + text('未索敵', 'Unseen');
    if (u) {
      info += ` · ${armyName(u.owner)} ${unitNames[u.kind]} ${u.id} · HP ${u.hp}`;
      if (this.view === 'all' || u.owner === this.view)
        info += ` · ${text('燃料', 'Fuel')} ${u.fuel ?? '—'} · ${text('弾薬', 'Ammo')} ${u.ammo ?? '—'}${u.supplyStock !== undefined ? ' · ' + text('物資', 'Stock') + ' ' + u.supplyStock : ''}`;
      else info += ' · ' + text('兵站情報非公開', 'Logistics hidden');
    }
    this.query('#four-selection')!.textContent = info;
  }
}
