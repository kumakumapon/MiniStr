import { defaultFourArmyCpuSettings, isFourArmyCpuSettings, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import { applyFourArmyCommand, isFourArmyState, type FourArmyCommand, type FourArmyState } from '../game/fourArmyEngine';
import { FourArmyCpuPlanner } from './fourArmyCpuPlanner';

/** Authoritative UI-thread owner. One step applies at most one current, legal command. */
export class FourArmyCpuSession {
  private current: FourArmyState;
  private settings: FourArmyCpuSettings;
  private history: FourArmyCommand[] = [];
  private revision = 0;
  private running = false;
  private stopped = false;
  private readonly planner: FourArmyCpuPlanner;
  constructor(state: FourArmyState, createWorker: () => Worker, settings: FourArmyCpuSettings = defaultFourArmyCpuSettings()) {
    if (!isFourArmyState(state) || !isFourArmyCpuSettings(settings)) throw Error('Invalid four-army CPU session');
    this.current = structuredClone(state);
    this.settings = structuredClone(settings);
    this.planner = new FourArmyCpuPlanner(createWorker);
  }
  get state(): FourArmyState {
    return structuredClone(this.current);
  }
  /** Applied delta since construction/replacement; callers preserve any archived prefix separately. */
  get commands(): FourArmyCommand[] {
    return structuredClone(this.history);
  }
  get commandCount(): number {
    return this.history.length;
  }
  get paused(): boolean {
    return !this.running;
  }
  pause(): void {
    this.running = false;
    this.revision++;
    this.planner.cancel();
  }
  stop(): void {
    this.pause();
    this.stopped = true;
  }
  resume(): void {
    if (this.stopped) throw Error('Four-army CPU session stopped');
    if (this.current.paused) {
      const command: FourArmyCommand = { actor: this.current.round.order[this.current.round.index]!, type: 'resume' };
      const next = applyFourArmyCommand(this.current, command);
      if (!next.ok) throw Error(next.error);
      this.current = next.value;
      this.history.push(command);
      this.revision++;
    }
    this.running = this.current.outcome.type === 'ongoing';
  }
  configure(settings: FourArmyCpuSettings): void {
    if (this.stopped || !isFourArmyCpuSettings(settings)) throw Error('Invalid four-army CPU settings');
    this.revision++;
    this.planner.cancel();
    this.settings = structuredClone(settings);
  }
  replaceState(state: FourArmyState): void {
    if (this.stopped || !isFourArmyState(state)) throw Error('Invalid four-army replacement state');
    this.pause();
    this.current = structuredClone(state);
    this.history = [];
  }
  async step(): Promise<FourArmyCommand | undefined> {
    if (!this.running || this.stopped || this.current.paused || this.current.outcome.type !== 'ongoing') return undefined;
    const revision = ++this.revision;
    const actor = this.current.round.order[this.current.round.index]!;
    try {
      let command = await this.planner.plan(this.current, this.settings[actor]);
      if (!command || this.stopped || !this.running || revision !== this.revision) return undefined;
      let next = applyFourArmyCommand(this.current, command);
      if (!next.ok) {
        // Observations intentionally omit hidden occupants. Do not probe alternatives using private state.
        const unitId = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
        const fallback: FourArmyCommand = unitId ? { actor, type: 'wait', unitId } : { actor, type: 'endTurn' };
        next = applyFourArmyCommand(this.current, fallback);
        command = fallback;
      }
      if (!next.ok) throw Error(next.error);
      this.current = next.value;
      this.history.push(structuredClone(command));
      this.revision++;
      if (this.current.paused || this.current.outcome.type !== 'ongoing') this.pause();
      return structuredClone(command);
    } catch (error) {
      if (revision !== this.revision || this.stopped || !this.running) return undefined;
      this.pause();
      throw error;
    }
  }
}
