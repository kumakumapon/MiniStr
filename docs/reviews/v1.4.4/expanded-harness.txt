import { catalogTacticalScenario } from './tacticalScenarios';
import { TacticalMetrics } from './tacticalMetrics';
import { openingDistance } from './generatedBalance';
import { victoryReason } from '../src/game/victory';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { chooseCpuAction } from '../src/ai/rules';
import {
  applyGameCommand,
  createScenarioInitialState,
  isGameOver,
  loadScenarioDefinitions,
  scenarioDefinitionToData,
  tacticalFeatures,
  validTacticalOptions,
  type GameState,
  type TacticalOptions,
} from '../src/game';
import { tacticalScenario } from '../src/game/tacticalMaps';
import { comparisonScenario, comparisonSourceDigest, type GeneratedCase } from './generatedBalance';
import { returnLeg, type PairedConfig } from './pairedBalance';

const args = process.argv.slice(2);
const flags = new Map<string, string>();
const allowed = new Set([
  '--catalog',
  '--profiles',
  '--layouts',
  '--cpu',
  '--sizes',
  '--seas',
  '--seeds',
  '--damage-seeds',
  '--policies',
  '--rounds',
  '--max-games',
  '--seconds',
  '--output',
  '--initiative',
  '--plain-cover',
  '--matchups',
  '--bonuses',
]);
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.has(args[i]!) || !args[i + 1] || flags.has(args[i]!)) throw Error('Invalid tactical comparison arguments');
  flags.set(args[i]!, args[i + 1]!);
}
const list = (key: string, fallback: string) => (flags.get(key) ?? fallback).split(',');
const positive = (key: string, fallback: number, maximum: number) => {
  const value = Number(flags.get(key) ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw Error(`Invalid ${key}`);
  return value;
};
const matchups = list('--matchups', 'normal:normal').map((pair) => pair.split(':'));
const bonuses = list('--bonuses', '2000').map(Number);
if (matchups.some((pair) => pair.length !== 2 || pair.some((d) => !['easy', 'normal', 'hard'].includes(d))) || bonuses.some((b) => !Number.isSafeInteger(b) || b < 0 || b > 20000))
  throw Error('Unsupported matchup or bonus');
const catalog = flags.get('--catalog');
if (catalog) catalogTacticalScenario(catalog, false);
const profiles = list('--profiles', 'classic,transport,combined');
const layouts = list('--layouts', 'original,revised');
const cpus = list('--cpu', 'adapted');
const sizes = list('--sizes', '16').map(Number);
const seas = list('--seas', catalog ? 'none' : 'none,coast');
const seeds = list('--seeds', 'v140-explore');
const damageSeeds = list('--damage-seeds', '1401').map(Number);
const policies = list('--policies', 'balanced:balanced');
const initiatives = list('--initiative', '3').map(Number);
const plainCover = flags.get('--plain-cover') ?? 'false';
if (initiatives.some((x) => ![0, 3, 5].includes(x)) || !['true', 'false'].includes(plainCover)) throw Error('Unsupported initiative or cover');
const rounds = positive('--rounds', 60, 120),
  maxGames = positive('--max-games', 128, 4096),
  seconds = positive('--seconds', 600, 3600);
function optionsFor(profile: string): TacticalOptions | undefined {
  if (profile === 'classic' || profile === 'transport') return;
  const enabled = profile === 'combined' ? [...tacticalFeatures] : profile === 'base' ? [] : profile.split('+');
  if (enabled.some((x) => !tacticalFeatures.includes(x as never))) throw Error(`Invalid profile ${profile}`);
  const options = Object.fromEntries(tacticalFeatures.map((key) => [key, enabled.includes(key)]));
  if (!validTacticalOptions(options)) throw Error('Invalid tactical options');
  return options;
}
profiles.forEach(optionsFor);
if (
  layouts.some((x) => !['original', 'revised'].includes(x)) ||
  cpus.some((x) => !['baseline', 'adapted'].includes(x)) ||
  sizes.some((x) => ![16, 20, 24, 32].includes(x)) ||
  seas.some((x) => !['none', 'coast', 'ocean'].includes(x)) ||
  seeds.some((x) => !/^[A-Za-z0-9_-]{1,24}$/.test(x)) ||
  damageSeeds.some((x) => !Number.isSafeInteger(x) || x < 0 || x > 0xffffffff) ||
  policies.some((x) => !/^(balanced|offensive|defensive):(balanced|offensive|defensive)$/.test(x))
)
  throw Error('Unsupported tactical matrix');
const requested = [profiles, layouts, cpus, sizes, seas, seeds, damageSeeds, policies, initiatives, matchups, bonuses].reduce((n, values) => n * values.length, 2);
if (requested > maxGames) throw Error(`Requested ${requested} games exceeds ${maxGames}`);
const output = flags.get('--output');
if (output) writeFileSync(output, '');
const emit = (value: unknown) => {
  const line = JSON.stringify(value);
  if (output) appendFileSync(output, line + '\n');
  else process.stdout.write(line + '\n');
};
emit({
  format: 'tactical-balance-v1',
  source: comparisonSourceDigest(),
  harness: createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .update(readFileSync(new URL('./tacticalMetrics.ts', import.meta.url)))
    .update(readFileSync(new URL('./tacticalScenarios.ts', import.meta.url)))
    .digest('hex'),
  runtime: process.version,
  requested,
  catalog,
  rounds,
  note: 'Red always starts. Return legs rotate the map and exchange policies; observations are correlated. Base is v13 common observed-route/contact physics with all optional features off. Transport isolates moved unloading on legacy movement. Baseline CPU means old heuristics using the current legal forecasts. Weather has an independent fixed stream. Undecided games are neither wins nor draws.',
});
const start = performance.now();
let completed = 0;
try {
  for (const [redDifficulty, blueDifficulty] of matchups)
    for (const bonus of bonuses)
      for (const initiative of initiatives)
        for (const profile of profiles)
          for (const layout of layouts)
            for (const cpu of cpus)
              for (const size of sizes)
                for (const sea of seas)
                  for (const seed of seeds)
                    for (const damageSeed of damageSeeds)
                      for (const policy of policies) {
                        const [redPolicy, bluePolicy] = policy.split(':') as [PairedConfig['redPolicy'], PairedConfig['bluePolicy']];
                        const config: PairedConfig = {
                          size: size as GeneratedCase['size'],
                          sea: sea as GeneratedCase['sea'],
                          seed,
                          damageSeed,
                          variant: 'frontline',
                          orientation: 'normal',
                          bonus,
                          red: redDifficulty as PairedConfig['red'],
                          blue: blueDifficulty as PairedConfig['blue'],
                          redPolicy,
                          bluePolicy,
                        };
                        for (const [leg, c] of [config, returnLeg(config)].entries()) {
                          let scenario = catalog ? catalogTacticalScenario(catalog, c.orientation === 'rotated') : comparisonScenario(c);
                          if (layout === 'revised') scenario = tacticalScenario(scenario);
                          const data = scenarioDefinitionToData(scenario);
                          delete data.tacticalOptions;
                          if (flags.has('--bonuses')) data.secondPlayerBonus = c.bonus;
                          const options = optionsFor(profile);
                          if (options) {
                            if (options.simultaneous) options.initiative = initiative as 0 | 3 | 5;
                            if (options.terrain && plainCover === 'true') options.plainCover = true;
                            data.tacticalOptions = options;
                          }
                          const loaded = loadScenarioDefinitions([data]);
                          if (!loaded.ok) throw Error(loaded.error);
                          let state: GameState = { ...createScenarioInitialState(loaded.value[0]!), rngSeed: damageSeed, ruleVersion: profile === 'classic' ? 12 : 13 };
                          const metrics = new TacticalMetrics(state);
                          const opening = { red: openingDistance(loaded.value[0]!, 'red'), blue: openingDistance(loaded.value[0]!, 'blue') };
                          const digest = createHash('sha256');
                          const times: number[] = [];
                          let commands = 0,
                            turnCommands = 0,
                            ambushes = 0,
                            submarineShots = 0,
                            unloads = 0;
                          while (!isGameOver(state) && state.turn <= rounds) {
                            if (performance.now() - start > seconds * 1000) throw Error('Comparison time budget exhausted');
                            const tick = performance.now();
                            const action = chooseCpuAction(
                              state,
                              state.activePlayer === 'red' ? c.red : c.blue,
                              state.activePlayer,
                              state.activePlayer === 'red' ? c.redPolicy : c.bluePolicy,
                              cpu === 'adapted',
                            );
                            times.push(performance.now() - tick);
                            const next = applyGameCommand(state, action);
                            if (!next.ok) throw Error(`Illegal order: ${JSON.stringify(action)}: ${next.error}`);
                            if (action.type === 'move' && next.value.tactics?.lastCombat?.ambush) ambushes++;
                            if (action.type === 'attack' && state.units.some((u) => u.id === action.unitId && u.kind === 'submarine')) submarineShots++;
                            if (action.type === 'disembark' && next.value.units.filter((u) => u.embarkedIn).length < state.units.filter((u) => u.embarkedIn).length) unloads++;
                            if (action.type === 'endTurn') turnCommands = 0;
                            else if (++turnCommands > 120) throw Error('CPU turn command budget exhausted');
                            if (++commands > 25000) throw Error('Game command budget exhausted');
                            metrics.observe(state, next.value, action);
                            digest.update(JSON.stringify(action) + '\n');
                            state = next.value;
                          }
                          times.sort((a, b) => a - b);
                          const row = {
                            matchup: `${c.red}:${c.blue}`,
                            secondPlayerBonus: loaded.value[0]!.secondPlayerBonus,
                            profile,
                            initiative,
                            plainCover: plainCover === 'true',
                            layout,
                            cpu,
                            size: state.board.width,
                            height: state.board.height,
                            mapId: loaded.value[0]!.id,
                            sea: catalog ? 'catalog' : sea,
                            seed,
                            damageSeed,
                            weatherSeed: state.tactics?.weatherSeed,
                            policy,
                            redPolicy: c.redPolicy,
                            bluePolicy: c.bluePolicy,
                            leg,
                            orientation: c.orientation,
                            winner: state.draw ? 'draw' : (state.winner ?? 'undecided'),
                            reason: state.draw ? 'draw' : state.winner ? victoryReason(state, loaded.value[0]!) : 'round-limit',
                            tacticalOptions: state.tactics?.options,
                            openingDistance: opening,
                            metrics: metrics.summary(),
                            turns: state.turn,
                            commands,
                            ambushes,
                            submarineShots,
                            unloads,
                            commandDigest: digest.digest('hex'),
                            cpuP95Ms: times[Math.max(0, Math.ceil(times.length * 0.95) - 1)] ?? 0,
                          };
                          completed++;
                          emit({ result: row });
                          process.stderr.write(`${completed}/${requested} ${profile}/${layout}/${cpu} ${size}/${sea}/${seed} leg${leg} ${row.winner} T${row.turns}\n`);
                        }
                      }
  emit({ complete: true, completed, elapsedMs: performance.now() - start });
} catch (error) {
  emit({ complete: false, completed, error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
