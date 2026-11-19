import type { CombatSummary } from '../game/combatSummary';
import { fourArmyParticipants } from '../game/smallBattle';
import { normalizeFourArmyControllers, type FourArmyControllers } from '../game/fourArmyControl';
import { type FourArmyId } from '../game/fourArmyFoundation';
import { defaultFourArmyCpuSettings, isFourArmyCpuSettings, isObservedFourArmyCommand, type FourArmyCpuSettings } from '../ai/fourArmyCpu';
import { applyFourArmyCommandWithCombat, isFourArmyState, observeFourArmy, type FourArmyCommand, type FourArmyState } from '../game/fourArmyEngine';
import { FourArmyCpuPlanner } from './fourArmyCpuPlanner';
import { FOUR_ARMY_CPU_VERSION, isFourArmyCpuCompatible, isFourArmyCpuVersion, type FourArmyCpuVersion } from '../ai/fourArmyCpuVersion';

/** Authoritative UI-thread owner. One step applies at most one current, legal command. */
export class FourArmyCpuSession {
  private current: FourArmyState;
  readonly controllers: FourArmyControllers;
  private settings: FourArmyCpuSettings;
  private history: FourArmyCommand[] = [];
  private revision = 0;
  private running = false;
  private stopped = false;
  private readonly planner: FourArmyCpuPlanner;
  onCommit?: (before: FourArmyState, command: FourArmyCommand, after: FourArmyState, combat?: CombatSummary<FourArmyId>) => void;
  constructor(
    state: FourArmyState,
    createWorker: () => Worker,
    settings: FourArmyCpuSettings = defaultFourArmyCpuSettings(),
    readonly cpuVersion: FourArmyCpuVersion = FOUR_ARMY_CPU_VERSION,
    readonly humanArmy?: FourArmyId | FourArmyControllers,
  ) {
    if (!isFourArmyState(state) || !isFourArmyCpuSettings(settings) || !isFourArmyCpuVersion(cpuVersion)) throw Error('Invalid four-army CPU session');
    const controls = normalizeFourArmyControllers(humanArmy);
    if (!isFourArmyCpuCompatible(cpuVersion, state.match?.version)) throw Error('Incompatible match CPU version');
    if (Object.entries(controls).some(([a, c]) => c === 'human' && !fourArmyParticipants(state).includes(a as FourArmyId))) throw Error('Inactive human army');
    this.controllers = Object.freeze(controls);
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
    this.onCommit = undefined;
  }
  resume(): void {
    if (this.stopped) throw Error('Four-army CPU session stopped');
    if (this.current.paused) {
      const before = this.current;
      const command: FourArmyCommand = { actor: this.current.round.order[this.current.round.index]!, type: 'resume' };
      const next = applyFourArmyCommandWithCombat(this.current, command);
      if (!next.ok) throw Error(next.error);
      this.current = next.value;
      this.history.push(command);
      if (this.onCommit) this.onCommit(structuredClone(before), structuredClone(command), structuredClone(this.current), next.combat ? structuredClone(next.combat) : undefined);
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
  /** Human commands share the authoritative history; private failures never try another command. */
  submit(command: FourArmyCommand): boolean {
    if (this.stopped || this.controllers[command.actor] !== 'human' || this.current.paused || this.current.outcome.type !== 'ongoing') return false;
    const observed = observeFourArmy(this.current, command.actor);
    if (!observed.ok || !isObservedFourArmyCommand(observed.value, command)) return false;
    this.pause();
    const before = this.current;
    const next = applyFourArmyCommandWithCombat(this.current, command);
    if (!next.ok) return false;
    this.current = next.value;
    this.history.push(structuredClone(command));
    if (this.onCommit) this.onCommit(structuredClone(before), structuredClone(command), structuredClone(this.current), next.combat ? structuredClone(next.combat) : undefined);
    return true;
  }
  async step(): Promise<FourArmyCommand | undefined> {
    if (!this.running || this.stopped || this.current.paused || this.current.outcome.type !== 'ongoing') return undefined;
    const revision = ++this.revision;
    const actor = this.current.round.order[this.current.round.index]!;
    if (this.controllers[actor] === 'human') return undefined;
    try {
      let command = await this.planner.plan(this.current, this.settings[actor], this.cpuVersion);
      if (!command || this.stopped || !this.running || revision !== this.revision) return undefined;
      let next = applyFourArmyCommandWithCombat(this.current, command);
      if (!next.ok) {
        // Observations intentionally omit hidden occupants. Do not probe alternatives using private state.
        const unitId = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
        const fallback: FourArmyCommand = unitId ? { actor, type: 'wait', unitId } : { actor, type: 'endTurn' };
        next = applyFourArmyCommandWithCombat(this.current, fallback);
        command = fallback;
      }
      if (!next.ok) throw Error(next.error);
      const before = this.current;
      this.current = next.value;
      this.history.push(structuredClone(command));
      if (this.onCommit) this.onCommit(structuredClone(before), structuredClone(command), structuredClone(this.current), next.combat ? structuredClone(next.combat) : undefined);
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
