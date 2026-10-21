import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  applyGameCommand,
  createScenarioInitialState,
  isDeployedUnit,
  operationScenarios,
  scenarioById,
  scenarioForState,
  suppliedByDepot,
  victoryReason,
  type GameState,
  type PlayerId,
} from '../src/game';
import { chooseCpuAction, type CpuDifficulty } from '../src/ai/rules';
import { bluePlanningState } from '../src/ai/perspective';

const args = process.argv.slice(2);
if (![4, 6].includes(args.length) || args[0] !== '--phase' || !['tune', 'verify', 'regression'].includes(args[1]!) || args[2] !== '--output' || !args[3])
  throw Error('Usage: --phase tune|verify|regression --output file.jsonl [--blue-bonus 0..10000]');
const bonus = args.length === 6 ? Number(args[5]) : undefined;
if (args.length === 6 && (args[4] !== '--blue-bonus' || !Number.isSafeInteger(bonus) || bonus! < 0 || bonus! > 10000)) throw Error('Blue bonus must be an integer from 0 to 10000');
const phase = args[1]!;
const output = args[3]!;
const files = ['src/game', 'src/ai']
  .flatMap((folder) =>
    readdirSync(folder)
      .filter((file) => file.endsWith('.ts') && !/\.(test|fixture)\.ts$/.test(file))
      .map((file) => `${folder}/${file}`),
  )
  .sort();
const hash = createHash('sha256');
for (const file of files) hash.update(file).update('\0').update(readFileSync(file)).update('\0');
const revision = process.env.SIMULATION_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty =
  process.env.SIMULATION_SOURCE_DIRTY === undefined
    ? execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
    : process.env.SIMULATION_SOURCE_DIRTY === 'true';
writeFileSync(
  output,
  JSON.stringify({
    type: 'header',
    blueBonusOverride: bonus,
    phase,
    revision,
    dirty,
    simulationSourceSHA256: hash.digest('hex'),
    scriptSHA256: createHash('sha256')
      .update(readFileSync(new URL(import.meta.url)))
      .digest('hex'),
    maxRounds: 60,
    commandsPerTurn: 120,
    seeds: phase === 'verify' ? [23757, 31676] : phase === 'tune' ? [1, 7919] : ['authored'],
  }) + '\n',
);
const deadline = performance.now() + 600_000;
const matchups: readonly (readonly [CpuDifficulty, CpuDifficulty])[] =
  phase === 'regression'
    ? [['hard', 'easy']]
    : [
        ['easy', 'easy'],
        ['normal', 'normal'],
        ['hard', 'hard'],
        ['hard', 'normal'],
        ['normal', 'hard'],
      ];
const scenarios = phase === 'regression' ? operationScenarios : ['supply-contest', 'supply-ridge'].map((id) => scenarioById(id)!);
for (const scenario of scenarios)
  for (const seed of phase === 'regression' ? [createScenarioInitialState(scenario).rngSeed] : phase === 'verify' ? [23757, 31676] : [1, 7919])
    for (const [red, blue] of matchups)
      for (const rotated of phase === 'regression' ? [false] : [false, true]) {
        let state: GameState = { ...createScenarioInitialState(scenario), rngSeed: seed };
        if (bonus !== undefined && scenario.id === 'supply-contest')
          state = { ...state, players: { ...state.players, blue: { ...state.players.blue, gold: scenario.startingGold + bonus } } };
        if (rotated) state = bluePlanningState(state);
        const started = performance.now();
        const fortified: Record<PlayerId, number> = { red: 0, blue: 0 };
        const depotCoveredRefills: Record<PlayerId, number> = { red: 0, blue: 0 };
        let commands = 0;
        let turnCommands = 0;
        while (!state.winner && state.turn <= 60) {
          if (performance.now() > deadline) throw Error('Evaluation exceeded 600 seconds; output contains only finished matches');
          const command = chooseCpuAction(state, state.activePlayer === 'red' ? red : blue);
          const applied = applyGameCommand(state, command);
          if (!applied.ok) throw Error(`Illegal ${scenario.id}: ${JSON.stringify(command)}: ${applied.error}`);
          if (command.type === 'fortify') fortified[state.activePlayer]++;
          if (command.type === 'endTurn') {
            turnCommands = 0;
            for (const unit of applied.value.units) {
              const previous = state.units.find((candidate) => candidate.id === unit.id);
              if (
                unit.owner === applied.value.activePlayer &&
                previous &&
                isDeployedUnit(unit) &&
                suppliedByDepot(applied.value, unit.position, unit.owner) &&
                ((unit.ammo ?? 0) > (previous.ammo ?? 0) || (unit.secondaryAmmo ?? 0) > (previous.secondaryAmmo ?? 0) || (unit.fuel ?? 0) > (previous.fuel ?? 0))
              )
                depotCoveredRefills[unit.owner]++;
            }
          } else if (++turnCommands > 120) throw Error('CPU exceeded per-turn command budget');
          state = applied.value;
          commands++;
        }
        const result = {
          type: 'match',
          scenarioId: scenario.id,
          blueOpeningBonus: scenario.id === 'supply-contest' ? (bonus ?? scenario.secondPlayerBonus ?? 0) : (scenario.secondPlayerBonus ?? 0),
          seed,
          red,
          blue,
          rotated,
          winner: state.winner ?? 'none',
          reason: state.winner ? victoryReason(state, scenarioForState(state)!) : 'none',
          turns: state.turn,
          commands,
          fortified,
          depotCoveredRefills,
          elapsedMs: Math.round(performance.now() - started),
        };
        appendFileSync(output, JSON.stringify(result) + '\n');
        process.stdout.write(JSON.stringify(result) + '\n');
      }
