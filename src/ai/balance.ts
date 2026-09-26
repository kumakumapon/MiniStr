import { applyGameCommand, createScenarioInitialState, isUnitKindAvailable, maps, MODERN_RULE_VERSION, scenarioById, summarizeRepairs, victoryReason } from '../game';
import type { GameResult, GameState, PlayerId, ScenarioDefinition, UnitKind, VictoryReason } from '../game';
import { chooseCpuAction, type CpuDifficulty } from './rules';

/**
 * CPU-versus-CPU balance measurement (#116 Phase 10.1). Everything here is
 * deterministic for a given scenario, difficulty, rule set, and seed, and
 * leaves game rules untouched; it only observes matches.
 */
/** classic: no rule version; v2: Phase 9 modern rules; modern: the current rule version for new matches. */
export type BalanceRules = 'classic' | 'v2' | 'modern';

export interface MatchResult {
  scenarioId: string;
  /** Red's difficulty. */
  difficulty: CpuDifficulty;
  /** Blue's difficulty; equal to `difficulty` for mirror matches. */
  blueDifficulty: CpuDifficulty;
  rules: BalanceRules;
  seed: number;
  winner: PlayerId | 'none';
  /** Why the match ended; 'none' when undecided, 'unknown' if the ending cannot be explained. */
  reason: VictoryReason | 'none' | 'unknown';
  /** Round in which the match was decided, or maxRounds + 1 when it stayed undecided. */
  turns: number;
  /** Peak unit count across both sides, including embarked cargo. */
  maxUnits: number;
  commands: number;
  produced: Record<PlayerId, Partial<Record<UnitKind, number>>>;
  repairCost: Record<PlayerId, number>;
}

export interface SkippedMatch { scenarioId: string; rules: BalanceRules; reason: string }

/** Same bound as the CPU regression fixture: exceeding it means the CPU stopped ending its turns. */
const MAX_COMMANDS_PER_TURN = 120;

/**
 * The measured match starts from the scenario's turn-one state with a replaced
 * damage seed. It is not a valid save or replay and must not be persisted.
 */
export function balanceInitialState(scenario: ScenarioDefinition, rules: BalanceRules, seed: number): GameResult<GameState> {
  const initial = createScenarioInitialState(scenario);
  if (rules === 'classic') {
    const unavailable = initial.units.find(unit => !isUnitKindAvailable(unit.kind, undefined));
    if (unavailable) return { ok: false, error: `初期配置に近代ルール専用ユニット（${unavailable.kind}）があるため、従来ルールでは計測できません。` };
  }
  const ruleVersion = rules === 'classic' ? undefined : rules === 'v2' ? MODERN_RULE_VERSION : initial.ruleVersion;
  return { ok: true, value: { ...initial, rngSeed: seed >>> 0, ruleVersion } };
}

/** Plays one CPU-versus-CPU match. Throws if the CPU issues an illegal command, since that is a bug, not a result. */
export function simulateMatch(
  scenario: ScenarioDefinition, difficulty: CpuDifficulty, rules: BalanceRules, seed: number, maxRounds: number,
  blueDifficulty: CpuDifficulty = difficulty,
): GameResult<MatchResult> {
  // Victory and objectives are resolved through state.scenarioId, so an
  // unregistered scenario would silently never finish.
  if (scenarioById(scenario.id) !== scenario) throw new Error(`Scenario ${scenario.id} is not registered in the catalog`);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error(`Invalid seed: ${seed}`);
  if (!Number.isSafeInteger(maxRounds) || maxRounds < 1) throw new Error(`Invalid round limit: ${maxRounds}`);
  const initial = balanceInitialState(scenario, rules, seed);
  if (!initial.ok) return initial;
  let state = initial.value;
  const result: MatchResult = {
    scenarioId: scenario.id, difficulty, blueDifficulty, rules, seed, winner: 'none', reason: 'none', turns: state.turn, maxUnits: state.units.length, commands: 0,
    produced: { red: {}, blue: {} }, repairCost: { red: 0, blue: 0 },
  };
  let commandsThisTurn = 0;
  while (!state.winner && state.turn <= maxRounds) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? difficulty : blueDifficulty);
    const applied = applyGameCommand(state, command);
    if (!applied.ok) throw new Error(`${scenario.id}/${difficulty}/${rules}/seed ${seed}: CPU issued an illegal command ${JSON.stringify(command)}: ${applied.error}`);
    if (command.type === 'produce') {
      const produced = result.produced[state.activePlayer];
      produced[command.kind] = (produced[command.kind] ?? 0) + 1;
    }
    if (command.type === 'endTurn') {
      const repairs = summarizeRepairs(state, applied.value, applied.value.activePlayer);
      result.repairCost[applied.value.activePlayer] += repairs.cost;
      commandsThisTurn = 0;
    } else if (++commandsThisTurn > MAX_COMMANDS_PER_TURN) {
      throw new Error(`${scenario.id}/${difficulty}/${rules}/seed ${seed}: CPU did not end its turn`);
    }
    state = applied.value;
    result.commands += 1;
    result.maxUnits = Math.max(result.maxUnits, state.units.length);
  }
  const reason = state.winner ? victoryReason(state, scenario) ?? 'unknown' : 'none';
  return { ok: true, value: { ...result, winner: state.winner ?? 'none', reason, turns: state.turn } };
}

