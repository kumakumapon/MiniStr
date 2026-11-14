import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cpus, platform, arch } from 'node:os';
import { fourArmyPathComparisonCases, type PathComparisonCase } from './fourArmyPathComparison';
import { createFourArmyMap32, rotateFourArmy32 } from '../src/game/fourArmyMap32';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyCommand } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';
import { FOUR_ARMY_IDS } from '../src/game/fourArmyFoundation';
import { unitStats } from '../src/game/units';
import type { GameResult } from '../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const source = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const shard = Number(process.argv[2] ?? 0),
  shards = Number(process.argv[3] ?? 12),
  output = process.argv[4];
if (!Number.isInteger(shard) || !Number.isInteger(shards) || shards < 1 || shards > 24 || shard < 0 || shard >= shards) throw Error('Invalid shard');
const digest = () => createHash('sha256');
const stats = (v: number[]) => {
  v.sort((a, b) => a - b);
  return { count: v.length, p50: v[Math.ceil(v.length * 0.5) - 1] ?? 0, p95: v[Math.ceil(v.length * 0.95) - 1] ?? 0, max: v.at(-1) ?? 0 };
};
function run(c: PathComparisonCase) {
  const { spec, cpuVersion } = c,
    rotation = FOUR_ARMY_IDS.indexOf(spec.order[0]!);
  let state = value(createFourArmyState(value(createFourArmyMap32(spec.seed, spec.order, c.pathVersion)))),
    count = 0,
    fallbacks = 0,
    earlyProductionRejections = 0,
    unseenProductionBeforeActions = 0,
    resumes = 0,
    maxUnits = state.units.length;
  const trace = digest(),
    normalized = digest(),
    times: number[] = [],
    failures: Record<string, number> = {},
    began = performance.now();
  while (state.outcome.type === 'ongoing' && state.round.round <= spec.maxRound && count < spec.maxCommands) {
    const actor = state.round.order[state.round.index]!,
      o = value(observeFourArmy(state, actor)),
      start = performance.now();
    let command: FourArmyCommand;
    if (state.paused) {
      command = { actor, type: 'resume' };
      resumes++;
    } else {
      const chosen = chooseFourArmyCpuCommand(o, spec.settings[actor], cpuVersion);
      if (!chosen) throw Error('No active command');
      command = chosen;
    }
    times.push(performance.now() - start);
    const ready = o.units.filter((u) => u.owner === actor && u.position && !u.hasActed).length;
    if (command.type === 'produce' && ready && !o.visible.some((p) => command.type === 'produce' && p.x === command.factory.x && p.y === command.factory.y))
      unseenProductionBeforeActions++;
    let next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      failures[next.error] = (failures[next.error] ?? 0) + 1;
      if (command.type === 'produce' && ready) earlyProductionRejections++;
      const id = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = id ? { actor, type: 'wait', unitId: id } : { actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
      fallbacks++;
    }
    state = value(next);
    count++;
    trace.update(JSON.stringify(command) + '\n');
    const nc = { ...command } as Record<string, unknown>;
    nc.actor = FOUR_ARMY_IDS[(FOUR_ARMY_IDS.indexOf(command.actor) - rotation + 4) % 4];
    if ('factory' in command) nc.factory = rotateFourArmy32(command.factory, (4 - rotation) % 4);
    if ('destination' in command) nc.destination = rotateFourArmy32(command.destination, (4 - rotation) % 4);
    for (const key of ['unitId', 'targetId', 'transportId'])
      if (key in nc) {
        const n = Number(String(nc[key]).slice(1));
        if (n <= 32) nc[key] = `u${((n - 1 - rotation * 8 + 32) % 32) + 1}`;
      }
    normalized.update(JSON.stringify(nc) + '\n');
    maxUnits = Math.max(maxUnits, state.units.length);
    if (FOUR_ARMY_IDS.some((a) => state.units.filter((u) => u.owner === a).length > 16)) throw Error('Unit cap exceeded');
    if (count % 10000 === 0) console.log(JSON.stringify({ phase: 'cpu-comparison-progress', id: spec.id, cpuVersion, count, round: state.round.round }));
  }
  return {
    ...c,
    count,
    round: state.round.round,
    outcome: state.outcome,
    alive: state.alive,
    eliminations: state.eliminations,
    fallbacks,
    earlyProductionRejections,
    unseenProductionBeforeActions,
    failures,
    resumes,
    maxUnits,
    fuelZeroUnits: state.units.filter((u) => u.position && u.fuel === 0).length,
    deployedUnits: state.units.filter((u) => u.position).length,
    fuelZeroCapturers: state.units.filter((u) => u.position && u.fuel === 0 && unitStats[u.kind].capturePower > 0).length,
    traceSha256: trace.digest('hex'),
    normalizedTraceSha256: normalized.digest('hex'),
    finalStateSha256: digest().update(JSON.stringify(state)).digest('hex'),
    cpuMs: stats(times),
    elapsedSeconds: (performance.now() - began) / 1000,
    normalizedOrder: spec.order.map((a) => FOUR_ARMY_IDS[(FOUR_ARMY_IDS.indexOf(a) - rotation + 4) % 4]),
  };
}
const rows = [];
for (const [i, c] of fourArmyPathComparisonCases().entries())
  if (i % shards === shard && (!process.argv[5] || c.spec.id === process.argv[5])) {
    const row = run(c);
    rows.push(row);
    if (c.cohort === 'compatibility') {
      const old = JSON.parse(readFileSync('docs/reviews/v1.5.15/comparison.json', 'utf8')) as {
        rows: { cohort: string; cpuVersion: string; spec: { id: string }; traceSha256: string; finalStateSha256: string }[];
      };
      const baseline = old.rows.find((r) => r.spec.id === c.spec.id && r.cpuVersion === c.cpuVersion)!;
      if (row.traceSha256 !== baseline.traceSha256 || row.finalStateSha256 !== baseline.finalStateSha256) throw Error('Legacy CPU replay drift');
    }
    console.log(JSON.stringify({ phase: 'four-army-cpu-case', source, row }));
  }
const report = {
  schemaVersion: 1,
  protocol: 'four-army-path-comparison-v1',
  source,
  shard,
  shards,
  environment: { node: process.version, cpu: cpus()[0]?.model, platform: platform(), arch: arch() },
  rows,
};
if (output) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ phase: 'cpu-comparison-complete', source, shard, cases: rows.length }));
