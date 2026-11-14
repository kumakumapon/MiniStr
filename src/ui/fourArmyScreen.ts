import { BoardInput } from './boardInput';
import { BoardView } from './boardView';
import { nextBoardPosition } from './boardNavigation';
import { BOARD_ZOOM_LEVELS, boardTileSize, boardZoomPercent, clampBoardZoomIndex } from './boardZoom';
import { fourArmyBoardCells } from './fourArmyBattleView';
import { fourArmyPlanningView } from '../ai/fourArmyObservation';
import { enemyThreatPreview, type ThreatPreview } from '../game/threat';
import { forecastCombat } from '../game/combat';
import { productionKindsForRule } from '../game/facilities';
import type { WeaponSlot } from '../game/units';
import { renderUnitBrief } from './unitBrief';
import { renderProductionCard, renderUnitActionCluster } from './overlays';
import { fourArmyHumanChoices, type FourArmyHumanChoice, type FourArmyHumanAction } from './fourArmyHuman';
import { unitStats } from '../game/units';
import './fourArmyScreen.css';
import { FOUR_ARMY_CPU_VERSION, type FourArmyCpuVersion } from '../ai/fourArmyCpuVersion';
import type { FourArmyCheckpoint } from '../game/fourArmyArchive';
import { FOUR_ARMY_IDS, type FourArmyId } from '../game/fourArmyFoundation';
import { createFourArmyMap32 } from '../game/fourArmyMap32';
import { createFourArmyState, observeFourArmy, type FourArmyMap, type FourArmyCommand, type FourArmyState } from '../game/fourArmyEngine';
import { defaultFourArmyCpuSettings, isFourArmyCpuSettings, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import {
  FOUR_ARMY_COMMAND_LIMIT,
  FOUR_ARMY_CHECKPOINT_INTERVAL,
  FOUR_ARMY_FILE_BYTES,
  FOUR_ARMY_SAVE_KEYS,
  fourArmySlotName,
  isFourArmyView,
  type FourArmySpectatorSave,
  type FourArmyView,
} from '../game/fourArmySpectatorSave';
import { exportBackup } from '../game/backup';
import type { StorageLike } from '../game/session';
import type { Position } from '../game/types';
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

const text = (ja: string, en: string) => (getLocale() === 'en' ? en : ja);
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
  onClose: () => void;
  onLocale: (locale: 'ja' | 'en') => void;
  onGesture: () => void;
  createSession?: (state: FourArmyState, settings: FourArmyCpuSettings, cpuVersion: FourArmyCpuVersion, humanArmy?: FourArmyId) => FourArmyCpuSession;
  codec?: FourArmyFileCodec;
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
  private setupMode: 'spectator' | 'human' = 'spectator';
  private setupHuman: FourArmyId = 'army1';
  private humanArmy?: FourArmyId;
  private humanSource?: Position;
  private humanAction?: FourArmyHumanAction;
  private weaponSlot?: WeaponSlot;
  private production?: Position;
  private choicesKey = '';
  private threat?: ThreatPreview;
  private threatKey = '';
  private boardView = new BoardView();
  private boardInput = new BoardInput();
  private humanChoices: FourArmyHumanChoice[] = [];
  private settings = defaultFourArmyCpuSettings();
  private cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION;
  private order: FourArmyId[] = [...FOUR_ARMY_IDS];
  private seed = '1512';
  private name = '';
  private view: FourArmyView = 'all';
  private speed: CommandSpeed = 1;
  private selected: Position = { x: 3, y: 3 };
  private zoomIndex = 2;
  private cell = boardTileSize(this.zoomIndex);
  private confirmEndTurn = true;
  private generation = 0;
  private running = false;
  private busy = false;
  private notice = '';
  private savedSignature = '';
  private verifiedRecord?: { signature: string; text: string };
  private scheduler = new CommandScheduler();
  private codec: FourArmyFileCodec;
  private importMode: 'resume' | 'replay' = 'resume';
  constructor(private deps: Dependencies) {
    this.codec = deps.codec ?? new FourArmyFileCodec();
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
      if (v.id === 'four-confirm-end') return;
      if (v.id === 'four-name') this.name = v.value;
      else if (v.id === 'four-seed') this.seed = v.value;
    });
    this.root.addEventListener('keydown', (e) => this.key(e));
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
  get active(): boolean {
    return !this.root.hidden;
  }
  private get count(): number {
    return this.prefix.length + (this.session?.commandCount ?? 0);
  }
  private signature(): string {
    return [this.count, this.name, JSON.stringify(this.settings), this.humanArmy ?? 'spectator', this.view, this.speed].join('|');
  }
  private get dirty(): boolean {
    return !!this.session && this.signature() !== this.savedSignature;
  }
  open(): void {
    this.deps.onOpen();
    this.root.hidden = false;
    this.phase = 'menu';
    this.notice = '';
    this.shell();
  }
  refreshStorage(): void {
    if (this.deps.conflicted())
      this.pause(text('別タブで保存が変更されました。書き出してから再読み込みしてください。', 'Saved data changed in another tab. Export before reloading.'));
    else this.paint();
  }
  private get humanTurn(): boolean {
    const state = this.session?.state;
    return !!state && !this.replay && !!this.humanArmy && !state.paused && state.outcome.type === 'ongoing' && state.round.order[state.round.index] === this.humanArmy;
  }
  private get lockedView(): boolean {
    const state = this.session?.state;
    return !!state && !!this.humanArmy && state.outcome.type === 'ongoing' && state.alive.includes(this.humanArmy);
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
  private pause(message?: string): void {
    this.clearHuman();
    this.generation++;
    this.scheduler.cancel();
    this.codec.cancel();
    this.replay?.cancel();
    this.session?.pause();
    this.running = false;
    this.busy = false;
    if (message !== undefined) this.notice = message;
    if (this.active) this.paint();
  }
  private replaceAllowed(): boolean {
    return (
      !this.dirty ||
      window.confirm(text('未保存の4軍対局を置き換えますか？必要な記録は先に保存・書き出ししてください。', 'Replace the unsaved four-army match? Save or export the record first.'))
    );
  }
  private leave(): void {
    this.pause();
    if (!this.replaceAllowed()) return;
    this.session?.stop();
    this.session = undefined;
    this.replay = undefined;
    this.map = undefined;
    this.prefix = [];
    this.checkpoints = [];
    this.verifiedRecord = undefined;
    this.root.replaceChildren();
    this.savedSignature = '';
    this.root.hidden = true;
    this.deps.onClose();
  }
  private start(): void {
    if (!/^\d{1,10}$/.test(this.seed) || Number(this.seed) > 0xffffffff) {
      this.notice = text('seedは0〜4294967295の整数を入力してください。', 'Enter an integer seed from 0 to 4294967295.');
      this.paint();
      return;
    }
    const made = createFourArmyMap32(Number(this.seed), this.order, 1);
    if (!made.ok) {
      this.notice = text('手番には4軍を1回ずつ指定してください。', 'Use each army exactly once in the turn order.');
      this.paint();
      return;
    }
    if (!this.replaceAllowed()) return;
    const state = createFourArmyState(made.value);
    if (!state.ok) {
      this.notice = state.error;
      this.paint();
      return;
    }
    this.install(made.value, state.value, [], [], FOUR_ARMY_CPU_VERSION, this.setupMode === 'human' ? this.setupHuman : undefined);
    this.view = this.humanArmy ?? 'all';
    this.name = text('四方の前線', 'Four Fronts');
    this.savedSignature = '';
    this.notice = this.humanTurn
      ? text('あなたの手番です。自軍の部隊または施設を選択してください。', 'Your turn. Select your unit or facility.')
      : text('停止中です。再生または1手進めるを選んでください。', 'Paused. Choose Play or Step.');
    this.shell();
  }
  private install(
    map: FourArmyMap,
    state: FourArmyState,
    commands: readonly FourArmyCommand[],
    checkpoints: FourArmyCheckpoint[] = [],
    cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION,
    humanArmy?: FourArmyId,
  ): void {
    this.pause();
    this.session?.stop();
    this.map = structuredClone(map);
    this.prefix = structuredClone([...commands]);
    this.checkpoints = checkpoints;
    this.verifiedRecord = undefined;
    this.replay = undefined;
    this.cpuVersion = cpuVersion;
    this.humanArmy = humanArmy;
    this.session = this.deps.createSession?.(state, this.settings, cpuVersion, humanArmy) ?? createFourArmyCpuSession(state, this.settings, cpuVersion, humanArmy);
    this.phase = 'watch';
    this.zoomIndex = 2;
    this.cell = boardTileSize(this.zoomIndex);
    this.selected = { ...map.capitals[humanArmy ?? 'army1'] };
  }
  private async play(): Promise<void> {
    if (!this.session || this.deps.conflicted()) return;
    if (this.running || this.busy) {
      this.pause(text('一時停止しました。', 'Paused.'));
      return;
    }
    if (this.replay?.position === this.replay?.commands.length && this.replay) return;
    if (!this.replay && (this.humanTurn || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session.state.outcome.type !== 'ongoing')) return;
    this.pause();
    const generation = this.generation;
    this.running = true;
    this.notice = '';
    if (!this.replay) {
      this.session.resume();
      this.captureCheckpoint();
    }
    if (this.humanTurn) {
      this.pause();
      return;
    }
    this.scheduler.start({ initialDelayMs: 450 / this.speed, nextDelayMs: () => 450 / this.speed, step: () => this.advance(generation) });
    this.paint();
  }
  private async advance(generation: number): Promise<boolean> {
    if (generation !== this.generation || !this.session) return false;
    const humanWasAlive = !!this.humanArmy && this.session.state.alive.includes(this.humanArmy);
    this.busy = true;
    this.paintControls();
    try {
      if (this.replay) {
        await this.replay.seek(this.replay.position + 1);
      } else if (this.count < FOUR_ARMY_COMMAND_LIMIT) await this.session.step();
      if (generation !== this.generation) return false;
      if (!this.replay) this.captureCheckpoint();
      this.busy = false;
      const state = this.replay?.state ?? this.session.state;
      if (!this.replay && humanWasAlive && this.humanArmy && !state.alive.includes(this.humanArmy))
        this.pause(text('自軍が脱落しました。残りの対局を観戦できます。', 'Your army was eliminated. You can watch the remaining match.'));
      else if (this.humanTurn) this.pause();
      else if (this.replay && this.replay.position === this.replay.commands.length) this.pause(text('リプレイの終端です。', 'End of replay.'));
      else if (!this.replay && state.paused)
        this.pause(text('100ラウンドの区切りで停止しました。再生で次の手番を開始します。', 'Paused at the 100-round boundary. Play starts the next turn.'));
      else if (!this.replay && state.outcome.type !== 'ongoing')
        this.pause(text('対局は終了しました。記録を保存・再生できます。', 'The match has ended. You can save or replay the record.'));
      else if (!this.replay && this.count >= FOUR_ARMY_COMMAND_LIMIT)
        this.pause(text('記録の上限に達しました。保存・書き出しで記録を保持できます。', 'The record limit was reached. Save or export to keep the record.'));
      this.paint();
      return this.running;
    } catch {
      if (generation === this.generation) this.pause(text('CPUの処理に失敗したため停止しました。再生で再試行できます。', 'CPU processing failed. Paused; choose Play to retry.'));
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
    if (this.humanTurn) {
      this.pause();
      return;
    }
    const generation = this.generation;
    await this.advance(generation);
    if (generation === this.generation) this.session.pause();
  }
  private async seek(position: number): Promise<void> {
    if (!this.replay) return;
    this.pause();
    const generation = this.generation;
    this.busy = true;
    this.paintControls();
    try {
      await this.replay.seek(position);
      if (generation === this.generation) {
        this.busy = false;
        this.paint();
      }
    } catch {
      if (generation === this.generation) this.pause(text('リプレイを再現できませんでした。', 'The replay could not be reconstructed.'));
    }
  }
  private snapshot(): FourArmySpectatorSave {
    if (!this.session || !this.map) throw Error('No four-army match');
    return {
      ...(this.humanArmy ? { format: 'ministr-four-army-match' as const, humanArmy: this.humanArmy } : { format: 'ministr-four-army-spectator' as const }),
      schemaVersion: 2,
      cpuVersion: this.cpuVersion,
      name: this.name.trim() || text('四方の前線', 'Four Fronts'),
      savedAt: new Date().toISOString(),
      settings: structuredClone(this.settings),
      view: this.view,
      speed: this.speed,
      archive: {
        format: 'ministr-four-army-save',
        schemaVersion: 2,
        ruleset: 'four-army-v2',
        payload: { map: this.map, commands: [...this.prefix, ...this.session.commands], state: this.session.state },
      },
    };
  }
  private captureCheckpoint(): void {
    if (this.session && this.count > 0 && this.count % FOUR_ARMY_CHECKPOINT_INTERVAL === 0 && this.checkpoints.at(-1)?.position !== this.count)
      this.checkpoints.push({ position: this.count, state: this.session.state });
  }
  private verificationProgress(done: number, total: number): void {
    this.notice = text('履歴を検証中', 'Verifying history') + ` ${done.toLocaleString()}/${total.toLocaleString()}`;
    const notice = this.root.querySelector('#four-notice');
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
    this.pause();
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
    if (!this.replaceAllowed()) {
      this.paint();
      return;
    }
    const saved = result.value.save;
    this.settings = structuredClone(saved.settings);
    this.speed = saved.speed;
    this.name = saved.name;
    this.seed = String(saved.archive.payload.map.seed);
    this.order = [...saved.archive.payload.map.order];
    this.install(
      saved.archive.payload.map,
      saved.archive.payload.state,
      saved.archive.payload.commands,
      result.value.checkpoints,
      saved.cpuVersion,
      saved.format === 'ministr-four-army-match' ? saved.humanArmy : undefined,
    );
    this.view = saved.view;
    this.setupMode = this.humanArmy ? 'human' : 'spectator';
    this.setupHuman = this.humanArmy ?? 'army1';
    this.savedSignature = this.signature();
    if (mode === 'replay') this.replay = new FourArmyReplay(this.map!, [...this.prefix], this.checkpoints);
    this.notice = text('停止状態で読み込みました。', 'Loaded and paused.');
    this.shell();
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
        if (choice) await this.applyHuman(choice);
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
      this.root.querySelector<HTMLElement>('#four-human-panel')?.scrollIntoView({ block: 'start' });
      this.root.querySelector<HTMLElement>('#four-human-panel h2')?.focus({ preventScroll: true });
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
    if (id === 'four-close') {
      this.leave();
      return;
    }
    if (id === 'four-start') {
      this.start();
      return;
    }
    if (id === 'four-return' && this.session) {
      this.pause();
      this.phase = 'watch';
      this.shell();
      return;
    }
    if (id === 'four-menu') {
      this.pause();
      this.replay = undefined;
      this.phase = 'menu';
      this.shell();
      return;
    }
    if (id === 'four-toggle') {
      await this.play();
      return;
    }
    if (id === 'four-step') {
      await this.step();
      return;
    }
    if (id === 'four-upgrade-cpu' && this.session && this.map && !this.replay && this.cpuVersion !== FOUR_ARMY_CPU_VERSION) {
      this.pause();
      this.install(this.map, this.session.state, [...this.prefix, ...this.session.commands], this.checkpoints, FOUR_ARMY_CPU_VERSION, this.humanArmy);
      this.savedSignature = '';
      this.notice = text(
        '履歴を保持して改善版CPUへ切り替えました。停止状態です。保存すると切替後の判断を使います。',
        'Switched to the improved CPU, retaining the record. Paused; saving preserves the new CPU choice.',
      );
      this.shell();
      return;
    }
    if (id === 'four-replay' && this.session && this.map) {
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
    if (id === 'four-export' || button.hasAttribute('data-storage-write-export')) {
      await this.save();
      return;
    }
    if (id === 'four-import' || id === 'four-import-replay') {
      this.pause();
      this.importMode = id === 'four-import' ? 'resume' : 'replay';
      this.root.querySelector<HTMLInputElement>('#four-file')!.click();
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
      this.zoomIndex = clampBoardZoomIndex(this.zoomIndex + (id === 'four-zoom-in' ? 1 : -1));
      this.cell = boardTileSize(this.zoomIndex);
      this.paint();
      return;
    }
    if (id === 'four-fit') {
      this.fit();
      this.paint();
      return;
    }
    if (id === 'four-locate') {
      const select = this.root.querySelector<HTMLSelectElement>('#four-unit');
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
    if (input.id === 'four-confirm-end') {
      this.confirmEndTurn = input.checked;
      return;
    }
    if (input.id === 'four-attack-weapon') {
      this.weaponSlot = input.value === '0' ? 0 : input.value === '1' ? 1 : undefined;
      this.paint();
      this.root.querySelector<HTMLElement>('#four-attack-weapon')?.focus({ preventScroll: true });
      return;
    }
    if (input.id === 'four-file') {
      await this.file(input);
      return;
    }
    if (input.id === 'four-locale' && (input.value === 'ja' || input.value === 'en')) {
      this.pause();
      this.deps.onLocale(input.value);
      this.shell();
      return;
    }
    if (input.id === 'four-mode' && (input.value === 'human' || input.value === 'spectator')) {
      this.setupMode = input.value;
      this.shell();
      return;
    }
    if (input.id === 'four-human-army' && FOUR_ARMY_IDS.some((a) => a === input.value)) {
      this.setupHuman = input.value as FourArmyId;
      return;
    }
    if (input.id === 'four-view' && isFourArmyView(input.value)) {
      if (this.lockedView) {
        input.value = this.humanArmy!;
        return;
      }
      this.view = input.value;
      this.pause();
      this.paint();
      return;
    }
    if (input.id === 'four-speed') {
      const speed = parseCommandSpeed(input.value);
      if (speed) {
        this.pause();
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
        this.pause();
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
    const next = nextBoardPosition(this.selected, 32, 32, e.key);
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
    this.zoomIndex = 0;
    this.cell = boardTileSize(this.zoomIndex);
  }
  private focusTile(): void {
    this.root.querySelector<HTMLElement>(`#four-board > [data-x="${this.selected.x}"][data-y="${this.selected.y}"]`)?.focus({ preventScroll: true });
  }
  private locate(): void {
    const viewport = this.root.querySelector<HTMLElement>('.four-map-viewport');
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
    return FOUR_ARMY_IDS.map(
      (a) =>
        `<div class="four-setting-row"><strong class="four-army-label ${a}">${armyName(a)}</strong><label>${text('難易度', 'Difficulty')}<select id="four-difficulty-${a}" data-army="${a}" data-setting="difficulty">${options(['easy', 'normal', 'hard'], this.settings[a].difficulty, [text('易しい', 'Easy'), text('普通', 'Normal'), text('難しい', 'Hard')])}</select></label><label>${text('方針', 'Policy')}<select id="four-policy-${a}" data-army="${a}" data-setting="policy">${options(['balanced', 'offensive', 'defensive'], this.settings[a].policy, [text('均衡', 'Balanced'), text('攻勢', 'Offensive'), text('守勢', 'Defensive')])}</select></label></div>`,
    ).join('');
  }
  private fileTools(): string {
    return `<details class="four-tools"><summary>${text('保存・リプレイ', 'Saves & replay')}</summary><label>${text('記録名', 'Record name')}<input id="four-name" maxlength="40" value="${escapeHtml(this.name)}"></label><div class="four-buttons">${FOUR_ARMY_SAVE_KEYS.map((_, i) => `<button data-save-slot="${i}">${text(`保存${i + 1}へ保存`, `Save to slot ${i + 1}`)}</button>`).join('')}<button id="four-export">${text('JSONを書き出す', 'Export JSON')}</button><button id="four-import">${text('JSONから再開', 'Import match')}</button><button id="four-import-replay">${text('JSONをリプレイ', 'Import replay')}</button><button id="four-backup">${text('全データをバックアップ', 'Back up all data')}</button></div><div id="four-slots"></div><p class="four-hint">${text('4軍専用の2枠です。通常の対局・研究保存を上書きしません。記録は65,536命令・8MBまで。ブラウザーの空き容量により保存できない場合はJSONを書き出してください。', 'Two dedicated four-army slots. Normal and research saves stay separate. Records support up to 65,536 commands and 8MB. Export JSON if browser storage is full.')}</p></details><input id="four-file" type="file" accept=".json,application/json" hidden>`;
  }
  private shell(): void {
    const focus = (document.activeElement as HTMLElement | null)?.id;
    const head = `<header class="four-header command-bar"><div><p class="four-kicker">MINISTR / FOUR FRONTS</p><h1 id="four-heading" tabindex="-1">${text('4軍対局・観戦', 'Four-army play & watch')}</h1></div><label>${text('言語', 'Language')}<select id="four-locale"><option value="ja" ${getLocale() === 'ja' ? 'selected' : ''}>日本語</option><option value="en" ${getLocale() === 'en' ? 'selected' : ''}>English</option></select></label><button id="four-close">${text('タイトルへ', 'Title')}</button></header><div id="four-storage"></div><p id="four-notice" role="status"></p>`;
    if (this.phase === 'menu')
      this.root.innerHTML =
        head +
        `<section class="four-setup"><div class="four-brief"><p class="four-kicker">32 × 32 / FOUR ARMIES</p><h2>${text('四方の前線', 'Four Fronts')}</h2><p>${text('4軍すべてが敵対。司令部または全部隊を失うと脱落し、最後の1軍が勝利します。', 'All four armies are hostile. Losing a headquarters or all units eliminates an army; the last army wins.')}</p><p>${text('各軍8部隊・基本資金10,000。搭載を含む上限16部隊。100ラウンドごとに停止して再開できます。', 'Each army starts with 8 units and 10,000 gold. The cap is 16 including cargo. Play pauses every 100 rounds and can resume.')}</p><label>${text('対局方式', 'Mode')}<select id="four-mode">${options(['spectator', 'human'], this.setupMode, [text('CPU観戦', 'Watch CPUs'), text('1軍を操作・敵CPU3軍', 'Play one army vs three CPUs')])}</select></label><label>${text('操作する軍', 'Your army')}<select id="four-human-army" ${this.setupMode === 'spectator' ? 'disabled' : ''}>${options(FOUR_ARMY_IDS, this.setupHuman, FOUR_ARMY_IDS.map(armyName))}</select></label><label>${text('seed', 'Seed')}<input id="four-seed" inputmode="numeric" maxlength="10" value="${escapeHtml(this.seed)}"></label><fieldset><legend>${text('手番順', 'Turn order')}</legend><div class="four-order">${this.order.map((a, i) => `<label>${i + 1}<select id="four-order-${i}" data-order="${i}">${options(FOUR_ARMY_IDS, a, FOUR_ARMY_IDS.map(armyName))}</select></label>`).join('')}</div></fieldset><div class="four-buttons"><button id="four-start" class="four-primary">${this.setupMode === 'human' ? text('4軍対局を開始', 'Start four-army play') : text('4軍観戦を開始', 'Start four-army match')}</button>${this.session ? `<button id="four-return">${text('進行中の対局へ戻る', 'Return to match')}</button>` : ''}</div></div><section><h2>${text('軍別CPU設定', 'Army CPU settings')}</h2>${this.settingsForm()}<p class="four-hint">${text('参加対局は自軍視界で1軍を操作し、敵3軍はCPUです。CPU観戦も選べます。設定変更は一時停止します。', 'Play one army with its own view against three CPUs, or watch all CPUs. Setting changes pause play.')}</p>${this.fileTools()}</section></section>`;
    else
      this.root.innerHTML =
        head +
        `<section class="four-toolbar" aria-label="${text('観戦操作', 'Spectator controls')}"><button id="four-toggle" class="four-primary"></button><button id="four-step">${text('1手進める', 'Step')}</button><label>${text('速度', 'Speed')}<select id="four-speed">${options(
          COMMAND_SPEEDS.map(String),
          String(this.speed),
          COMMAND_SPEEDS.map((s) => s + '×'),
        )}</select></label><label>${text('視点', 'View')}<select id="four-view">${options(['all', ...FOUR_ARMY_IDS], this.view, [text('全体表示', 'Whole board'), ...FOUR_ARMY_IDS.map(armyName)])}</select></label><button id="four-menu">${text('開始条件', 'Setup')}</button><button id="four-replay">${text('記録を再生', 'Replay record')}</button></section><p id="four-turn" class="four-turn"></p><details class="four-armies"><summary>${text('軍別情報', 'Army information')}</summary><div id="four-army-info"></div></details><div class="four-layout battle-layout"><section class="four-map-panel battlefield-wrap theme-temperate"><div class="four-map-heading"><h2>${text('四方の前線', 'Four Fronts')}</h2><div class="four-buttons"><button id="four-zoom-out" aria-label="${text('盤面を縮小', 'Zoom out')}">−</button><button id="four-fit">${text('縮小', 'Overview')}</button><span id="four-zoom-label" aria-live="polite"></span><button id="four-zoom-in" aria-label="${text('盤面を拡大', 'Zoom in')}">＋</button></div></div><div id="four-brief"></div><div class="four-map-viewport board-viewport"><div id="four-board" class="board" tabindex="-1" role="group" aria-label="${text('4軍対局盤面', 'Four-army board')}" aria-describedby="four-selection"></div></div><p class="four-hint">${text('部隊→移動先・敵をタップして操作。矢印で移動、Enter／Spaceで操作、Nで次の未行動部隊、Escで選択取消。盤面は縦横にスクロールできます。', 'Select a unit, then tap a destination or enemy. Arrows navigate; Enter/Space act; N selects the next ready unit; Esc clears selection. Scroll to explore the board.')}</p></section><aside class="four-inspector command-panel"><section id="four-human-panel" class="four-human" aria-label="${text('自軍操作', 'Your army controls')}" hidden></section><section><h2>${text('選択情報', 'Selection')}</h2><output id="four-selection"></output><label>${text('表示中の部隊', 'Visible units')}<select id="four-unit"></select></label><button id="four-locate">${text('部隊へ移動', 'Locate unit')}</button></section><details><summary>${text('軍別CPU設定', 'Army CPU settings')}${this.replay ? text('（保存時）', ' (at save)') : ''}</summary>${this.settingsForm()}${!this.map?.pathVersion ? `<p class="four-hint">${text('この保存の移動・接触規則を維持しています。回転に対応した新規則は新しい対局で使います。', 'This record retains its movement and contact rules. New matches use the rotation-consistent rules.')}</p>` : ''}${this.cpuVersion !== FOUR_ARMY_CPU_VERSION ? `<p class="four-hint">${text('旧保存のCPU判断を維持しています。切り替えると、この先の判断に改善版を使います。元の保存は再保存するまで変わりません。', 'This record retains its original CPU. Switching changes future decisions; the saved original is kept until you save again.')}</p>${!this.replay ? `<button id="four-upgrade-cpu">${text('改善版CPUへ切り替え', 'Use improved CPU')}</button>` : ''}` : ''}</details>${this.fileTools()}</aside></div>${this.replay ? `<section class="four-replay-controls"><strong>${text('リプレイ', 'Replay')}</strong><button id="four-replay-start">|◀</button><button id="four-previous">◀</button><label>${text('命令位置', 'Command position')}<input id="four-position" type="range" min="0" max="${this.replay.commands.length}" value="${this.replay.position}"></label><output id="four-replay-count"></output><button id="four-replay-end">▶|</button><button id="four-replay-close">${text('対局へ戻る', 'Return to match')}</button></section>` : ''}`;
    if (this.phase === 'watch') {
      this.root.insertAdjacentHTML('beforeend', '<div id="four-mobile-host"></div><div id="four-production-host"></div>');
    } else this.boardInput.update(null);
    this.slots();
    this.paint();
    if (this.phase === 'watch') this.locate();
    (focus ? document.getElementById(focus) : null)?.focus({ preventScroll: true });
    if (!this.root.contains(document.activeElement)) this.root.querySelector<HTMLElement>('#four-heading')?.focus({ preventScroll: true });
  }
  private slots(): void {
    const root = this.root.querySelector('#four-slots');
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
    const button = this.root.querySelector<HTMLButtonElement>('#four-toggle');
    if (button) {
      // Keep the native button target stable between pointerdown and click during CPU updates.
      const label = this.running || this.busy ? text('一時停止', 'Pause') : text('再生', 'Play');
      if (button.textContent !== label) button.textContent = label;
      const pressed = String(this.running || this.busy);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      button.disabled =
        !!this.session && (this.deps.conflicted() || (!this.replay && (this.humanTurn || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session.state.outcome.type !== 'ongoing')));
    }
    const step = this.root.querySelector<HTMLButtonElement>('#four-step');
    if (step)
      step.disabled =
        this.busy ||
        this.running ||
        this.deps.conflicted() ||
        (!this.replay && (this.humanTurn || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session?.state.outcome.type !== 'ongoing')) ||
        (!!this.replay && this.replay.position >= this.replay.commands.length);
    this.root.querySelectorAll<HTMLButtonElement>('[data-save-slot]').forEach((b) => (b.disabled = !this.session || this.busy || !this.deps.writable()));
    const exp = this.root.querySelector<HTMLButtonElement>('#four-export');
    if (exp) exp.disabled = !this.session || this.busy;
    const view = this.root.querySelector<HTMLSelectElement>('#four-view');
    if (view) {
      view.disabled = this.lockedView;
      view.value = this.view;
    }
    this.root.querySelectorAll<HTMLSelectElement>('[data-setting]').forEach((s) => (s.disabled = !!this.replay));
  }
  private paint(): void {
    this.root.dataset.recordCount = String(this.count);
    this.root.dataset.checkpoints = String(this.checkpoints.length);
    this.root.dataset.replayStates = String(this.replay?.cachedStates ?? 0);
    const notice = this.root.querySelector('#four-notice');
    if (notice) notice.textContent = this.notice;
    const storage = this.root.querySelector('#four-storage');
    if (storage)
      storage.innerHTML = this.deps.persistent()
        ? renderStorageWriterNotice(this.deps.writerState())
        : `<p class="four-hint">${text('このタブ内だけに保存します。終了前にJSONを書き出してください。', 'Saves last only in this tab. Export JSON before closing.')}</p>`;
    if (this.lockedView) this.view = this.humanArmy!;
    this.paintControls();
    if (this.phase !== 'watch' || !this.session) return;
    const state = this.replay?.state ?? this.session.state,
      display = fourArmyDisplay(state, this.view),
      actor = state.round.order[state.round.index]!;
    const turn = this.root.querySelector('#four-turn')!;
    turn.textContent = `${text('ラウンド', 'Round')} ${state.round.round} · ${armyName(actor)} · ${this.running ? text('再生中', 'Playing') : this.busy ? text('処理中', 'Working') : text('停止中', 'Paused')} · ${this.replay ? this.replay.position : this.count} ${text('命令', 'commands')}${state.outcome.type === 'victory' ? ' · ' + armyName(state.outcome.winner) + ' ' + text('勝利', 'wins') : state.outcome.type === 'draw' ? ' · ' + text('引き分け', 'Draw') : ''}`;
    if (this.humanArmy)
      turn.textContent +=
        ' · ' +
        armyName(this.humanArmy) +
        (state.outcome.type === 'victory' && state.outcome.winner === this.humanArmy
          ? text('（あなたの勝利）', ' (You win)')
          : !state.alive.includes(this.humanArmy)
            ? text('（あなたは敗北）', ' (You lost)')
            : this.humanTurn
              ? text('（あなたの手番）', ' (Your turn)')
              : text('（あなた）', ' (You)'));
    turn.className = 'four-turn ' + actor;
    this.paintHuman();
    this.root.querySelector('#four-army-info')!.innerHTML = FOUR_ARMY_IDS.map((a) => {
      const p = display.players[a],
        count = display.units.filter((u) => u.owner === a).length;
      return `<div class="four-army-label ${a}"><strong>${armyName(a)} ${a === actor ? '◀' : ''}</strong><span>${state.alive.includes(a) ? text('生存', 'Active') : text('脱落', 'Eliminated')}</span><span>${this.view === 'all' || this.view === a ? count + '/16' : text('視認 ', 'Seen ') + count}</span><span>${p ? `${p.gold.toLocaleString()} G · +${p.income.toLocaleString()}` : text('資金非公開', 'Funds hidden')}</span></div>`;
    }).join('');
    const board = this.root.querySelector<HTMLElement>('#four-board')!;
    board.style.gridTemplateColumns = `repeat(${display.board.width}, ${this.cell}px)`;
    board.style.gridAutoRows = `${this.cell}px`;
    this.boardView.update(board, fourArmyBoardCells(display, this.selected, this.humanSource, this.humanChoices, this.humanAction, this.threat), 'four-army');
    this.boardInput.update(this.root.querySelector<HTMLElement>('#four-board'), {
      click: (p) => {
        this.selected = p;
        void this.chooseHumanTile();
      },
      key: (e) => this.key(e),
      focus: (p) => {
        if (this.selected.x === p.x && this.selected.y === p.y) return;
        this.selected = p;
        this.paint();
      },
    });
    const zoom = this.root.querySelector('#four-zoom-label');
    if (zoom) zoom.textContent = boardZoomPercent(this.zoomIndex) + '%';
    this.root.querySelector<HTMLButtonElement>('#four-zoom-out')!.disabled = this.zoomIndex === 0;
    this.root.querySelector<HTMLButtonElement>('#four-zoom-in')!.disabled = this.zoomIndex === BOARD_ZOOM_LEVELS.length - 1;
    this.selection(display);
    const select = this.root.querySelector<HTMLSelectElement>('#four-unit')!,
      previous = select.value;
    const unitOptions = display.units
      .filter((u) => u.position)
      .map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(armyName(u.owner) + ' ' + unitNames[u.kind] + ' ' + u.id)}</option>`)
      .join('');
    if (select.innerHTML !== unitOptions) select.innerHTML = unitOptions;
    if ([...select.options].some((o) => o.value === previous)) select.value = previous;
    const range = this.root.querySelector<HTMLInputElement>('#four-position');
    if (range && this.replay) {
      range.value = String(this.replay.position);
      this.root.querySelector('#four-replay-count')!.textContent = `${this.replay.position}/${this.replay.commands.length}`;
    }
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
    const panel = this.root.querySelector<HTMLElement>('#four-human-panel');
    if (!panel || !this.session) return;
    panel.hidden = !this.humanArmy;
    const state = this.replay?.state ?? this.session.state;
    const viewer = this.humanArmy ?? (this.view === 'all' ? state.round.order[state.round.index]! : this.view);
    const observed = observeFourArmy(state, viewer);
    if (!observed.ok) return;
    const projection = fourArmyPlanningView(observed.value);
    if (this.view === 'all') projection.units = state.units.map((u) => ({ ...u, owner: u.owner === viewer ? 'red' : 'blue' }));
    const source = this.humanSource;
    const unit = projection.units.find((u) => u.owner === 'red' && u.position?.x === source?.x && u.position?.y === source?.y);
    const canAct = this.humanTurn && !this.busy && !this.deps.conflicted() && this.count < FOUR_ARMY_COMMAND_LIMIT;
    const inspected = !source ? projection.units.find((u) => u.owner === 'blue' && u.position?.x === this.selected.x && u.position.y === this.selected.y) : undefined;
    const threatKey = canAct && inspected ? `${this.count}:${inspected.id}` : '';
    if (threatKey !== this.threatKey) {
      this.threatKey = threatKey;
      this.threat = inspected && canAct ? enemyThreatPreview(projection, inspected.id, 'red') : undefined;
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
    const briefRoot = this.root.querySelector('#four-brief')!;
    briefRoot.className = displayedUnit?.owner ?? '';
    if (briefRoot.innerHTML !== brief) briefRoot.innerHTML = brief;
    if (!this.humanArmy) {
      this.root.querySelector('#four-mobile-host')!.innerHTML = '';
      return;
    }
    let html = `<p class="card-kicker">COMMAND</p><h2 tabindex="-1">${escapeHtml(armyName(this.humanArmy))} · ${text('あなた', 'You')}</h2>`;
    if (this.replay) html += `<p>${text('リプレイ中は命令できません。', 'Commands are disabled during replay.')}</p>`;
    else if (!state.alive.includes(this.humanArmy))
      html += `<p>${text('自軍は脱落しました。記録を保存するか、残りの対局を観戦できます。', 'Your army was eliminated. Save the record or watch the remaining match.')}</p>${state.outcome.type === 'ongoing' ? `<button id="four-human-watch">${text('残りを観戦', 'Watch the remaining match')}</button>` : ''}`;
    else if (state.outcome.type !== 'ongoing') html += `<p>${text('対局は終了しました。', 'The match has ended.')}</p>`;
    else if (state.paused) html += `<p>${text('100ラウンドの区切りです。再生で次の手番を開始します。', 'Paused at a 100-round boundary. Play starts the next turn.')}</p>`;
    else if (!this.humanTurn) html += `<p>${text('敵CPUの手番です。停止中は再生で続けられます。', 'Enemy CPU turn. Choose Play when paused.')}</p>`;
    else if (!canAct) html += `<p>${text('現在は命令できません。記録を書き出して保持してください。', 'Commands are unavailable. Export to keep the record.')}</p>`;
    else {
      html += `<p>${observed.value.player.gold.toLocaleString()} G · ${observed.value.units.filter((u) => u.owner === this.humanArmy).length}/16</p>`;
      html += `<p class="four-human-source">${unit ? escapeHtml(unitNames[unit.kind] + ' ' + unit.id) : text('部隊を選択してください', 'Select a unit')}</p>`;
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
      html += `<button id="four-open-production" class="save-action">${text('生産メニュー', 'Production')}</button>`;
      const end = this.humanChoices.findIndex((c) => c.action === 'endTurn');
      html += `<button class="end-turn" data-human-choice="${end}" data-human-action="endTurn">${text('ターン終了', 'End turn')} →</button>`;
    }
    const unacted = canAct ? observed.value.units.filter((u) => u.owner === this.humanArmy && u.position && !u.hasActed) : [];
    if (canAct)
      html += `<section class="unit-queue-card"><div><p class="card-kicker">UNIT STATUS</p><h2>${text('未行動部隊', 'Ready units')} <strong>${unacted.length}</strong></h2></div><ol>${unacted.map((u) => `<li><button class="unit-queue-item" data-four-unit="${escapeHtml(u.id)}"><span class="${u.owner}" aria-hidden="true">${u.owner.slice(-1)}</span>${escapeHtml(unitNames[u.kind])}<em>${u.hp}</em></button></li>`).join('')}</ol><button id="four-next-unit" class="save-action" ${unacted.length ? '' : 'disabled'}>${text('次の未行動部隊', 'Next ready unit')} <kbd>N</kbd></button></section>`;
    if (canAct)
      html += `<section class="turn-setting"><label><input type="checkbox" id="four-confirm-end" ${this.confirmEndTurn ? 'checked' : ''}>${text('未行動部隊がいる時にターン終了を確認する', 'Confirm end turn when ready units remain')}</label></section>`;
    if (panel.innerHTML !== html) panel.innerHTML = html;
    const quick = (action: string, label: string) =>
      `<button class="mobile-action" data-quick-action="${action}" ${this.humanChoices.some((c) => c.action === action) && canAct ? '' : 'disabled'}>${label}</button>`;
    const mobile = canAct
      ? `<nav class="mobile-action-bar" aria-label="${text('クイック操作', 'Quick actions')}"><button id="four-mobile-next" class="mobile-action" ${unacted.length ? '' : 'disabled'}>${text('未行動', 'Ready')} <strong>${unacted.length}</strong></button>${quick('wait', text('行動終了', 'Wait'))}${quick('capture', text('占領', 'Capture'))}<button id="four-mobile-production" class="mobile-action">${text('生産', 'Build')}</button><button id="four-mobile-panel" class="mobile-action">${text('作戦情報', 'Info')}</button>${quick('endTurn', text('ターン終了', 'End turn'))}</nav>`
      : '';
    const mobileRoot = this.root.querySelector('#four-mobile-host')!;
    if (mobileRoot.innerHTML !== mobile) mobileRoot.innerHTML = mobile;
  }
  private openProduction(position?: Position): void {
    if (!this.humanTurn || !this.session || !this.humanArmy || this.busy || this.count >= FOUR_ARMY_COMMAND_LIMIT || this.deps.conflicted()) return;
    const o = observeFourArmy(this.session.state, this.humanArmy);
    if (!o.ok) return;
    const candidates = o.value.board.terrain.flatMap((row, y) =>
      row.flatMap((tile, x) =>
        tile.owner === this.humanArmy &&
        (productionKindsForRule('facility-v2', 12)[tile.kind]?.length ?? 0) > 0 &&
        !o.value.units.some((u) => u.position?.x === x && u.position.y === y)
          ? [{ x, y }]
          : [],
      ),
    );
    const target = position ? candidates.find((p) => p.x === position.x && p.y === position.y) : candidates[0];
    if (!target) {
      this.notice = text('生産可能な空き施設がありません。', 'No idle production facility is available.');
      return;
    }
    this.clearHuman();
    this.selected = { ...target };
    this.production = { ...target };
    this.paint();
    const choices = fourArmyHumanChoices(o.value, target).filter((c) => c.command.type === 'produce');
    const tile = o.value.board.terrain[target.y]![target.x]!;
    const kinds = productionKindsForRule('facility-v2', 12)[tile.kind] ?? [];
    const buttons = kinds
      .map(
        (kind) =>
          `<button class="production-option" data-production-kind="${kind}" ${choices.some((c) => c.command.type === 'produce' && c.command.kind === kind) ? '' : 'disabled'}>${escapeHtml(unitNames[kind])}<strong>${unitStats[kind].cost.toLocaleString()} G</strong></button>`,
      )
      .join('');
    this.root.querySelector('#four-production-host')!.innerHTML =
      `<dialog id="four-production-dialog" class="four-production-dialog" aria-modal="true" aria-labelledby="four-production-title"><h2 id="four-production-title">${text('生産メニュー', 'Production')}</h2>${renderProductionCard(`<p>${terrainNames[tile.kind]} (${target.x + 1}, ${target.y + 1})</p>`, `<p>${o.value.player.gold.toLocaleString()} G · ${o.value.units.filter((u) => u.owner === this.humanArmy).length}/16</p>`, buttons)}<button id="four-production-close">${text('閉じる', 'Close')} <kbd>Esc</kbd></button></dialog>`;
    const dialog = this.root.querySelector<HTMLDialogElement>('#four-production-dialog')!;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.closeProduction();
    });
    this.root.querySelector<HTMLElement>('#four-production-close')?.focus();
  }
  private closeProduction(focus = true): void {
    const position = this.production;
    this.production = undefined;
    this.root.querySelector<HTMLDialogElement>('#four-production-dialog')?.close?.();
    this.root.querySelector('#four-production-host')?.replaceChildren();
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
      this.session.state.units.some((u) => u.owner === this.humanArmy && !u.hasActed) &&
      !window.confirm(text('未行動部隊が残っています。ターンを終了しますか？', 'Ready units remain. End your turn?'))
    )
      return;
    const command = choice.command;
    this.pause();
    if (!this.session.submit(command)) {
      this.notice = text('この命令は実行できません。盤面を確認してください。', 'This command could not be applied. Check the board.');
      this.paint();
      return;
    }
    if (command.type === 'move') {
      const moved = this.session.state.units.find((u) => u.id === command.unitId);
      if (moved?.position) {
        this.selected = { ...moved.position };
        this.humanSource = { ...moved.position };
      }
    }
    this.captureCheckpoint();
    this.notice =
      command.type === 'move'
        ? text('移動しました。未知の敵への接触時は途中で停止します。', 'Moved. Contact with an unseen enemy can stop movement early.')
        : text('命令を実行しました。', 'Command applied.');
    this.paint();
    const state = this.session.state;
    if (this.humanArmy && !state.alive.includes(this.humanArmy)) {
      this.notice = text('自軍が脱落しました。残りの対局を観戦できます。', 'Your army was eliminated. You can watch the remaining match.');
      this.paint();
      return;
    }
    if (!state.paused && state.outcome.type === 'ongoing' && !this.humanTurn) await this.play();
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
    this.root.querySelector('#four-selection')!.textContent = info;
  }
}
