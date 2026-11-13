import './fourArmyScreen.css';
import { FOUR_ARMY_CPU_VERSION, type FourArmyCpuVersion } from '../ai/fourArmyCpuVersion';
import type { FourArmyCheckpoint } from '../game/fourArmyArchive';
import { FOUR_ARMY_IDS, type FourArmyId } from '../game/fourArmyFoundation';
import { createFourArmyMap32 } from '../game/fourArmyMap32';
import { createFourArmyState, type FourArmyMap, type FourArmyCommand, type FourArmyState } from '../game/fourArmyEngine';
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
import { fourArmyDisplay, paintFourArmyBoard, type FourArmyDisplay } from './fourArmyBoard';
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
  createSession?: (state: FourArmyState, settings: FourArmyCpuSettings, cpuVersion: FourArmyCpuVersion) => FourArmyCpuSession;
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
  private settings = defaultFourArmyCpuSettings();
  private cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION;
  private order: FourArmyId[] = [...FOUR_ARMY_IDS];
  private seed = '1512';
  private name = '';
  private view: FourArmyView = 'all';
  private speed: CommandSpeed = 1;
  private selected: Position = { x: 3, y: 3 };
  private cell = 20;
  private zoomAuto = true;
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
    window.addEventListener('resize', () => {
      if (this.active && this.phase === 'watch' && this.zoomAuto) {
        this.fit();
        this.paint();
      }
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
    return [this.count, this.name, JSON.stringify(this.settings), this.view, this.speed].join('|');
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
  private pause(message?: string): void {
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
      window.confirm(text('未保存の4軍観戦を置き換えますか？必要な記録は先に保存・書き出ししてください。', 'Replace the unsaved four-army match? Save or export the record first.'))
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
    const made = createFourArmyMap32(Number(this.seed), this.order);
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
    this.install(made.value, state.value, []);
    this.name = text('四方の前線', 'Four Fronts');
    this.savedSignature = '';
    this.notice = text('停止中です。再生または1手進めるを選んでください。', 'Paused. Choose Play or Step.');
    this.shell();
  }
  private install(
    map: FourArmyMap,
    state: FourArmyState,
    commands: readonly FourArmyCommand[],
    checkpoints: FourArmyCheckpoint[] = [],
    cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION,
  ): void {
    this.pause();
    this.session?.stop();
    this.map = structuredClone(map);
    this.prefix = structuredClone([...commands]);
    this.checkpoints = checkpoints;
    this.verifiedRecord = undefined;
    this.replay = undefined;
    this.cpuVersion = cpuVersion;
    this.session = this.deps.createSession?.(state, this.settings, cpuVersion) ?? createFourArmyCpuSession(state, this.settings, cpuVersion);
    this.phase = 'watch';
    this.zoomAuto = true;
    this.selected = { ...map.capitals.army1 };
  }
  private async play(): Promise<void> {
    if (!this.session || this.deps.conflicted()) return;
    if (this.running || this.busy) {
      this.pause(text('一時停止しました。', 'Paused.'));
      return;
    }
    if (this.replay?.position === this.replay?.commands.length && this.replay) return;
    if (!this.replay && (this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session.state.outcome.type !== 'ongoing')) return;
    this.pause();
    const generation = this.generation;
    this.running = true;
    this.notice = '';
    if (!this.replay) {
      this.session.resume();
      this.captureCheckpoint();
    }
    this.scheduler.start({ initialDelayMs: 450 / this.speed, nextDelayMs: () => 450 / this.speed, step: () => this.advance(generation) });
    this.paint();
  }
  private async advance(generation: number): Promise<boolean> {
    if (generation !== this.generation || !this.session) return false;
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
      if (this.replay && this.replay.position === this.replay.commands.length) this.pause(text('リプレイの終端です。', 'End of replay.'));
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
      format: 'ministr-four-army-spectator',
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
    this.view = saved.view;
    this.speed = saved.speed;
    this.name = saved.name;
    this.seed = String(saved.archive.payload.map.seed);
    this.order = [...saved.archive.payload.map.order];
    this.install(saved.archive.payload.map, saved.archive.payload.state, saved.archive.payload.commands, result.value.checkpoints, saved.cpuVersion);
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
      this.install(this.map, this.session.state, [...this.prefix, ...this.session.commands], this.checkpoints, FOUR_ARMY_CPU_VERSION);
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
      this.zoomAuto = false;
      this.cell = Math.max(10, Math.min(40, this.cell + (id === 'four-zoom-in' ? 4 : -4)));
      this.paint();
      return;
    }
    if (id === 'four-fit') {
      this.zoomAuto = true;
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
    if (input.id === 'four-view' && isFourArmyView(input.value)) {
      this.pause();
      this.view = input.value;
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
    if (e.key === 'Escape') {
      e.preventDefault();
      this.pause(text('一時停止しました。', 'Paused.'));
      return;
    }
    if ((e.target as HTMLElement).id !== 'four-board') return;
    const moves: Record<string, Position> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    if (moves[e.key]) {
      e.preventDefault();
      const d = moves[e.key]!;
      this.selected = { x: Math.max(0, Math.min(31, this.selected.x + d.x)), y: Math.max(0, Math.min(31, this.selected.y + d.y)) };
      this.paint();
      this.locate();
    }
    if (e.key === ' ') {
      e.preventDefault();
      void this.play();
    }
  }
  private fit(): void {
    const viewport = this.root.querySelector<HTMLElement>('.four-map-viewport');
    const height = (viewport && Number.parseFloat(getComputedStyle(viewport).maxHeight)) || innerHeight * 0.65;
    this.cell = Math.max(10, Math.min(24, Math.floor(Math.min((viewport?.clientWidth || 680) - 14, height - 14) / 32)));
  }
  private locate(): void {
    const viewport = this.root.querySelector<HTMLElement>('.four-map-viewport');
    if (!viewport) return;
    const x = (this.selected.x + 0.5) * this.cell,
      y = (this.selected.y + 0.5) * this.cell;
    viewport.scrollLeft = Math.max(0, x - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, y - viewport.clientHeight / 2);
    this.root.querySelector<HTMLCanvasElement>('#four-board')?.focus({ preventScroll: true });
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
    const head = `<header class="four-header"><div><p class="four-kicker">MINISTR / FOUR FRONTS</p><h1 id="four-heading" tabindex="-1">${text('4軍CPU観戦', 'Four-army spectator')}</h1></div><label>${text('言語', 'Language')}<select id="four-locale"><option value="ja" ${getLocale() === 'ja' ? 'selected' : ''}>日本語</option><option value="en" ${getLocale() === 'en' ? 'selected' : ''}>English</option></select></label><button id="four-close">${text('タイトルへ', 'Title')}</button></header><div id="four-storage"></div><p id="four-notice" role="status"></p>`;
    if (this.phase === 'menu')
      this.root.innerHTML =
        head +
        `<section class="four-setup"><div class="four-brief"><p class="four-kicker">32 × 32 / ALL CPU</p><h2>${text('四方の前線', 'Four Fronts')}</h2><p>${text('4軍すべてが敵対。司令部または全部隊を失うと脱落し、最後の1軍が勝利します。', 'All four armies are hostile. Losing a headquarters or all units eliminates an army; the last army wins.')}</p><p>${text('各軍8部隊・基本資金10,000。搭載を含む上限16部隊。100ラウンドごとに停止して再開できます。', 'Each army starts with 8 units and 10,000 gold. The cap is 16 including cargo. Play pauses every 100 rounds and can resume.')}</p><label>${text('seed', 'Seed')}<input id="four-seed" inputmode="numeric" maxlength="10" value="${escapeHtml(this.seed)}"></label><fieldset><legend>${text('手番順', 'Turn order')}</legend><div class="four-order">${this.order.map((a, i) => `<label>${i + 1}<select id="four-order-${i}" data-order="${i}">${options(FOUR_ARMY_IDS, a, FOUR_ARMY_IDS.map(armyName))}</select></label>`).join('')}</div></fieldset><div class="four-buttons"><button id="four-start" class="four-primary">${text('4軍観戦を開始', 'Start four-army match')}</button>${this.session ? `<button id="four-return">${text('進行中の観戦へ戻る', 'Return to match')}</button>` : ''}</div></div><section><h2>${text('軍別CPU設定', 'Army CPU settings')}</h2>${this.settingsForm()}<p class="four-hint">${text('全軍CPUです。盤面への手動命令はありません。設定変更は一時停止します。', 'All armies use CPUs; board commands are not manual. Changing settings pauses play.')}</p>${this.fileTools()}</section></section>`;
    else
      this.root.innerHTML =
        head +
        `<section class="four-toolbar" aria-label="${text('観戦操作', 'Spectator controls')}"><button id="four-toggle" class="four-primary"></button><button id="four-step">${text('1手進める', 'Step')}</button><label>${text('速度', 'Speed')}<select id="four-speed">${options(
          COMMAND_SPEEDS.map(String),
          String(this.speed),
          COMMAND_SPEEDS.map((s) => s + '×'),
        )}</select></label><label>${text('視点', 'View')}<select id="four-view">${options(['all', ...FOUR_ARMY_IDS], this.view, [text('全体表示', 'Whole board'), ...FOUR_ARMY_IDS.map(armyName)])}</select></label><button id="four-menu">${text('開始条件', 'Setup')}</button><button id="four-replay">${text('記録を再生', 'Replay record')}</button></section><p id="four-turn" class="four-turn"></p><details class="four-armies"><summary>${text('軍別情報', 'Army information')}</summary><div id="four-army-info"></div></details><div class="four-layout"><section class="four-map-panel"><div class="four-map-heading"><h2>${text('四方の前線', 'Four Fronts')}</h2><div class="four-buttons"><button id="four-zoom-out" aria-label="${text('盤面を縮小', 'Zoom out')}">−</button><button id="four-fit">${text('全体', 'Fit')}</button><button id="four-zoom-in" aria-label="${text('盤面を拡大', 'Zoom in')}">＋</button></div></div><div class="four-map-viewport"><canvas id="four-board" role="img" tabindex="0" aria-label="${text('4軍観戦盤面。矢印でマスを選択、Spaceで再生・停止。', 'Four-army board. Arrow keys select a tile; Space plays or pauses.')}" aria-describedby="four-selection">${text('盤面の詳細は選択情報から確認できます。', 'Use the selection details to inspect the board.')}</canvas></div><p class="four-hint">${text('タッチで移動・マスを選択。＋で拡大。矢印キーで選択、Spaceで再生・停止、Escで停止。', 'Pan and tap to inspect; use + to zoom. Arrows select, Space plays or pauses, Esc pauses.')}</p></section><aside class="four-inspector"><section><h2>${text('選択情報', 'Selection')}</h2><output id="four-selection"></output><label>${text('表示中の部隊', 'Visible units')}<select id="four-unit"></select></label><button id="four-locate">${text('部隊へ移動', 'Locate unit')}</button></section><details><summary>${text('軍別CPU設定', 'Army CPU settings')}${this.replay ? text('（保存時）', ' (at save)') : ''}</summary>${this.settingsForm()}${this.cpuVersion !== FOUR_ARMY_CPU_VERSION ? `<p class="four-hint">${text('旧保存のCPU判断を維持しています。切り替えると、この先の判断に改善版を使います。元の保存は再保存するまで変わりません。', 'This record retains its original CPU. Switching changes future decisions; the saved original is kept until you save again.')}</p>${!this.replay ? `<button id="four-upgrade-cpu">${text('改善版CPUへ切り替え', 'Use improved CPU')}</button>` : ''}` : ''}</details>${this.fileTools()}</aside></div>${this.replay ? `<section class="four-replay-controls"><strong>${text('リプレイ', 'Replay')}</strong><button id="four-replay-start">|◀</button><button id="four-previous">◀</button><label>${text('命令位置', 'Command position')}<input id="four-position" type="range" min="0" max="${this.replay.commands.length}" value="${this.replay.position}"></label><output id="four-replay-count"></output><button id="four-replay-end">▶|</button><button id="four-replay-close">${text('観戦へ戻る', 'Return to match')}</button></section>` : ''}`;
    if (this.phase === 'watch') {
      const canvas = this.root.querySelector<HTMLCanvasElement>('#four-board')!;
      canvas.addEventListener('click', (e) => {
        const r = canvas.getBoundingClientRect();
        this.selected = {
          x: Math.min(31, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 32))),
          y: Math.min(31, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * 32))),
        };
        this.paint();
        canvas.focus({ preventScroll: true });
      });
      if (this.zoomAuto) this.fit();
    }
    this.slots();
    this.paint();
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
      button.disabled = !!this.session && (this.deps.conflicted() || (!this.replay && (this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session.state.outcome.type !== 'ongoing')));
    }
    const step = this.root.querySelector<HTMLButtonElement>('#four-step');
    if (step)
      step.disabled =
        this.busy ||
        this.running ||
        this.deps.conflicted() ||
        (!this.replay && (this.count >= FOUR_ARMY_COMMAND_LIMIT || this.session?.state.outcome.type !== 'ongoing')) ||
        (!!this.replay && this.replay.position >= this.replay.commands.length);
    this.root.querySelectorAll<HTMLButtonElement>('[data-save-slot]').forEach((b) => (b.disabled = !this.session || this.busy || !this.deps.writable()));
    const exp = this.root.querySelector<HTMLButtonElement>('#four-export');
    if (exp) exp.disabled = !this.session || this.busy;
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
    this.paintControls();
    if (this.phase !== 'watch' || !this.session) return;
    const state = this.replay?.state ?? this.session.state,
      display = fourArmyDisplay(state, this.view),
      actor = state.round.order[state.round.index]!;
    const turn = this.root.querySelector('#four-turn')!;
    turn.textContent = `${text('ラウンド', 'Round')} ${state.round.round} · ${armyName(actor)} · ${this.running ? text('再生中', 'Playing') : this.busy ? text('処理中', 'Working') : text('停止中', 'Paused')} · ${this.replay ? this.replay.position : this.count} ${text('命令', 'commands')}${state.outcome.type === 'victory' ? ' · ' + armyName(state.outcome.winner) + ' ' + text('勝利', 'wins') : state.outcome.type === 'draw' ? ' · ' + text('引き分け', 'Draw') : ''}`;
    turn.className = 'four-turn ' + actor;
    this.root.querySelector('#four-army-info')!.innerHTML = FOUR_ARMY_IDS.map((a) => {
      const p = display.players[a],
        count = display.units.filter((u) => u.owner === a).length;
      return `<div class="four-army-label ${a}"><strong>${armyName(a)} ${a === actor ? '◀' : ''}</strong><span>${state.alive.includes(a) ? text('生存', 'Active') : text('脱落', 'Eliminated')}</span><span>${this.view === 'all' || this.view === a ? count + '/16' : text('視認 ', 'Seen ') + count}</span><span>${p ? `${p.gold.toLocaleString()} G · +${p.income.toLocaleString()}` : text('資金非公開', 'Funds hidden')}</span></div>`;
    }).join('');
    paintFourArmyBoard(this.root.querySelector<HTMLCanvasElement>('#four-board')!, display, this.selected, this.cell);
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
