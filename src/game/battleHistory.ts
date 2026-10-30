import { visibleEnemies, visiblePositions } from './fog';
import { applyGameCommand, type GameCommand } from './session';
import { isPropertyTerrainKind } from './facilities';
import { isDeployedUnit, type GameResult, type GameState, type PlayerId, type Position, type UnitKind } from './types';

export const MAX_RECON_CONTACTS = 256;
export const MAX_ANALYSIS_TURNS = 256;
export interface ReconContact {
  id: string;
  kind: UnitKind;
  position: Position;
  turn: number;
  phase: PlayerId;
}
export interface AnalysisSide {
  units: number;
  income: number;
  losses: number;
}
export interface AnalysisSample {
  turn: number;
  red: AnalysisSide;
  blue: AnalysisSide;
}
export interface TurnSummary {
  turn: number;
  attacks: number;
  produced: number;
  captured: number;
  evacuated: number;
  losses: Record<PlayerId, number>;
}
export interface BattleAnalysis {
  samples: AnalysisSample[];
  summaries: TurnSummary[];
}

/** Viewer information is reconstructed only from the prefix of the recorded legal commands. */
export class BattleHistory {
  private state: GameState;
  private index = 0;
  private lastCommand?: GameCommand;
  private contacts: Record<PlayerId, Map<string, ReconContact>> = { red: new Map(), blue: new Map() };
  private samples: AnalysisSample[] = [];
  private summaries: TurnSummary[] = [];
  private losses: Record<PlayerId, number> = { red: 0, blue: 0 };

  constructor(
    private readonly initial: GameState,
    private readonly commands: readonly GameCommand[],
  ) {
    this.state = initial;
    this.observe();
    this.sample();
  }

  private reset(): void {
    this.state = this.initial;
    this.index = 0;
    this.lastCommand = undefined;
    this.contacts = { red: new Map(), blue: new Map() };
    this.samples = [];
    this.summaries = [];
    this.losses = { red: 0, blue: 0 };
    this.observe();
    this.sample();
  }

  private observe(): void {
    for (const player of ['red', 'blue'] as const) {
      const visible = new Set(visiblePositions(this.state, player).map((p) => `${p.x},${p.y}`));
      const enemies = this.state.units.filter(isDeployedUnit).filter((unit) => unit.owner !== player && visible.has(`${unit.position.x},${unit.position.y}`));
      const current = new Map(enemies.map((unit) => [unit.id, unit]));
      const memory = this.contacts[player];
      for (const [id, contact] of memory) {
        const observed = current.get(id);
        if (visible.has(`${contact.position.x},${contact.position.y}`) && (!observed || observed.position.x !== contact.position.x || observed.position.y !== contact.position.y))
          memory.delete(id);
      }
      for (const unit of enemies) {
        memory.delete(unit.id);
        memory.set(unit.id, { id: unit.id, kind: unit.kind, position: { ...unit.position }, turn: this.state.turn, phase: this.state.activePlayer });
      }
      while (memory.size > MAX_RECON_CONTACTS) memory.delete(memory.keys().next().value!);
    }
  }

  private sample(): void {
    const side = (player: PlayerId): AnalysisSide => ({
      units: this.state.units.filter((unit) => unit.owner === player).length,
      income: this.state.players[player].income,
      losses: this.losses[player],
    });
    const sample: AnalysisSample = { turn: this.state.turn, red: side('red'), blue: side('blue') };
    if (this.samples.at(-1)?.turn === sample.turn) this.samples[this.samples.length - 1] = sample;
    else this.samples.push(sample);
    if (this.samples.length > MAX_ANALYSIS_TURNS) this.samples.shift();
  }

  private seek(index: number): GameResult<void> {
    if (!Number.isSafeInteger(index) || index < 0 || index > this.commands.length) return { ok: false, error: '履歴の位置が不正です。' };
    if (index < this.index || (this.index > 0 && this.commands[this.index - 1] !== this.lastCommand)) this.reset();
    while (this.index < index) {
      const command = this.commands[this.index]!;
      const before = this.state;
      const applied = applyGameCommand(before, command);
      if (!applied.ok) return applied;
      this.state = applied.value;
      let summary = this.summaries.at(-1);
      if (!summary || summary.turn !== before.turn) {
        summary = { turn: before.turn, attacks: 0, produced: 0, captured: 0, evacuated: 0, losses: { red: 0, blue: 0 } };
        this.summaries.push(summary);
        if (this.summaries.length > MAX_ANALYSIS_TURNS) this.summaries.shift();
      }
      if (command.type === 'attack') summary.attacks++;
      if (command.type === 'produce') summary.produced++;
      if (command.type === 'evacuate') summary.evacuated++;
      if (command.type === 'capture')
        for (let y = 0; y < before.board.height; y++)
          for (let x = 0; x < before.board.width; x++) {
            const previous = before.board.terrain[y]![x]!;
            if (isPropertyTerrainKind(previous.kind) && previous.owner !== this.state.board.terrain[y]![x]!.owner) summary.captured++;
          }
      if (command.type !== 'merge' && command.type !== 'evacuate') {
        const remaining = new Set(this.state.units.map((unit) => unit.id));
        for (const unit of before.units)
          if (!remaining.has(unit.id)) {
            this.losses[unit.owner]++;
            summary.losses[unit.owner]++;
          }
      }
      this.observe();
      this.sample();
      this.index++;
      this.lastCommand = command;
    }
    return { ok: true, value: undefined };
  }

  recon(index: number, player: PlayerId): GameResult<ReconContact[]> {
    const result = this.seek(index);
    if (!result.ok) return result;
    const current = new Set(visibleEnemies(this.state, player).map((unit) => unit.id));
    return {
      ok: true,
      value: [...this.contacts[player].values()].filter((contact) => !current.has(contact.id)).map((contact) => ({ ...contact, position: { ...contact.position } })),
    };
  }

  analysis(index: number, viewpoint: PlayerId | 'all'): GameResult<BattleAnalysis | undefined> {
    // Check the viewpoint before touching the command stream or returning full-information totals.
    if (viewpoint !== 'all') return { ok: true, value: undefined };
    const result = this.seek(index);
    return result.ok ? { ok: true, value: structuredClone({ samples: this.samples, summaries: this.summaries }) } : result;
  }
}
