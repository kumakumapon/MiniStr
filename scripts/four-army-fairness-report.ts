import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cpus, platform } from 'node:os';
import { fourArmyFairnessCases, remainingFourArmyFairnessCases, summarizeFourArmyFairness, type FairnessCase } from './fourArmyFairness';
import { createFourArmyMap32 } from '../src/game/fourArmyMap32';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyCommand, type FourArmyState } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';
import { FOUR_ARMY_IDS } from '../src/game/fourArmyFoundation';
import { fourArmyControllers } from '../src/game/fourArmyControl';
import { serializeFourArmySpectatorSave, parseFourArmySpectatorSave } from '../src/game/fourArmySpectatorSave';
import type { GameResult } from '../src/game/types';

const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const shard = Number(process.argv[2] ?? 0),
  shards = Number(process.argv[3] ?? 4),
  output = process.argv[4];
if (!Number.isInteger(shard) || !Number.isInteger(shards) || shards < 1 || shards > 8 || shard < 0 || shard >= shards) throw Error('Invalid fairness shard');
const previous = JSON.parse(readFileSync('docs/reviews/v1.5.16/comparison.json', 'utf8')) as { rows: Parameters<typeof fourArmyFairnessCases>[0] };
const sourceFiles = ['src/ai/fourArmyCpu.ts', 'src/ai/fourArmyObservation.ts', 'src/game/fourArmyEngine.ts', 'src/game/fourArmyMap32.ts', 'src/game/fourArmyRules.ts'];
const frozenSources = Object.fromEntries(sourceFiles.map((path) => [path, hash(readFileSync(path, 'utf8'))]));
const resumePath = process.argv[5];
const resumed = resumePath
  ? (JSON.parse(readFileSync(resumePath, 'utf8')) as { protocol: string; gameSource: string; frozenSources: Record<string, string>; rows: FairnessCase[] })
  : undefined;
if (
  resumed &&
  (resumed.protocol !== 'four-army-fairness-v1' ||
    resumed.gameSource !== '2cc327434042f8f5a35bb44d939fbf399613ef31' ||
    JSON.stringify(resumed.frozenSources) !== JSON.stringify(frozenSources))
)
  throw Error('Resume source or protocol differs');