export interface BalanceSummary {
  scenarioId: string;
  difficulty: CpuDifficulty;
  blueDifficulty: CpuDifficulty;
  rules: BalanceRules;
  games: number;
  wins: Record<PlayerId | 'none', number>;
  /** Mean completed rounds of decided games; undefined when none were decided. */
  averageDecidedTurns?: number;
  maxUnits: number;
  produced: Partial<Record<UnitKind, number>>;
  averageRepairCost: number;
  /** Decided games by ending reason. */
  reasons: Partial<Record<VictoryReason | 'unknown', number>>;
}

export function summarizeMatches(results: readonly MatchResult[]): BalanceSummary[] {
  const groups = new Map<string, MatchResult[]>();
  for (const result of results) {
    const key = `${result.scenarioId}\u0000${result.difficulty}\u0000${result.blueDifficulty}\u0000${result.rules}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.values()].map(group => {
    const first = group[0]!;
    const wins = { red: 0, blue: 0, none: 0 };
    const produced: Partial<Record<UnitKind, number>> = {};
    let decidedTurns = 0;
    const reasons: BalanceSummary['reasons'] = {};
    let repairCost = 0;
    for (const result of group) {
      wins[result.winner] += 1;
      if (result.winner !== 'none') decidedTurns += result.turns;
      if (result.reason !== 'none') reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      repairCost += result.repairCost.red + result.repairCost.blue;
      for (const side of [result.produced.red, result.produced.blue])
        for (const [kind, count] of Object.entries(side) as [UnitKind, number][]) produced[kind] = (produced[kind] ?? 0) + count;
    }
    const decided = group.length - wins.none;
    return {
      scenarioId: first.scenarioId, difficulty: first.difficulty, blueDifficulty: first.blueDifficulty, rules: first.rules, games: group.length, wins,
      averageDecidedTurns: decided > 0 ? decidedTurns / decided : undefined,
      maxUnits: Math.max(...group.map(result => result.maxUnits)),
      produced, averageRepairCost: repairCost / group.length, reasons,
    };
  });
}

const percent = (count: number, total: number): string => `${Math.round(count / total * 100)}%`;

const formatReasons = (reasons: BalanceSummary['reasons']): string =>
  (Object.entries(reasons) as [string, number][]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, count]) => `${reason} ${count}`).join(', ') || '—';

/** Markdown report: one row per scenario, difficulty, and rule set. */
export function formatBalanceReport(summaries: readonly BalanceSummary[], skipped: readonly SkippedMatch[] = []): string {
  const lines = [
    '| マップ | 難易度 | ルール | 局数 | 赤勝 | 青勝 | 未決着 | 平均決着ターン | 決着理由 | 最大部隊数 | 平均修理費（近代） | 生産上位 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |',
  ];
  for (const summary of summaries) {
    const topProduction = (Object.entries(summary.produced) as [UnitKind, number][])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4)
      .map(([kind, count]) => `${kind} ${count}`).join(', ') || '—';
    const matchup = summary.difficulty === summary.blueDifficulty ? summary.difficulty : `赤 ${summary.difficulty} 対 青 ${summary.blueDifficulty}`;
    lines.push(`| ${summary.scenarioId} | ${matchup} | ${summary.rules} | ${summary.games} | ${percent(summary.wins.red, summary.games)} | ${percent(summary.wins.blue, summary.games)} | ${percent(summary.wins.none, summary.games)} | ${summary.averageDecidedTurns === undefined ? '—' : summary.averageDecidedTurns.toFixed(1)} | ${formatReasons(summary.reasons)} | ${summary.maxUnits} | ${Math.round(summary.averageRepairCost)} | ${topProduction} |`);
  }
  lines.push('', '最大部隊数は両陣営の合計（輸送中の部隊を含む）。修理費は近代ルールのみ（従来ルールの修理は無料のため 0）。');
  if (skipped.length) {
    lines.push('', '計測対象外:');
    for (const entry of skipped) lines.push(`- ${entry.scenarioId}（${entry.rules}）: ${entry.reason}`);
  }
  return lines.join('\n');
}

export interface BalanceOptions {
  scenarioIds: string[];
  difficulties: CpuDifficulty[];
  rules: BalanceRules[];
  seeds: number[];
  maxRounds: number;
  /** When set, blue plays this difficulty against each red difficulty. */
  blueDifficulty?: CpuDifficulty;
}

const difficulties: readonly CpuDifficulty[] = ['easy', 'normal', 'hard'];
const ruleSets: readonly BalanceRules[] = ['classic', 'v2', 'modern'];
/** Rule sets measured when --rules is omitted. */
const defaultRuleSets: readonly BalanceRules[] = ['classic', 'modern'];

/**
 * Parses `--maps a,b --difficulty easy [--blue hard] --rules modern --seeds 3 --rounds 60`.
 * Omitted options cover every built-in map, difficulty, and rule set.
 */
export function parseBalanceArgs(args: readonly string[]): GameResult<BalanceOptions> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!;
    const value = args[index + 1];
    if (!['--maps', '--difficulty', '--blue', '--rules', '--seeds', '--rounds'].includes(flag) || value === undefined || value.startsWith('--'))
      return { ok: false, error: `不明な引数、または値がありません: ${flag}` };
    values.set(flag, value);
  }
  const list = (flag: string) => values.get(flag)?.split(',').map(item => item.trim());
  for (const flag of ['--maps', '--difficulty', '--rules']) {
    const items = list(flag);
    if (items && (items.some(item => item === '') || new Set(items).size !== items.length))
      return { ok: false, error: `${flag} に空の値や重複があります。` };
  }
  const scenarioIds = list('--maps') ?? maps.map(scenario => scenario.id);
  const unknownMap = scenarioIds.find(id => !scenarioById(id));
  if (unknownMap) return { ok: false, error: `不明なマップです: ${unknownMap}` };
  const chosenDifficulties = list('--difficulty') ?? [...difficulties];
  if (chosenDifficulties.some(value => !difficulties.includes(value as CpuDifficulty))) return { ok: false, error: '難易度は easy / normal / hard から指定してください。' };
  const blueDifficulty = values.get('--blue');
  if (blueDifficulty !== undefined && !difficulties.includes(blueDifficulty as CpuDifficulty)) return { ok: false, error: '--blue は easy / normal / hard から指定してください。' };
  const chosenRules = list('--rules') ?? [...defaultRuleSets];
  if (chosenRules.some(value => !ruleSets.includes(value as BalanceRules))) return { ok: false, error: 'ルールは classic / v2 / modern から指定してください。' };
  const seedCount = Number(values.get('--seeds') ?? 3);
  const maxRounds = Number(values.get('--rounds') ?? 60);
  if (!Number.isSafeInteger(seedCount) || seedCount < 1 || seedCount > 100) return { ok: false, error: '--seeds は 1〜100 の整数で指定してください。' };
  if (!Number.isSafeInteger(maxRounds) || maxRounds < 1 || maxRounds > 500) return { ok: false, error: '--rounds は 1〜500 の整数で指定してください。' };
  return {
    ok: true,
    value: {
      scenarioIds, difficulties: chosenDifficulties as CpuDifficulty[], rules: chosenRules as BalanceRules[],
      // Fixed, spread-out seeds keep reports reproducible across runs and machines.
      seeds: Array.from({ length: seedCount }, (_, index) => (index + 1) * 7919),
      maxRounds,
      ...(blueDifficulty ? { blueDifficulty: blueDifficulty as CpuDifficulty } : {}),
    },
  };
}

/** Runs every requested combination, reporting progress through the optional callback. */
export function runBalance(options: BalanceOptions, onMatch?: (result: MatchResult) => void): { results: MatchResult[]; skipped: SkippedMatch[] } {
  const results: MatchResult[] = [];
  const skipped: SkippedMatch[] = [];
  for (const scenarioId of options.scenarioIds) {
    const scenario = scenarioById(scenarioId)!;
    for (const rules of options.rules) for (const difficulty of options.difficulties) {
      for (const seed of options.seeds) {
        const match = simulateMatch(scenario, difficulty, rules, seed, options.maxRounds, options.blueDifficulty ?? difficulty);
        if (!match.ok) {
          if (!skipped.some(entry => entry.scenarioId === scenarioId && entry.rules === rules)) skipped.push({ scenarioId, rules, reason: match.error });
          break;
        }
        results.push(match.value);
        onMatch?.(match.value);
      }
    }
  }
  return { results, skipped };
}
