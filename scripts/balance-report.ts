/**
 * CPU-versus-CPU balance report (#116 Phase 10.1).
 *
 * Usage:
 *   npm run balance -- [--maps skirmish,islands] [--difficulty easy,normal,hard]
 *                      [--rules classic,modern] [--seeds 3] [--rounds 60]
 *
 * Prints a Markdown table to stdout and progress to stderr. It is intentionally
 * not part of CI: a full run plays hundreds of matches.
 */
import { formatBalanceReport, parseBalanceArgs, runBalance, summarizeMatches } from '../src/ai/balance';

const options = parseBalanceArgs(process.argv.slice(2).filter(arg => arg !== '--'));
if (!options.ok) {
  console.error(options.error);
  process.exit(2);
}

const total = options.value.scenarioIds.length * options.value.difficulties.length * options.value.rules.length * options.value.seeds.length;
let finished = 0;
const started = performance.now();
const { results, skipped } = runBalance(options.value, result => {
  finished += 1;
  process.stderr.write(`[${finished}/${total}] ${result.scenarioId} ${result.rules} ${result.difficulty} seed=${result.seed} winner=${result.winner} turns=${result.turns}\n`);
});

console.log(`計測条件: 最大 ${options.value.maxRounds} ラウンド、シード ${options.value.seeds.length} 種（${options.value.seeds.join(', ')}）、所要 ${((performance.now() - started) / 1000).toFixed(0)} 秒\n`);
console.log(formatBalanceReport(summarizeMatches(results), skipped));
