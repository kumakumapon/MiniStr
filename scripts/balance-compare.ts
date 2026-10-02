/** Reproducible paired comparison. Run on each ref, then pass --baseline old.json. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { maps } from '../src/game';
import { simulateMatch, summarizeMatches, type MatchResult } from '../src/ai/balance';

const argumentsList = process.argv.slice(2);
const option = (key: string) => {
  const at = argumentsList.indexOf(key);
  return at < 0 ? undefined : argumentsList[at + 1];
};
const output = option('--output');
const baseline = option('--baseline');
const selected = (option('--maps') ?? 'skirmish,canyon,islands').split(',');
const seeds = [7919, 15838, 23757];
const results: MatchResult[] = [];
for (const id of selected) {
  const map = maps.find((map) => map.id === id);
  if (!map) throw Error(`Unknown map: ${id}`);
  for (const seed of seeds)
    for (const [red, blue] of [
      ['hard', 'normal'],
      ['normal', 'hard'],
    ] as const) {
      process.stderr.write(`${id} seed=${seed} red=${red} blue=${blue}\n`);
      const result = simulateMatch(map, red, 'modern', seed, 60, blue);
      if (!result.ok) throw Error(result.error);
      results.push(result.value);
    }
}
const report = {
  schemaVersion: 1,
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  seeds,
  maxRounds: 60,
  // Each map stays separate: campaign asymmetry must not masquerade as first-move bias.
  results,
  summaries: summarizeMatches(results),
};
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
if (baseline) {
  const previous = JSON.parse(readFileSync(baseline, 'utf8')) as typeof report;
  if (previous.schemaVersion !== 1 || !Array.isArray(previous.results) || JSON.stringify(previous.seeds) !== JSON.stringify(seeds) || previous.maxRounds !== report.maxRounds)
    throw Error('Baseline settings do not match');
  console.log(`Baseline ${previous.sha}${previous.dirty ? ' (dirty)' : ''} → ${report.sha}${report.dirty ? ' (dirty)' : ''}`);
  for (const id of selected) {
    const summarize = (rows: MatchResult[]) => {
      const chosen = rows.filter((row) => row.scenarioId === id);
      return {
        games: chosen.length,
        decided: chosen.filter((row) => row.winner !== 'none').length,
        hardWins: chosen.filter((row) => row.winner !== 'none' && (row.winner === 'red' ? row.difficulty : row.blueDifficulty) === 'hard').length,
        decision: chosen.filter((row) => row.reason.startsWith('decision')).length,
      };
    };
    const before = summarize(previous.results),
      after = summarize(results);
    if (before.games !== after.games) throw Error(`Baseline pair count mismatch: ${id}`);
    console.log(JSON.stringify({ map: id, before, after, decidedDelta: after.decided - before.decided }));
  }
} else console.log(JSON.stringify(report, null, 2));
