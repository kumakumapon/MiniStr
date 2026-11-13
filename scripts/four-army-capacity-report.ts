/** Reproducible bounded capacity probe; not a win-rate or long-session memory benchmark. */
import { execFileSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fourArmyCapacityFixture } from '../tests/e2e/helpers/fourArmyMapProbe';
import { FOUR_ARMY_IDS } from '../src/game/fourArmyFoundation';
import { applyFourArmyCommand, observeFourArmy } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';

const rounded = (n: number) => Math.round(n * 1000) / 1000;
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: rounded(sorted[Math.ceil(sorted.length * 0.5) - 1]!),
    p95: rounded(sorted[Math.ceil(sorted.length * 0.95) - 1]!),
    max: rounded(sorted.at(-1)!),
  };
};
const rows: { cap: number; totalUnits: number; crowded: boolean; actor: string; difficulty: string; sample: number; cpuMs: number; engineMs: number; command: string }[] = [];
for (const cap of [8, 12, 16])
  for (const crowded of [false, true])
    for (const actor of FOUR_ARMY_IDS)
      for (const difficulty of ['normal', 'hard'] as const) {
        const { state } = fourArmyCapacityFixture(cap, crowded, actor),
          observed = observeFourArmy(state, actor);
        if (!observed.ok) throw Error(observed.error);
        const options = { difficulty, policy: 'balanced' } as const;
        const expected = JSON.stringify(chooseFourArmyCpuCommand(observed.value, options));
        for (let sample = 0; sample < 5; sample++) {
          const began = performance.now(),
            command = chooseFourArmyCpuCommand(observed.value, options),
            planned = performance.now();
          if (JSON.stringify(command) !== expected) throw Error('Non-deterministic capacity probe');
          const next = applyFourArmyCommand(state, command),
            ended = performance.now();
          if (!next.ok) throw Error(next.error);
          if (next.value.units.some((u) => next.value.units.filter((v) => v.owner === u.owner).length > cap)) throw Error('Capacity overflow');
          rows.push({
            cap,
            totalUnits: state.units.length,
            crowded,
            actor,
            difficulty,
            sample,
            cpuMs: rounded(planned - began),
            engineMs: rounded(ended - planned),
            command: command!.type,
          });
        }
      }
const report = {
  schemaVersion: 1,
  scope: '32x32 synthetic home/front capacity; 4 actors x normal/hard x 5 samples; balanced policy; not fairness or mobile/long-session proof',
  measuredAt: new Date().toISOString(),
  source: process.env.MINISTR_SOURCE_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown' },
  candidates: [8, 12, 16].map((cap) => ({
    cap,
    totalUnits: cap * 4,
    cpuMs: summary(rows.filter((r) => r.cap === cap).map((r) => r.cpuMs)),
    engineMs: summary(rows.filter((r) => r.cap === cap).map((r) => r.engineMs)),
  })),
  rows,
};
const text = JSON.stringify(report, null, 2) + '\n',
  output = process.argv[2];
if (output) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, text);
}
console.log(JSON.stringify({ phase: 'four-army-capacity-node', source: report.source, environment: report.environment, candidates: report.candidates, output: output ?? null }));
if (!output) console.log(text);
