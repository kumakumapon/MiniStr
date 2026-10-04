import { applyGameCommand } from "./session";
import type { ReplayFile } from "./replay";
import { visibleEnemies } from "./fog";
import type { GameResult, GameState, PlayerId } from "./types";

/** Bounded checkpoints accelerate backward/forward seeks without rerunning AI. */
export class ReplayTimeline {
  private checkpoints = new Map<number, GameState>();
  constructor(
    private readonly file: ReplayFile,
    private readonly interval = 32,
  ) {
    this.checkpoints.set(0, structuredClone(file.initialState));
  }
  seek(index: number): GameResult<GameState> {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index > this.file.commands.length
    )
      return { ok: false, error: "リプレイ位置が不正です。" };
    const start = Math.max(
      ...[...this.checkpoints.keys()].filter((key) => key <= index),
    );
    let state = this.checkpoints.get(start)!;
    for (let i = start; i < index; i++) {
      const applied = applyGameCommand(state, this.file.commands[i]!);
      if (!applied.ok) return applied;
      state = applied.value;
      if ((i + 1) % this.interval === 0) {
        if (this.checkpoints.size >= 32)
          this.checkpoints.delete(
            [...this.checkpoints.keys()].find((key) => key !== 0)!,
          );
        this.checkpoints.set(i + 1, state);
      }
    }
    return { ok: true, value: structuredClone(state) };
  }
  /** A fog viewpoint must not expose hidden orders in its event list. */
  event(index: number, viewer: PlayerId | "all"): string {
    const command = this.file.commands[index];
    if (!command) return "";
    if (command.type === "endTurn") return "endTurn";
    if (viewer === "all") return command.type;
    const before = this.seek(index);
    if (!before.ok) return "";
    const state = before.value;
    if (state.activePlayer === viewer) return command.type;
    const unitId =
      "unitId" in command
        ? command.unitId
        : "transportId" in command
          ? command.transportId
          : undefined;
    return unitId &&
      visibleEnemies(state, viewer).some((unit) => unit.id === unitId)
      ? command.type
      : "未観測";
  }
}
