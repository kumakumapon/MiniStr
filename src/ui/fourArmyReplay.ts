import { applyFourArmyCommand, createFourArmyState, type FourArmyState, type FourArmyMap, type FourArmyCommand } from '../game/fourArmyEngine';

/** Verified command history only. Yielding seeks remain cancellable, with bounded checkpoint memory. */
export class FourArmyReplay {
  private revision = 0;
  private checkpoints = new Map<number, FourArmyState>();
  private current: FourArmyState;
  position = 0;
  constructor(
    map: FourArmyMap,
    readonly commands: readonly FourArmyCommand[],
  ) {
    this.commands = structuredClone(commands);
    const made = createFourArmyState(map);
    if (!made.ok) throw Error(made.error);
    this.current = made.value;
    this.checkpoints.set(0, this.current);
  }
  get state(): FourArmyState {
    return structuredClone(this.current);
  }
  cancel(): void {
    this.revision++;
  }
  async seek(position: number): Promise<FourArmyState | undefined> {
    this.cancel();
    const revision = this.revision;
    if (!Number.isInteger(position) || position < 0 || position > this.commands.length) throw Error('Invalid replay position');
    const base = Math.max(...[...this.checkpoints.keys()].filter((i) => i <= position));
    let state = this.checkpoints.get(base)!;
    for (let i = base; i < position; i++) {
      if (revision !== this.revision) return;
      const next = applyFourArmyCommand(state, this.commands[i]);
      if (!next.ok) throw Error(next.error);
      state = next.value;
      if ((i + 1) % 64 === 0) this.checkpoints.set(i + 1, state);
      if ((i - base) % 8 === 7) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (revision !== this.revision) return;
    this.current = state;
    this.position = position;
    return this.state;
  }
}
