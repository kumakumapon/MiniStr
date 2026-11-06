import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chooseCpuAction } from '../src/ai/rules';
import {
  applyGameCommand,
  createScenarioInitialState,
  isGameState,
  isGameOver,
  loadScenarioDefinitions,
  scenarioDefinitionToData,
  tacticalFeatures,
  type GameCommand,
  type GameState,
} from '../src/game';
import { tacticalScenario } from '../src/game/tacticalMaps';
import { comparisonScenario, comparisonSourceDigest } from './generatedBalance';
import type { PairedConfig } from './pairedBalance';
import { TacticalMetrics } from './tacticalMetrics';

const [input, output, mode] = process.argv.slice(2);
if (!input || !output || !['policy', 'alternate'].includes(mode ?? '') || process.argv.length !== 5) throw Error('Usage: INPUT OUTPUT policy|alternate');
const fixture = JSON.parse(readFileSync(input, 'utf8')) as {
  result: { config: PairedConfig; stateSha256: string; old: GameCommand; unit: { id: string } };
  state: GameState;
  prefix: GameCommand[];
};
const hash = (state: unknown) => createHash('sha256').update(JSON.stringify(state)).digest('hex');
if (!isGameState(fixture.state) || hash(fixture.state) !== fixture.result.stateSha256) throw Error('Invalid frozen state');
const data = scenarioDefinitionToData(tacticalScenario(comparisonScenario(fixture.result.config)));
data.tacticalOptions = { ...Object.fromEntries(tacticalFeatures.map((key) => [key, true])), initiative: 3 } as typeof data.tacticalOptions;
const loaded = loadScenarioDefinitions([data]);
if (!loaded.ok) throw Error(loaded.error);
let state: GameState = { ...createScenarioInitialState(loaded.value[0]!), ruleVersion: 13, rngSeed: fixture.result.config.damageSeed as number };
const digest = createHash('sha256');
const metrics = new TacticalMetrics(state);
for (const command of fixture.prefix) {
  const next = applyGameCommand(state, command);
  if (!next.ok) throw Error(`Illegal prefix: ${next.error}`);
  metrics.observe(state, next.value, command);
  digest.update(JSON.stringify(command) + '\n');
  state = next.value;
}
if (hash(state) !== fixture.result.stateSha256) throw Error('Prefix state mismatch');
const config = fixture.result.config;
const commands: GameCommand[] = [];
const timeline = [];
let turnCommands = 0;
const deadline = Date.now() + 1800000;
while (!isGameOver(state) && state.turn <= 90) {
  if (Date.now() > deadline || commands.length + fixture.prefix.length >= 25000) throw Error('Continuation budget exhausted');
  const player = state.activePlayer;
  const command = mode === 'alternate' && !commands.length ? fixture.result.old : chooseCpuAction(state, 'normal', player, player === 'red' ? config.redPolicy : config.bluePolicy);
  const next = applyGameCommand(state, command);
  if (!next.ok) throw Error(`Illegal continuation: ${next.error}`);
  if (command.type === 'endTurn') turnCommands = 0;
  else if (++turnCommands > 120) throw Error('Turn budget exhausted');
  metrics.observe(state, next.value, command);
  digest.update(JSON.stringify(command) + '\n');
  commands.push(command);
  const unit = state.units.find((u) => u.id === fixture.result.unit.id);
  if (('unitId' in command && command.unitId === unit?.id) || command.type === 'endTurn')
    timeline.push({ turn: state.turn, player, command, unit, gold: state.players.blue.gold, income: state.players.blue.income });
  state = next.value;
}
const result = {
  format: 'coastal-recovery-v149',
  mode,
  source: comparisonSourceDigest(),
  inputStateSha256: fixture.result.stateSha256,
  prefixCommands: fixture.prefix.length,
  continuationCommands: commands.length,
  first: commands[0],
  winner: state.winner ?? (state.draw ? 'draw' : 'undecided'),
  turn: state.turn,
  commandDigest: digest.digest('hex'),
  metrics: metrics.summary(),
  timeline,
  commands,
  note:
    mode === 'alternate'
      ? 'One legal first order forced; later orders use the unchanged policy. A counterfactual branch, not a fresh independent game.'
      : 'Released/candidate policy continuation from the same legally reconstructed state.',
};
writeFileSync(output, JSON.stringify(result) + '\n');
console.log(
  JSON.stringify({ mode, first: result.first, winner: result.winner, turn: result.turn, commands: fixture.prefix.length + commands.length, commandDigest: result.commandDigest }),
);
