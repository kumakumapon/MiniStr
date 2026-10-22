import { performance } from 'node:perf_hooks';
import { appendFileSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chooseCpuAction, type CpuDifficulty } from '../src/ai/rules';
import { applyGameCommand } from '../src/game/session';
import { generateSymmetricMap, generateSymmetricMapV1, GENERATED_SEAS, GENERATED_SIZES, type MapGenerationOptions } from '../src/game/mapGenerator';
import { createScenarioInitialState, loadScenarioDefinitions, scenarioDefinitionToData, type ScenarioDefinition } from '../src/game/maps';
import { movementCost } from '../src/game/terrain';
import { isPropertyTerrainKind } from '../src/game/facilities';
import { CURRENT_RULE_VERSION, ruleVersions, type GameState, type PlayerId, type Position } from '../src/game/types';
import { victoryReason } from '../src/game/victory';

export interface GeneratedBalanceOptions {
  sizes: MapGenerationOptions['size'][];
  seas: MapGenerationOptions['sea'][];
  seeds: string[];
  damageSeeds: (number | 'scenario')[];
  orientations: ('normal' | 'rotated')[];
  matchups: [CpuDifficulty, CpuDifficulty][];
  variants: ('baseline' | 'wide' | 'seeded' | 'frontline')[];
  bonuses: number[];
  rounds: number;
  seconds: number;
  maxGames: number;
  rule: NonNullable<GameState['ruleVersion']>;
  output?: string;
}
export function parseGeneratedBalanceArgs(args: readonly string[]): GeneratedBalanceOptions {
  const flags = new Set([
    '--sizes',
    '--seas',
    '--seeds',
    '--damage-seeds',
    '--orientations',
    '--matchups',
    '--variants',
    '--bonuses',
    '--rounds',
    '--seconds',
    '--max-games',
    '--rule',
    '--output',
  ]);
  const values = new Map<string, string>();
  for (let at = 0; at < args.length; at += 2) {
    const key = args[at]!,
      value = args[at + 1];
    if (!flags.has(key) || values.has(key) || !value || value.startsWith('--')) throw Error(`Invalid or duplicate option: ${key}`);
    values.set(key, value);
  }
  const list = (key: string, fallback: string) => {
    const items = (values.get(key) ?? fallback).split(',');
    if (items.some((item) => !item || item.trim() !== item) || new Set(items).size !== items.length) throw Error(`Invalid list: ${key}`);
    return items;
  };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(values.get(key) ?? fallback);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw Error(`Invalid integer: ${key}`);
    return n;
  };
  const sizes = list('--sizes', '16').map(Number);
  const seas = list('--seas', 'none,coast,ocean');
  const seeds = list('--seeds', 'seed-1,seed-2,seed-3');
  const damageSeeds = list('--damage-seeds', 'scenario').map((value) => (value === 'scenario' ? ('scenario' as const) : Number(value)));
  const orientations = list('--orientations', 'normal');
  const matchups = list('--matchups', 'normal:normal').map((pair) => pair.split(':'));
  const variants = list('--variants', 'baseline');
  const bonuses = list('--bonuses', '2000').map(Number);
  if (
    sizes.some((size) => !GENERATED_SIZES.some((allowed) => allowed === size)) ||
    seas.some((sea) => !GENERATED_SEAS.some((allowed) => allowed === sea)) ||
    seeds.some((seed) => !/^[A-Za-z0-9_-]{1,24}$/.test(seed)) ||
    damageSeeds.some((seed) => seed !== 'scenario' && (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)) ||
    orientations.some((value) => value !== 'normal' && value !== 'rotated') ||
    matchups.some((pair) => pair.length !== 2 || pair.some((difficulty) => !['easy', 'normal', 'hard'].includes(difficulty))) ||
    variants.some((value) => value !== 'baseline' && value !== 'wide' && value !== 'seeded' && value !== 'frontline') ||
    bonuses.some((bonus) => !Number.isSafeInteger(bonus) || bonus < 0 || bonus > 20_000)
  )
    throw Error('Unsupported generated comparison settings');
  const rule = integer('--rule', CURRENT_RULE_VERSION, 6, CURRENT_RULE_VERSION);
  if (!ruleVersions.some((version) => version === rule)) throw Error('Unsupported rule');
  const options: GeneratedBalanceOptions = {
    sizes: sizes as GeneratedBalanceOptions['sizes'],
    seas: seas as GeneratedBalanceOptions['seas'],
    seeds,
    damageSeeds,
    orientations: orientations as GeneratedBalanceOptions['orientations'],
    matchups: matchups as GeneratedBalanceOptions['matchups'],
    variants: variants as GeneratedBalanceOptions['variants'],
    bonuses,
    rounds: integer('--rounds', 60, 1, 120),
    seconds: integer('--seconds', 600, 1, 3600),
    maxGames: integer('--max-games', 128, 1, 1000),
    rule: rule as GeneratedBalanceOptions['rule'],
    ...(values.has('--output') ? { output: values.get('--output')! } : {}),
  };
  const games = [sizes, seas, seeds, damageSeeds, orientations, matchups, variants, bonuses].reduce((n, items) => n * items.length, 1);
  if (games > options.maxGames) throw Error(`Matrix ${games} exceeds --max-games ${options.maxGames}`);
  return options;
}