const pending = remainingFourArmyFairnessCases(fourArmyFairnessCases(previous.rows), resumed?.rows ?? []);
const nextCommand = (state: FourArmyState, c: FairnessCase): FourArmyCommand => {
  const actor = state.round.order[state.round.index]!;
  if (state.paused) return { actor, type: 'resume' };
  const command = chooseFourArmyCpuCommand(value(observeFourArmy(state, actor)), c.spec.settings[actor], c.cpuVersion);
  if (!command) throw Error('No current command');
  return command;
};
function run(c: FairnessCase) {
  const map = value(createFourArmyMap32(c.spec.seed, c.spec.order, 1, c.rules === 'expanded' ? { version: 1, tactics: true } : undefined));
  let state = value(createFourArmyState(map)),
    count = 0,
    fallbacks = 0,
    resumes = 0;
  const trace = createHash('sha256'),
    commands: FourArmyCommand[] = [],
    times: number[] = [],
    began = performance.now();
  let continuation: { position: number; comparedCommands: number; traceSha256: string } | undefined;
  while (state.outcome.type === 'ongoing' && state.round.round <= c.spec.maxRound && count < c.spec.maxCommands) {
    const start = performance.now();
    let command = nextCommand(state, c);
    times.push(performance.now() - start);
    if (command.type === 'resume') resumes++;
    let next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      const unitId = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = unitId ? { actor: command.actor, type: 'wait', unitId } : { actor: command.actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
      fallbacks++;
    }
    state = value(next);
    count++;
    commands.push(command);
    trace.update(JSON.stringify(command) + '\n');
    if (FOUR_ARMY_IDS.some((a) => state.units.filter((u) => u.owner === a).length > 16)) throw Error('Army unit cap exceeded');
    if (count === 512 && c.cohort === 'settings') {
      const encoded = value(
        serializeFourArmySpectatorSave({
          format: 'ministr-four-army-configurable',
          schemaVersion: 3,
          controllers: fourArmyControllers(),
          cpuVersion: c.cpuVersion,
          name: 'Fairness continuation',
          savedAt: '2026-11-15T00:00:00.000Z',
          settings: c.spec.settings,
          view: 'all',
          speed: 1,
          archive: {
            format: 'ministr-four-army-save',
            schemaVersion: state.engineVersion,
            ruleset: state.engineVersion === 3 ? 'four-army-v3' : 'four-army-v2',
            payload: { map, commands, state },
          },
        }),
      );
      let restored = value(parseFourArmySpectatorSave(encoded)).archive.payload.state,
        original = state;
      if (JSON.stringify(restored) !== JSON.stringify(original)) throw Error('Round-trip state drift');
      const witness = createHash('sha256');
      let compared = 0;
      while (compared < 64 && original.outcome.type === 'ongoing') {
        const a = nextCommand(original, c),
          b = nextCommand(restored, c);
        if (JSON.stringify(a) !== JSON.stringify(b)) throw Error('Restored CPU continuation drift');
        const na = applyFourArmyCommand(original, a),
          nb = applyFourArmyCommand(restored, b);
        if (na.ok !== nb.ok) throw Error('Restored command result drift');
        if (!na.ok || !nb.ok) break;
        original = na.value;
        restored = nb.value;
        witness.update(JSON.stringify(a) + '\n');
        compared++;
      }
      if (JSON.stringify(restored) !== JSON.stringify(original)) throw Error('Restored final state drift');
      continuation = { position: count, comparedCommands: compared, traceSha256: witness.digest('hex') };
    }
  }
  const digest = trace.digest('hex'),
    final = hash(JSON.stringify(state));
  if (c.baselineTrace && (digest !== c.baselineTrace || final !== c.baselineState)) throw Error('Published v3 classic baseline drift: ' + c.spec.id);
  times.sort((a, b) => a - b);
  const snapshot = {
    count,
    round: state.round.round,
    outcome: state.outcome,
    alive: state.alive,
    eliminations: state.eliminations,
    traceSha256: digest,
    finalStateSha256: final,
    fallbacks,
    resumes,
    stoppedBy: state.outcome.type !== 'ongoing' ? 'outcome' : count >= c.spec.maxCommands ? 'command-budget' : 'round-budget',
    cpuMs: { p50: times[Math.ceil(times.length * 0.5) - 1] ?? 0, p95: times[Math.ceil(times.length * 0.95) - 1] ?? 0, max: times.at(-1) ?? 0 },
  };
  let extension: { count: number; round: number; outcome: FourArmyState['outcome']; stoppedBy: string; finalStateSha256: string } | undefined;
  if (c.cohort === 'cutoffs' && c.rules === 'expanded' && c.cpuVersion === 'four-army-cpu-v4' && state.outcome.type === 'ongoing') {
    while (state.outcome.type === 'ongoing' && state.round.round <= 1000 && count < 65536) {
      const command = nextCommand(state, c),
        next = applyFourArmyCommand(state, command);
      if (!next.ok) throw Error('Rejected command during extended diagnosis: ' + next.error);
      state = next.value;
      count++;
    }
    extension = {
      count,
      round: state.round.round,
      outcome: state.outcome,
      stoppedBy: state.outcome.type !== 'ongoing' ? 'outcome' : count >= 65536 ? 'command-budget' : 'round-budget',
      finalStateSha256: hash(JSON.stringify(state)),
    };
  }
  return { ...c, ...snapshot, ...(continuation ? { continuation } : {}), ...(extension ? { extension } : {}), elapsedSeconds: (performance.now() - began) / 1000 };
}
const rows: ReturnType<typeof run>[] = [];
for (const [i, c] of pending.entries())
  if (i % shards === shard) {
    const row = run(c);
    rows.push(row);
    if (output) {
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(
        output,
        JSON.stringify(
          {
            schemaVersion: 1,
            protocol: 'four-army-fairness-v1',
            gameSource: '2cc327434042f8f5a35bb44d939fbf399613ef31',
            frozenSources,
            environment: { node: process.version, cpu: cpus()[0]?.model, platform: platform() },
            shard,
            shards,
            ...(resumed ? { previouslyCompleted: resumed.rows.length } : {}),
            rows,
            summary: summarizeFourArmyFairness(rows),
          },
          null,
          2,
        ) + '\n',
      );
    }
    console.log(
      JSON.stringify({
        id: row.spec.id,
        rules: row.rules,
        cpu: row.cpuVersion,
        cohort: row.cohort,
        round: row.round,
        outcome: row.outcome,
        extension: row.extension,
        seconds: row.elapsedSeconds,
      }),
    );
  }
