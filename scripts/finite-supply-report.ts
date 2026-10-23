/** Paired v9/v10 checks. Results are CPU observations, not human difficulty estimates. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chooseCpuAction, type CpuDifficulty } from '../src/ai';
import { generateSymmetricMap } from '../src/game/mapGenerator';
import {
  applyGameCommand,
  createScenarioInitialState,
  fixedSupplyAvailable,
  isDeployedUnit,
  operationScenarios,
  scenarioById,
  SUPPLY_CAPACITY,
  supplyStock,
  victoryReason,
  type GameState,
  type ScenarioDefinition,
} from '../src/game';

function run(scenario: ScenarioDefinition, group: string, ruleVersion: 9 | 10, seed: number, red: CpuDifficulty, blue: CpuDifficulty) {
  let state: GameState = { ...createScenarioInitialState(scenario), ruleVersion, rngSeed: seed };
  let commands = 0,
    inTurn = 0,
    stockConsumed = 0,
    stockRestored = 0,
    replenishments = 0,
    emptyEvents = 0,
    peakTrucks = 0;
  const began = performance.now();
  while (!state.winner && state.turn <= 60) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? red : blue);
    const next = applyGameCommand(state, command);
    if (!next.ok) throw Error(`${scenario.id}/${ruleVersion}: illegal CPU command ${JSON.stringify(command)}: ${next.error}`);
    commands++;
    if (command.type === 'endTurn') {
      inTurn = 0;
      if (ruleVersion === 10 && next.value.activePlayer !== state.activePlayer) {
        for (const truck of next.value.units.filter((unit) => unit.owner === next.value.activePlayer && unit.kind === 'apc')) {
          const previous = state.units.find((unit) => unit.id === truck.id);
          if (!previous || !isDeployedUnit(previous)) continue;
          const restored = fixedSupplyAvailable(state, previous.position, previous.kind, previous.owner) ? SUPPLY_CAPACITY - supplyStock(previous) : 0;
          const spent = supplyStock(previous) + restored - supplyStock(truck);
          if (spent < 0) throw Error('Unexplained stock creation');
          stockConsumed += spent;
          stockRestored += restored;
          if (restored > 0) replenishments++;
          if (supplyStock(truck) === 0 && supplyStock(previous) + restored > 0) emptyEvents++;
        }
      }
    } else if (++inTurn > 120) throw Error(`${scenario.id}/${ruleVersion}: CPU turn did not end`);
    state = next.value;
    peakTrucks = Math.max(peakTrucks, state.units.filter((unit) => unit.kind === 'apc').length);
  }
  return {
    group,
    scenarioId: scenario.id,
    ruleVersion,
    seed,
    red,
    blue,
    winner: state.winner ?? 'none',
    turns: state.turn,
    reason: state.winner ? victoryReason(state, scenario) : 'none',
    commands,
    peakTrucks,
    stockConsumed,
    stockRestored,
    replenishments,
    emptyEvents,
    elapsedMs: Math.round(performance.now() - began),
  };
}

function productionDigests() {
  const paths: string[] = ['scripts/finite-supply-report.ts'];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (!/\.(?:test|fixture)\.ts$/.test(path)) paths.push(path);
    }
  };
  walk('src/game');
  walk('src/ai');
  return Object.fromEntries(paths.sort().map((path) => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
}

const results: ReturnType<typeof run>[] = [];
function pair(scenario: ScenarioDefinition, group: string, seed: number, red: CpuDifficulty, blue: CpuDifficulty) {
  for (const version of [9, 10] as const) {
    const result = run(scenario, group, version, seed, red, blue);
    results.push(result);
    process.stderr.write(
      `${scenario.id} v${version} seed=${seed}: ${result.winner}/${result.reason}/${result.turns}; stock used=${result.stockConsumed}, refills=${result.replenishments}\n`,
    );
  }
}
for (const scenario of operationScenarios) pair(scenario, 'authored-reference', createScenarioInitialState(scenario).rngSeed, 'hard', 'easy');
for (const id of ['supply-contest', 'supply-ridge', 'bridgehead', 'river-withdrawal']) {
  for (const seed of [7919, 15838]) pair(scenarioById(id)!, 'normal-independent-seeds', seed, 'normal', 'normal');
}
for (const seed of ['stock-check-A', 'stock-check-B']) {
  const generated = generateSymmetricMap({ size: 16, sea: 'coast', preset: 'frontline', seed });
  if (!generated.ok) throw Error(generated.error);
  pair(generated.value, 'generated-normal', createScenarioInitialState(generated.value).rngSeed, 'normal', 'normal');
}
const output = process.argv[2] ?? '/tmp/ministr-finite-supply-results.json';
mkdirSync(dirname(output), { recursive: true });
const report = {
  schemaVersion: 1,
  baseSha: 'db9fa9cfc2aa4fee500c9c460c6bb982449e4084',
  recordedAt: new Date().toISOString(),
  capacity: SUPPLY_CAPACITY,
  maxRounds: 60,
  sourceSHA256: productionDigests(),
  results,
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    output,
    cases: results.length,
    undecided: results.filter((result) => result.winner === 'none').length,
    finiteStockConsumed: results.reduce((total, result) => total + result.stockConsumed, 0),
    replenishments: results.reduce((total, result) => total + result.replenishments, 0),
    emptyEvents: results.reduce((total, result) => total + result.emptyEvents, 0),
  }),
);