export interface GeneratedCase {
  size: MapGenerationOptions['size'];
  sea: MapGenerationOptions['sea'];
  seed: string;
  damageSeed: number | 'scenario';
  orientation: GeneratedBalanceOptions['orientations'][number];
  variant: GeneratedBalanceOptions['variants'][number];
  bonus: number;
  red: CpuDifficulty;
  blue: CpuDifficulty;
}
export function generatedCases(options: GeneratedBalanceOptions): GeneratedCase[] {
  const result: GeneratedCase[] = [];
  for (const size of options.sizes)
    for (const sea of options.seas)
      for (const seed of options.seeds)
        for (const damageSeed of options.damageSeeds)
          for (const orientation of options.orientations)
            for (const variant of options.variants)
              for (const bonus of options.bonuses) for (const [red, blue] of options.matchups) result.push({ size, sea, seed, damageSeed, orientation, variant, bonus, red, blue });
  return result;
}

export function comparisonScenario(config: GeneratedCase): ScenarioDefinition {
  const generated = (config.variant === 'seeded' || config.variant === 'frontline' ? generateSymmetricMap : generateSymmetricMapV1)({
    size: config.size,
    sea: config.sea,
    seed: config.seed,
    ...(config.variant === 'frontline' ? { preset: 'frontline' } : {}),
  });
  if (!generated.ok) throw Error(generated.error);
  const scenario = structuredClone(generated.value),
    { width, height } = scenario.board;
  scenario.secondPlayerBonus = config.bonus;
  if (config.variant === 'wide') {
    const band = config.sea === 'none' ? 0 : config.sea === 'coast' ? 1 : 2;
    for (let y = height / 2 - 2; y <= height / 2 + 1; y++)
      for (let x = band; x < width - band; x++) if (!isPropertyTerrainKind(scenario.board.terrain[y]![x]!.kind)) scenario.board.terrain[y]![x] = { kind: 'road' };
  }
  if (config.orientation === 'rotated') {
    scenario.board.terrain = [...scenario.board.terrain].reverse().map((row) => [...row].reverse());
    scenario.initialUnits = scenario.initialUnits.map((unit) => ({ ...unit, x: width - 1 - unit.x, y: height - 1 - unit.y }));
  }
  const loaded = loadScenarioDefinitions([scenarioDefinitionToData(scenario)]);
  if (!loaded.ok) throw Error(loaded.error);
  return loaded.value[0]!;
}

/** Terrain-only infantry cost to the closest neutral property; blockers are deliberately excluded. */
export function openingDistance(scenario: ScenarioDefinition, player: PlayerId): number | null {
  const starts = scenario.initialUnits.filter((unit) => unit.owner === player && unit.kind === 'infantry');
  const costs = new Map(starts.map((unit) => [`${unit.x},${unit.y}`, 0]));
  const queue: Position[] = starts.map((unit) => ({ x: unit.x, y: unit.y }));
  while (queue.length) {
    queue.sort((a, b) => costs.get(`${a.x},${a.y}`)! - costs.get(`${b.x},${b.y}`)!);
    const current = queue.shift()!,
      cost = costs.get(`${current.x},${current.y}`)!;
    const tile = scenario.board.terrain[current.y]![current.x]!;
    if (isPropertyTerrainKind(tile.kind) && tile.owner === undefined) return cost;
    for (const next of [
      { x: current.x - 1, y: current.y },
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y - 1 },
      { x: current.x, y: current.y + 1 },
    ]) {
      const total = cost + movementCost(scenario.board, next, 'infantry'),
        key = `${next.x},${next.y}`;
      if (Number.isFinite(total) && total < (costs.get(key) ?? Infinity)) {
        costs.set(key, total);
        queue.push(next);
      }
    }
  }
  return null;
}

