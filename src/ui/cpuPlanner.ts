import type { CpuDifficulty } from '../ai';
import type { ArmyPolicy } from '../game/armyPolicy';
import type { GameCommand } from '../game/session';
import type { GameState, PlayerId } from '../game/types';

export interface CpuPlan {
  state: GameState;
  difficulty: CpuDifficulty;
  side: PlayerId;
  policy: ArmyPolicy;
}
/** The worker holds only one current match. Cancel terminates computation and drops its state. */
export class CpuPlanner {
  private worker?: Worker;
  private pending?: { resolve: (command: GameCommand | undefined) => void; reject: (error: Error) => void };
  constructor(private createWorker: () => Worker) {}
  cancel(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.pending?.resolve(undefined);
    this.pending = undefined;
  }
  plan(input: CpuPlan): Promise<GameCommand | undefined> {
    if (this.pending) this.cancel();
    if (!this.worker) {
      try {
        this.worker = this.createWorker();
      } catch {
        return import('./cpuFallback').then(({ chooseCpuAction }) => chooseCpuAction(input.state, input.difficulty, input.side, input.policy));
      }
    }
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      worker.onmessage = (event) => {
        if (this.worker !== worker) return;
        this.pending = undefined;
        resolve(event.data as GameCommand);
      };
      worker.onerror = () => {
        if (this.worker !== worker) return;
        this.pending = undefined;
        worker.terminate();
        this.worker = undefined;
        reject(Error('CPU worker failed'));
      };
      try {
        worker.postMessage(input);
      } catch {
        this.pending = undefined;
        worker.terminate();
        this.worker = undefined;
        reject(Error('CPU request failed'));
      }
    });
  }
}
