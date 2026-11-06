import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chooseCpuAction } from '../src/ai/rules';
import { applyGameCommand, createScenarioInitialState, isGameState, isGameOver, type GameCommand, type GameState, type PlayerId, type Unit } from '../src/game';
import { tacticalScenario } from '../src/game/tacticalMaps';
import { comparisonScenario, comparisonSourceDigest } from './generatedBalance';
import type { PairedConfig } from './pairedBalance';
import { TacticalMetrics } from './tacticalMetrics';

// Run this identical script from each source tree. Reconstruct the historical
// prefixes with the released CPU only; both variants consume the same snapshots.
const [directory, output, variant] = process.argv.slice(2);
if (!directory || !output || !['before', 'after'].includes(variant ?? '') || process.argv.length !== 5)
  throw Error('Usage: vite-node scripts/recovery-report-v148.ts FIXTURE_DIRECTORY OUTPUT.json before|after');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reports = [];
for (const name of ['inland', 'coast-out', 'coast-back']) {
  const document: unknown = JSON.parse(readFileSync(resolve(directory, `${name}.json`), 'utf8'));
  const { state: initial, result } = document as { state: GameState; result: { config: PairedConfig; n: number; stateSha256: string; unit: { id: string } } };
  if (!isGameState(initial) || hash(initial) !== result.stateSha256) throw Error(`Invalid frozen snapshot: ${name}`);
  const prefix: GameCommand[] = [];
  if (variant === 'before') {
    let state: GameState = { ...createScenarioInitialState(tacticalScenario(comparisonScenario(result.config))), ruleVersion: 13, rngSeed: result.config.damageSeed as number };
    for (let i = 0; i < result.n; i++) {
      const command = chooseCpuAction(state, 'normal', state.activePlayer, state.activePlayer === 'red' ? result.config.redPolicy : result.config.bluePolicy);
      const next = applyGameCommand(state, command);
      if (!next.ok) throw Error(`Illegal prefix: ${next.error}`);
      prefix.push(command);
      state = next.value;
    }
    if (hash(state) !== result.stateSha256) throw Error(`Historical prefix diverged: ${name}`);
  }
  let state = initial;
  const metrics = new TacticalMetrics(initial),
    digest = createHash('sha256'),
    timeline: Array<{ turn: number; activePlayer: PlayerId; commands: number; unit: Pick<Unit, 'position' | 'hp' | 'fuel' | 'ammo'> | null }> = [];
  const deadline = Date.now() + 1_800_000;
  let commands = 0,
    turnCommands = 0,
    previous = '';
  const record = () => {
    const unit = state.units.find((unit) => unit.id === result.unit.id);
    const value = unit ? { position: unit.position, hp: unit.hp, fuel: unit.fuel, ammo: unit.ammo } : null;
    if (JSON.stringify(value) !== previous) {
      timeline.push({ turn: state.turn, activePlayer: state.activePlayer, commands, unit: value });
      previous = JSON.stringify(value);
    }
  };
  record();
  const first = chooseCpuAction(state, 'normal', state.activePlayer, state.activePlayer === 'red' ? result.config.redPolicy : result.config.bluePolicy);
  while (!isGameOver(state) && state.turn <= 90) {
    if (Date.now() > deadline || commands >= 25000) throw Error('Recovery comparison budget exhausted');
    const command = chooseCpuAction(state, 'normal', state.activePlayer, state.activePlayer === 'red' ? result.config.redPolicy : result.config.bluePolicy);
    const next = applyGameCommand(state, command);
    if (!next.ok) throw Error(`Illegal continuation: ${JSON.stringify(command)}: ${next.error}`);
    if (command.type === 'endTurn') turnCommands = 0;
    else if (++turnCommands > 120) throw Error('Turn command budget exhausted');
    metrics.observe(state, next.value, command);
    digest.update(JSON.stringify(command) + '\n');
    state = next.value;
    commands++;
    record();
  }
  reports.push({
    name,
    config: result.config,
    prefixCommands: prefix,
    inputStateSha256: hash(initial),
    first,
    timeline,
    winner: state.winner ?? (state.draw ? 'draw' : 'undecided'),
    turns: state.turn,
    commands,
    commandDigest: digest.digest('hex'),
    metrics: metrics.summary(),
  });
}
writeFileSync(
  output,
  JSON.stringify(
    {
      format: 'recovery-report-v148',
      variant,
      source: comparisonSourceDigest(),
      harnessSha256: createHash('sha256')
        .update(readFileSync(new URL(import.meta.url)))
        .digest('hex'),
      note: 'Three historical legal prefixes, not three independent maps or a proof of the original retreat causing the final winner. Before reconstructs every prefix. Both variants play legal continuations from the identical frozen states. Timeline tracks the originally injured unit; totals also depend on match duration.',
      reports,
    },
    null,
    2,
  ) + '\n',
);
