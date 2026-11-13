import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cpus, platform, arch } from 'node:os';
import { fourArmyAssessmentCases, summarizeFourArmyAssessment, type AssessmentCase } from './fourArmyAssessment';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyCommand } from '../src/game/fourArmyEngine';
import { createFourArmyMap32 } from '../src/game/fourArmyMap32';
import { chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';
import { FOUR_ARMY_IDS } from '../src/game/fourArmyFoundation';
import type { GameResult } from '../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const round = (x: number) => Math.round(x * 1000) / 1000;
const stats = (v: number[]) => {
  const a = [...v].sort((a, b) => a - b);
  return { count: a.length, p50: round(a[Math.ceil(a.length * 0.5) - 1] ?? 0), p95: round(a[Math.ceil(a.length * 0.95) - 1] ?? 0), max: round(a.at(-1) ?? 0) };
};
const source = process.env.MINISTR_SOURCE_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
// Keep the published v1 assessment reproducible; the v2 comparison has its own explicit-version protocol.
const cpuVersion = 'four-army-cpu-v1' as const;
const shard = Number(process.argv[2] ?? 0),
  shards = Number(process.argv[3] ?? 1),
  output = process.argv[4];
if (!Number.isInteger(shard) || !Number.isInteger(shards) || shards < 1 || shards > 24 || shard < 0 || shard >= shards) throw Error('Usage: shard[0..N-1] N[1..24] output');
const run = (spec: AssessmentCase) => {
  const map = value(createFourArmyMap32(spec.seed, spec.order));
  let state = value(createFourArmyState(map)),
    count = 0,
    fallbacks = 0,
    resumes = 0,
    maxUnits = state.units.length,
    peakHeap = 0;
  const cpu: number[] = [],
    engine: number[] = [],
    hash = createHash('sha256'),
    began = performance.now();
  while (state.outcome.type === 'ongoing' && state.round.round <= spec.maxRound && count < spec.maxCommands) {
    const actor = state.round.order[state.round.index]!,
      start = performance.now();
    let command: FourArmyCommand | undefined;
    if (state.paused) {
      command = { actor, type: 'resume' };
      resumes++;
    } else command = chooseFourArmyCpuCommand(value(observeFourArmy(state, actor)), spec.settings[actor], cpuVersion);
    if (!command) throw Error('Missing current CPU command');
    const planned = performance.now();
    let next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      const unitId = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = unitId ? { actor, type: 'wait', unitId } : { actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
      fallbacks++;
    }
    state = value(next);
    cpu.push(planned - start);
    engine.push(performance.now() - planned);
    hash.update(JSON.stringify(command) + '\n');
    count++;
    maxUnits = Math.max(maxUnits, state.units.length);
    if (FOUR_ARMY_IDS.some((a) => state.units.filter((u) => u.owner === a).length > 16)) throw Error('Per-army capacity exceeded');
    if (count % 128 === 0) peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    if (count % 5000 === 0)
      console.log(JSON.stringify({ phase: 'four-army-progress', id: spec.id, count, round: state.round.round, seconds: round((performance.now() - began) / 1000) }));
  }
  return {
    ...spec,
    count,
    round: state.round.round,
    outcome: state.outcome,
    alive: state.alive,
    eliminations: state.eliminations,
    fallbacks,
    resumes,
    maxUnits,
    traceSha256: hash.digest('hex'),
    finalStateSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    cpuMs: stats(cpu),
    engineMs: stats(engine),
    peakHeapBytes: peakHeap,
    elapsedSeconds: round((performance.now() - began) / 1000),
    stoppedBy: state.outcome.type !== 'ongoing' ? 'outcome' : count >= spec.maxCommands ? 'command-budget' : 'round-budget',
  };
};
const rows = [];
for (const [i, spec] of fourArmyAssessmentCases().entries())
  if (i % shards === shard) {
    const row = run(spec);
    rows.push(row);
    console.log(JSON.stringify({ phase: 'four-army-case', source, row }));
  }
const report = {
  schemaVersion: 1,
  protocol: 'four-army-assessment-v1',
  cpuVersion,
  source,
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, cpu: cpus()[0]?.model, platform: platform(), arch: arch() },
  shard,
  shards,
  rows,
  summary: summarizeFourArmyAssessment(rows),
};
if (output) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ phase: 'four-army-assessment-summary', source, shard, summary: report.summary }));
