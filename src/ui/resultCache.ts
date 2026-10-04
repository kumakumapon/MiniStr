import {
  summarizeReplay,
  type GameState,
  type GameCommand,
  type ReplayDifficulty,
} from "../game";

/** A completed immutable state gets one summary per difficulty selection. */
export class ResultCache {
  private cache = new WeakMap<
    GameState,
    { difficulty: ReplayDifficulty; result: ReturnType<typeof summarizeReplay> }
  >();
  summarize(
    state: GameState,
    initial: GameState,
    commands: readonly GameCommand[],
    mapId: string,
    difficulty: ReplayDifficulty,
  ) {
    const cached = this.cache.get(state);
    if (cached?.difficulty === difficulty) return cached.result;
    const result = summarizeReplay(initial, commands, mapId, difficulty);
    this.cache.set(state, { difficulty, result });
    return result;
  }
}
