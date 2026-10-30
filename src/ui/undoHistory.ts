import { replayCommands, type GameCommand } from '../game/session';
import type { GameState } from '../game/types';

/** Retain small command offsets indefinitely, but only a board-sized budget of states. */
export class UndoHistory {
  private entries: number[] = [];
  private states = new Map<number, GameState>();
  constructor(
    private initial: () => GameState,
    private commands: () => readonly GameCommand[],
  ) {}
  get length(): number {
    return this.entries.length;
  }
  get retainedStates(): number {
    return this.states.size;
  }
  push(entry: { state: GameState; commandCount: number }): void {
    this.entries.push(entry.commandCount);
    this.states.set(entry.commandCount, entry.state);
    const limit = Math.max(2, Math.min(32, Math.floor(8192 / (entry.state.board.width * entry.state.board.height))));
    while (this.states.size > limit) this.states.delete(this.states.keys().next().value!);
  }
  pop(): { state: GameState; commandCount: number } | undefined {
    const commandCount = this.entries.at(-1);
    if (commandCount === undefined) return undefined;
    let state = this.states.get(commandCount);
    if (!state) {
      const result = replayCommands(this.initial(), this.commands().slice(0, commandCount));
      if (!result.ok) return undefined;
      state = result.value;
    }
    this.entries.pop();
    this.states.delete(commandCount);
    return { state, commandCount };
  }
}
