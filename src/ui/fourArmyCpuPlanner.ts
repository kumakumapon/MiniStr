import { isFourArmyCpuOptions, isObservedFourArmyCommand, type FourArmyCpuOptions } from '../ai/fourArmyCpu';
import { handleFourArmyCpuRequest, isFourArmyCpuTicket, type FourArmyCpuRequest } from '../ai/fourArmyCpuProtocol';
import { exactKeys, record } from '../ai/fourArmyObservation';
import { isFourArmyState, observeFourArmy, type FourArmyCommand, type FourArmyState } from '../game/fourArmyEngine';

interface Pending {
  request: FourArmyCpuRequest;
  resolve: (value: FourArmyCommand | undefined) => void;
  reject: (error: Error) => void;
}
/** Every cancellation terminates computation, invalidates callbacks and settles the old promise. */
export class FourArmyCpuPlanner {
  private worker?: Worker;
  private pending?: Pending;
  private id = 0;
  private generation = 1;
  constructor(private readonly createWorker: () => Worker) {}
  cancel(): void {
    this.generation++;
    const w = this.worker,
      p = this.pending;
    this.worker = undefined;
    this.pending = undefined;
    if (w) {
      w.onmessage = null;
      w.onerror = null;
      w.terminate();
    }
    p?.resolve(undefined);
  }
  plan(state: FourArmyState, options: FourArmyCpuOptions): Promise<FourArmyCommand | undefined> {
    if (this.pending) this.cancel();
    if (!isFourArmyState(state) || !isFourArmyCpuOptions(options)) return Promise.reject(Error('Invalid four-army CPU plan'));
    if (state.paused || state.outcome.type !== 'ongoing') {
      this.cancel();
      return Promise.resolve(undefined);
    }
    if (++this.id > 1_000_000_000 || this.generation > 1_000_000_000) return Promise.reject(Error('CPU request limit reached'));
    const actor = state.round.order[state.round.index]!;
    const observed = observeFourArmy(state, actor);
    if (!observed.ok) return Promise.reject(Error(observed.error));
    const request: FourArmyCpuRequest = {
      protocol: 1,
      id: this.id,
      generation: this.generation,
      turn: { actor, round: state.round.round, index: state.round.index },
      observation: observed.value,
      options: { ...options },
    };
    let fallback = false;
    if (!this.worker) {
      try {
        this.worker = this.createWorker();
      } catch {
        fallback = true;
      }
    }
    return new Promise((resolve, reject) => {
      const ticket: Pending = { request, resolve, reject };
      this.pending = ticket;
      const active = () => this.pending === ticket && this.generation === request.generation;
      const failed = (message: string) => {
        if (!active()) return;
        const worker = this.worker;
        this.pending = undefined;
        this.worker = undefined;
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.terminate();
        }
        reject(Error(message));
      };
      const accept = (data: unknown) => {
        if (!active()) return;
        if (!isFourArmyCpuTicket(data) || !record(data)) return failed('Invalid four-army CPU response');
        // A queued reply from an earlier request on the reused Worker cannot settle this request.
        if (data.id !== request.id || data.generation !== request.generation) return;
        if (
          data.turn.actor !== actor ||
          data.turn.round !== request.turn.round ||
          data.turn.index !== request.turn.index ||
          data.kind !== 'command' ||
          !exactKeys(data, ['protocol', 'id', 'generation', 'turn', 'kind', 'command']) ||
          !isObservedFourArmyCommand(request.observation, data.command)
        )
          return failed('Invalid four-army CPU response');
        this.pending = undefined;
        if (this.worker) this.worker.onmessage = this.worker.onerror = null;
        resolve(structuredClone(data.command));
      };
      if (fallback) {
        // Yield before a bounded synchronous fallback; cancel before/after it suppresses all commits.
        void Promise.resolve()
          .then(() => {
            if (active()) accept(handleFourArmyCpuRequest(request));
          })
          .catch(() => failed('Four-army CPU fallback failed'));
        return;
      }
      const worker = this.worker!;
      worker.onmessage = (event) => accept(event.data);
      worker.onerror = () => failed('Four-army CPU worker failed');
      try {
        worker.postMessage(request);
      } catch {
        failed('Four-army CPU request failed');
      }
    });
  }
}
