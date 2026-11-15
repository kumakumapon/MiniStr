import { FOUR_ARMY_AUTO_SAVE_KEY, type FourArmySpectatorSave } from '../game/fourArmySpectatorSave';
import type { StorageLike } from '../game/session';
import { FourArmyFileCodec } from './fourArmyFileCodec';

export type FourArmyAutosaveStatus = 'idle' | 'saving' | 'saved' | 'blocked-original' | 'blocked-writer' | 'conflict' | 'failed';
/** A dedicated, cancellable writer: human input and the manual file verifier remain independent. */
export class FourArmyAutosave {
  private revision = 0;
  private known?: string;
  status: FourArmyAutosaveStatus = 'idle';
  constructor(
    private storage: StorageLike,
    private writable: () => boolean,
    private changed: () => void = () => {},
    private codec: Pick<FourArmyFileCodec, 'run' | 'cancel'> = new FourArmyFileCodec(),
  ) {}
  cancel(): void {
    this.revision++;
    this.codec.cancel();
    if (this.status === 'saving') this.status = 'idle';
  }
  /** Forget cached verification only after the user has deleted this dedicated slot. */
  reset(): void {
    this.cancel();
    this.known = undefined;
    this.status = 'idle';
    this.changed();
  }
  async write(snapshot: FourArmySpectatorSave): Promise<void> {
    this.cancel();
    const revision = this.revision;
    const finish = (status: FourArmyAutosaveStatus) => {
      if (revision === this.revision) {
        this.status = status;
        this.changed();
      }
    };
    if (!this.writable()) {
      finish('blocked-writer');
      return;
    }
    this.status = 'saving';
    this.changed();
    try {
      const previous = this.storage.getItem(FOUR_ARMY_AUTO_SAVE_KEY);
      if (previous !== null && previous !== this.known) {
        const original = await this.codec.run(previous);
        if (revision !== this.revision || !original) return;
        if (!original.ok) {
          finish('blocked-original');
          return;
        }
        this.known = previous;
      }
      const checked = await this.codec.run(snapshot);
      if (revision !== this.revision || !checked) return;
      if (!checked.ok) {
        finish('failed');
        return;
      }
      if (!this.writable()) {
        finish('blocked-writer');
        return;
      }
      if (this.storage.getItem(FOUR_ARMY_AUTO_SAVE_KEY) !== previous) {
        finish('conflict');
        return;
      }
      this.storage.setItem(FOUR_ARMY_AUTO_SAVE_KEY, checked.value.text);
      this.known = checked.value.text;
      finish('saved');
    } catch {
      finish('failed');
    }
  }
}
