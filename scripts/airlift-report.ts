/** Paired outcomes use the same scenario/seed; CPU wins do not establish human fairness. */
import { writeFileSync } from 'node:fs';
import { chooseCpuAction } from '../src/ai/rules';
import { applyGameCommand, createScenarioInitialState, operationScenarios, scenarioById, victoryReason, type GameState, type ScenarioDefinition } from '../src/game';
import { airliftScenario } from '../src/game/airlift.fixture';
const rows: object[] = [];
function run(scenario: ScenarioDefinition, version: 10 | 11, seed: number, red: 'normal' | 'hard', blue: 'normal' | 'easy') {
  let state: GameState = { ...createScenarioInitialState(scenario), ruleVersion: version, rngSeed: seed };
  let commands = 0,
    embarks = 0,
    landings = 0,
    produced = 0;
  while (!state.winner && state.turn <= 60 && commands < 10000) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? red : blue);
    const next = applyGameCommand(state, command);
    if (!next.ok) throw Error(next.error);
    if (command.type === 'produce' && command.kind === 'transportHelicopter') produced++;
    if (command.type === 'embark' && state.units.find((u) => u.id === command.transportId)?.kind === 'transportHelicopter') embarks++;
    if (command.type === 'disembark' && state.units.find((u) => u.id === command.transportId)?.kind === 'transportHelicopter') landings++;
    commands++;
    state = next.value;
  }
  const row = {
    scenario: scenario.id,
    version,
    seed,
    red,
    blue,
    winner: state.winner ?? 'none',
    turn: state.turn,
    reason: victoryReason(state),
    commands,
    produced,
    embarks,
    landings,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}
for (const scenario of operationScenarios) for (const v of [10, 11] as const) run(scenario, v, createScenarioInitialState(scenario).rngSeed, 'hard', 'easy');
for (const id of ['islands', 'river', 'admiralty']) for (const seed of [7919, 15838]) for (const v of [10, 11] as const) run(scenarioById(id)!, v, seed, 'normal', 'normal');
for (const seed of [1, 7919, 15838]) run(airliftScenario(false), 11, seed, 'normal', 'normal');
writeFileSync(process.argv[2] ?? '/tmp/v096-airlift-report.json', JSON.stringify({ base: 'b9fcc05632d76b42f6a43eed70c88a69dd2c7280', maxRounds: 60, rows }, null, 2) + '\n');
