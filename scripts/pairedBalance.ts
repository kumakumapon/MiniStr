import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { chooseCpuAction } from '../src/ai/rules';
import { isArmyPolicy, type ArmyPolicy } from '../src/game/armyPolicy';
import { applyGameCommand, createScenarioInitialState, victoryReason, CURRENT_RULE_VERSION, type RuleVersion, type PlayerId } from '../src/game';
import { comparisonScenario, comparisonSourceDigest, generatedCases, openingDistance, parseGeneratedBalanceArgs, type GeneratedCase } from './generatedBalance';
import { timingSummary } from './performanceMetrics';

export interface PairedConfig extends GeneratedCase {
  redPolicy: ArmyPolicy;
  bluePolicy: ArmyPolicy;
}
export function pairedCases(args: readonly string[]) {
  const forwarded: string[] = [];
  let policies = ['balanced:balanced'];
  let found = false;
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--policies') {
      if (found || !args[i + 1]) throw Error('Invalid policies');
      policies = args[i + 1]!.split(',');
      found = true;
    } else forwarded.push(...args.slice(i, i + 2));
  }
  if (new Set(policies).size !== policies.length) throw Error('Duplicate policies');
  const pairs = policies.map((pair) => pair.split(':'));
  if (pairs.some((pair) => pair.length !== 2 || !pair.every(isArmyPolicy))) throw Error('Invalid policy pair');
  const options = parseGeneratedBalanceArgs(forwarded);
  const cases: PairedConfig[] = generatedCases(options).flatMap((config) =>
    pairs.map(([red, blue]) => ({ ...config, redPolicy: red as ArmyPolicy, bluePolicy: blue as ArmyPolicy })),
  );
  if (cases.length * 2 > options.maxGames) throw Error('Paired matrix exceeds --max-games (both legs count)');
  return { options, cases };
}
/** Rotate the public layout and exchange CPU settings; A plays second in the return leg. */
export function returnLeg(config: PairedConfig): PairedConfig {
  return {
    ...config,
    orientation: config.orientation === 'normal' ? 'rotated' : 'normal',
    red: config.blue,
    blue: config.red,
    redPolicy: config.bluePolicy,
    bluePolicy: config.redPolicy,
  };
}
export function playLeg(config: PairedConfig, rounds: number, deadline = Infinity, now = () => performance.now(), rule: RuleVersion = CURRENT_RULE_VERSION) {
  const scenario = comparisonScenario(config);
  let state = createScenarioInitialState(scenario);
  state = { ...state, ruleVersion: rule, rngSeed: config.damageSeed === 'scenario' ? state.rngSeed : config.damageSeed };
  const resolvedDamageSeed = state.rngSeed,
    start = now(),
    timings: number[] = [];
  const digest = createHash('sha256');
  let commands = 0,
    turnCommands = 0,
    maxUnits = state.units.length;
  while (!state.winner && state.turn <= rounds) {
    if (now() >= deadline) throw Error('Paired comparison exceeded time budget');
    const side = state.activePlayer,
      before = now();
    const command = chooseCpuAction(state, side === 'red' ? config.red : config.blue, side, side === 'red' ? config.redPolicy : config.bluePolicy);
    timings.push(now() - before);
    const result = applyGameCommand(state, command);
    if (!result.ok) throw Error(`Illegal CPU command: ${JSON.stringify(command)}: ${result.error}`);
    if (command.type === 'endTurn') turnCommands = 0;
    else if (++turnCommands > 120) throw Error('CPU did not end its turn');
    digest.update(JSON.stringify(command)).update('\n');
    state = result.value;
    commands++;
    maxUnits = Math.max(maxUnits, state.units.length);
  }
  return {
    config,
    resolvedDamageSeed,
    winner: state.winner ?? 'none',
    reason: state.winner ? (victoryReason(state, scenario) ?? 'unknown') : 'round-limit',
    turns: state.turn,
    commands,
    maxUnits,
    commandDigest: digest.digest('hex'),
    cpuTiming: timingSummary(timings),
    elapsedMs: now() - start,
    openingDistance: { red: openingDistance(scenario, 'red'), blue: openingDistance(scenario, 'blue') },
  };
}
export type LegResult = ReturnType<typeof playLeg>;
export interface PairResult {
  config: PairedConfig;
  legs: [LegResult, LegResult];
}
export function summarizePairs(pairs: readonly PairResult[]) {
  const groups = new Map<string, PairResult[]>();
  for (const pair of pairs) {
    const c = pair.config,
      key = `${c.size}/${c.sea}/${c.variant}/${c.bonus}/${c.red}:${c.blue}/${c.redPolicy}:${c.bluePolicy}`;
    groups.set(key, [...(groups.get(key) ?? []), pair]);
  }
  return [...groups].map(([condition, rows]) => {
    const legs = rows.flatMap((pair) => pair.legs);
    const wins = (side: PlayerId) => legs.filter((leg) => leg.winner === side).length;
    return {
      condition,
      pairs: rows.length,
      games: legs.length,
      firstWins: wins('red'),
      secondWins: wins('blue'),
      undecided: legs.filter((leg) => leg.winner === 'none').length,
      bothFirst: rows.filter((p) => p.legs.every((l) => l.winner === 'red')).length,
      bothSecond: rows.filter((p) => p.legs.every((l) => l.winner === 'blue')).length,
      split: rows.filter((p) => p.legs.every((l) => l.winner !== 'none') && p.legs[0].winner !== p.legs[1].winner).length,
      incompletePairs: rows.filter((p) => p.legs.some((l) => l.winner === 'none')).length,
    };
  });
}
export function runPairedBalance(args: readonly string[]) {
  const { options, cases } = pairedCases(args),
    start = performance.now(),
    pairs: PairResult[] = [];
  const header = {
    kind: 'paired-balance',
    schemaVersion: 1,
    sha: process.env.GITHUB_SHA ?? 'unrecorded',
    sourceState: 'working-tree',
    simulationDigest: comparisonSourceDigest(),
    harnessDigest: createHash('sha256')
      .update(readFileSync(new URL(import.meta.url)))
      .digest('hex'),
    runtime: process.version,
    options,
    requestedGames: cases.length * 2,
    note: 'Red always acts first. Return leg rotates layout and exchanges difficulty/policy. Undecided matches are not wins or draws; paired observations are correlated. No population fairness guarantee.',
  };
  if (options.output) writeFileSync(options.output, JSON.stringify(header) + '\n');
  const emit = (value: unknown) => {
    if (options.output) appendFileSync(options.output, JSON.stringify(value) + '\n');
  };
  try {
    for (const [index, config] of cases.entries()) {
      const legs: LegResult[] = [];
      for (const [leg, c] of [config, returnLeg(config)].entries()) {
        const result = playLeg(c, options.rounds, start + options.seconds * 1000, undefined, options.rule);
        legs.push(result);
        emit({ pair: index, leg, result });
        process.stderr.write(
          `${index + 1}/${cases.length} leg${leg + 1}: ${c.size}/${c.sea}/${c.seed} ${c.red}:${c.blue} ${c.redPolicy}:${c.bluePolicy} ${result.winner} T${result.turns}\n`,
        );
      }
      pairs.push({ config, legs: legs as PairResult['legs'] });
    }
    const summary = { complete: true, summaries: summarizePairs(pairs) };
    emit(summary);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    emit({ complete: false, error: String(error), completePairs: pairs.length, summaries: summarizePairs(pairs) });
    throw error;
  }
}