export interface GeneratedResult extends GeneratedCase {
  resolvedDamageSeed: number;
  winner: PlayerId | 'none';
  turns: number;
  commands: number;
  reason: string;
  elapsedMs: number;
  openingDistance: Record<PlayerId, number | null>;
  firstNeutralCapture: Partial<Record<PlayerId, number>>;
}
export function playGenerated(
  config: GeneratedCase,
  options: Pick<GeneratedBalanceOptions, 'rule' | 'rounds'>,
  deadline = Infinity,
  now = () => performance.now(),
): GeneratedResult {
  const start = now(),
    scenario = comparisonScenario(config);
  let state: GameState = {
    ...createScenarioInitialState(scenario),
    rngSeed: config.damageSeed === 'scenario' ? createScenarioInitialState(scenario).rngSeed : config.damageSeed,
    ruleVersion: options.rule,
  };
  let commands = 0,
    commandsThisTurn = 0;
  const firstNeutralCapture: GeneratedResult['firstNeutralCapture'] = {};
  while (!state.winner && state.turn <= options.rounds) {
    if (now() >= deadline) throw Error('Generated comparison exceeded its time budget');
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? config.red : config.blue);
    const applied = applyGameCommand(state, command);
    if (!applied.ok) throw Error(`Illegal CPU order ${JSON.stringify(config)} ${JSON.stringify(command)}: ${applied.error}`);
    if (command.type === 'capture' && firstNeutralCapture[state.activePlayer] === undefined) {
      const unit = state.units.find((unit) => unit.id === command.unitId)!;
      if (
        unit.position &&
        scenario.board.terrain[unit.position.y]![unit.position.x]!.owner === undefined &&
        applied.value.board.terrain[unit.position.y]![unit.position.x]!.owner === state.activePlayer
      )
        firstNeutralCapture[state.activePlayer] = state.turn;
    }
    if (command.type === 'endTurn') commandsThisTurn = 0;
    else if (++commandsThisTurn > 120) throw Error('CPU did not finish its turn');
    state = applied.value;
    commands++;
  }
  return {
    ...config,
    resolvedDamageSeed: config.damageSeed === 'scenario' ? createScenarioInitialState(scenario).rngSeed : config.damageSeed,
    winner: state.winner ?? 'none',
    turns: state.turn,
    commands,
    reason: state.winner ? (victoryReason(state, scenario) ?? 'unknown') : 'none',
    elapsedMs: Math.round(now() - start),
    openingDistance: { red: openingDistance(scenario, 'red'), blue: openingDistance(scenario, 'blue') },
    firstNeutralCapture,
  };
}

export function summarizeGenerated(results: readonly GeneratedResult[]) {
  const groups = new Map<string, GeneratedResult[]>();
  for (const row of results) {
    const key = `${row.size}/${row.sea}/${row.variant}/bonus${row.bonus}/${row.orientation}/${row.red}:${row.blue}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([condition, rows]) => ({
    condition,
    games: rows.length,
    red: rows.filter((row) => row.winner === 'red').length,
    blue: rows.filter((row) => row.winner === 'blue').length,
    undecided: rows.filter((row) => row.winner === 'none').length,
    meanTurns: rows.reduce((sum, row) => sum + row.turns, 0) / rows.length,
    commands: rows.reduce((sum, row) => sum + row.commands, 0),
    elapsedMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0),
  }));
}

/** Hash the simulation sources even when measuring an uncommitted working tree. */
export function comparisonSourceDigest(): string {
  const hash = createHash('sha256');
  for (const directory of ['src/game', 'src/ai']) {
    const root = new URL(`../${directory}/`, import.meta.url);
    for (const file of readdirSync(root)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.fixture.ts'))
      .sort()) {
      hash.update(`${directory}/${file}\0`);
      hash.update(readFileSync(new URL(file, root)));
    }
  }
  hash.update(readFileSync(new URL('./generatedBalance.ts', import.meta.url)));
  return hash.digest('hex');
}

export function runGeneratedComparison(args: readonly string[]): void {
  const options = parseGeneratedBalanceArgs(args),
    started = performance.now(),
    results: GeneratedResult[] = [];
  const header = {
    schemaVersion: 1,
    kind: 'generated-balance',
    sha: process.env.GITHUB_SHA ?? 'unrecorded',
    sourceState: 'working-tree',
    sourceDigest: comparisonSourceDigest(),
    options,
  };
  if (options.output) writeFileSync(options.output, JSON.stringify(header) + '\n');
  const emit = (entry: unknown) => {
    if (options.output) appendFileSync(options.output, JSON.stringify(entry) + '\n');
  };
  try {
    for (const config of generatedCases(options)) {
      const result = playGenerated(config, options, started + options.seconds * 1000);
      results.push(result);
      emit({ result });
      process.stderr.write(
        `${results.length}: ${config.size}/${config.sea}/${config.seed}/${config.damageSeed}/${config.variant}/${config.bonus}/${config.orientation} ${config.red}:${config.blue} ${result.winner} T${result.turns}\n`,
      );
    }
    const summary = { complete: true, summaries: summarizeGenerated(results) };
    emit(summary);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    emit({ complete: false, error: String(error), summaries: summarizeGenerated(results) });
    throw error;
  }
}
