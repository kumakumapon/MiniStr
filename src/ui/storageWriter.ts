import { getLocale } from './locale';

export const STORAGE_WRITER_LOCK = 'ministr.storage.writer.v1';
export type StorageWriterState = 'pending' | 'owned' | 'busy' | 'unsupported' | 'released' | 'failed';
export interface StorageLockManager {
  request(name: string, options: { mode: 'exclusive'; ifAvailable: true }, callback: (lock: object | null) => Promise<void>): Promise<unknown>;
}

/** One writer per origin for this page's lifetime, including multi-key rollback.
 * Non-owners keep their snapshot but cannot mutate browser storage. */
export class StorageWriter {
  state: StorageWriterState;
  private generation = 0;
  private requesting = false;
  private unlock?: () => void;
  private changed: () => void = () => {};

  constructor(private locks: StorageLockManager | undefined) {
    this.state = locks ? 'pending' : 'unsupported';
  }
  get writable(): boolean {
    return this.state === 'owned';
  }
  private setState(state: StorageWriterState): void {
    if (this.state === state) return;
    this.state = state;
    this.changed();
  }
  acquire(changed: () => void = this.changed): void {
    this.changed = changed;
    if (!this.locks) {
      this.setState('unsupported');
      return;
    }
    if (this.writable || this.requesting) return;
    this.requesting = true;
    const generation = ++this.generation;
    this.setState('pending');
    try {
      void this.locks
        .request(STORAGE_WRITER_LOCK, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
          if (generation !== this.generation) return;
          if (!lock) {
            this.requesting = false;
            this.setState('busy');
            return;
          }
          const held = new Promise<void>((resolve) => {
            this.unlock = resolve;
          });
          this.setState('owned');
          await held;
        })
        .catch(() => {
          if (generation === this.generation) {
            this.unlock = undefined;
            this.requesting = false;
            this.setState('failed');
          }
        });
    } catch {
      if (generation === this.generation) {
        this.requesting = false;
        this.setState('failed');
      }
    }
  }
  release(): void {
    this.generation += 1;
    this.requesting = false;
    const unlock = this.unlock;
    this.unlock = undefined;
    this.setState('released');
    unlock?.();
  }
}

export function createStorageWriter(provider: () => StorageLockManager | undefined): StorageWriter {
  try {
    return new StorageWriter(provider());
  } catch {
    return new StorageWriter(undefined);
  }
}

export function renderStorageWriterNotice(state: StorageWriterState): string {
  if (state === 'owned') return '';
  const en = getLocale() === 'en';
  const message =
    state === 'pending'
      ? en
        ? 'Preparing safe saving. Please wait before saving.'
        : '保存の準備中です。保存できるようになるまでお待ちください。'
      : state === 'busy'
        ? en
          ? 'Another MiniStr tab is using saved data. This tab cannot save. Save or export the match in the other tab before closing it, then retry. You can export your current match.'
          : '別のMiniStrタブが保存データを使用中です。このタブでは保存できません。別タブの進行を保存・書き出ししてから、そのタブを閉じて再試行してください。現在の対局は書き出せます。'
        : en
          ? 'Safe saving is unavailable in this tab. Your changes cannot be saved. Export your current match before reloading or using a supported browser.'
          : 'このタブでは安全に保存できません。変更は保存されません。再読み込みや対応ブラウザーへの移動前に、現在の対局を書き出してください。';
  return `<section class="storage-write-notice" role="status"><p>${message}</p>${state === 'pending' ? '' : `<button type="button" data-storage-write-export>${en ? 'Export current match' : '現在の対局を書き出す'}</button>${state === 'unsupported' ? '' : `<button type="button" data-storage-write-retry>${en ? 'Retry saving' : '保存を再試行'}</button>`}<button type="button" data-storage-write-reload>${en ? 'Reload' : '再読み込み'}</button>`}</section>`;
}
