import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSmallBattleMap } from '../src/game/smallBattleMap';
import { fourArmyParticipants } from '../src/game/smallBattle';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyCommand, type FourArmyState } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings } from '../src/ai/fourArmyCpu';
import { fourArmyControllers } from '../src/game/fourArmyControl';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from '../src/game/fourArmyExperience';
import { parseFourArmySpectatorSave, serializeFourArmySpectatorSave } from '../src/game/fourArmySpectatorSave';
import type { GameResult } from '../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function permutations<T>(a: readonly T[]): T[][] {
  return a.length ? a.flatMap((x, i) => permutations(a.filter((_, j) => j !== i)).map((t) => [x, ...t])) : [[]];
}
const shard = Number(process.argv[2] ?? 0),
  shards = Number(process.argv[3] ?? 4),
  out = process.argv[4] ?? '/tmp/small-battle-report.json',
  seedCount = Number(process.argv[5] ?? 3),
  seedStart = Number(process.argv[6] ?? 152101),
  cohort = Number(process.argv[7] ?? 0);
if (
  !Number.isInteger(shard) ||
  !Number.isInteger(shards) ||
  shard < 0 ||
  shard >= shards ||
  shards < 1 ||
  shards > 4 ||
  !Number.isInteger(seedCount) ||
  seedCount < 1 ||
  seedCount > 3
)
  throw Error('Invalid shard');
const paths = [
  'src/game/smallBattle.ts',
  'src/game/smallBattleMap.ts',
  'src/game/fourArmyFoundation.ts',
  'src/game/fourArmyEngine.ts',
  'src/ai/fourArmyCpu.ts',
  'src/ai/fourArmyCpuOrder.ts',
  'src/ai/fourArmyObservation.ts',
];
const sources = Object.fromEntries(paths.map((p) => [p, hash(readFileSync(p, 'utf8'))]));
if (!Number.isSafeInteger(seedStart) || seedStart < 0 || seedStart + seedCount > 0xffffffff || ![0, 3, 4].includes(cohort)) throw Error('Invalid cohort');
const cases = ([3, 4] as const)
  .filter((n) => !cohort || n === cohort)
  .flatMap((n) =>
    Array.from({ length: seedCount }, (_, i) => seedStart + i).flatMap((seed) =>
      [true, false].flatMap((tactics) => permutations((['army1', 'army2', 'army3', 'army4'] as const).slice(0, n)).map((order, index) => ({ n, seed, tactics, order, index }))),
    ),
  );
const rows: unknown[] = [];
for (const [index, c] of cases.entries()) {
  if (index % shards !== shard) continue;
  const map = value(createSmallBattleMap(c.n, c.seed, c.order, 'short', { version: 1, tactics: c.tactics }));
  let state = value(createFourArmyState(map));
  const commands: FourArmyCommand[] = [],
    times: number[] = [];
  let fallbacks = 0,
    firstContact: number | undefined;
  const witness = c.index === 0;
  let experience = initialFourArmyExperience(state, 0),
    restored: FourArmyState | undefined,
    continuation = 0;
  const choose = (s: FourArmyState) => {
    const actor = s.round.order[s.round.index]!,
      o = value(observeFourArmy(s, actor));
    if (o.units.some((u) => u.owner !== actor)) firstContact ??= s.round.round;
    const c = chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v5');
    if (!c) throw Error('Missing current command');
    return c;
  };
  while (state.outcome.type === 'ongoing' && commands.length < 4096) {
    const began = performance.now();
    let command = choose(state);
    times.push(performance.now() - began);
    let next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      const unitId = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = unitId ? { actor: command.actor, type: 'wait', unitId } : { actor: command.actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
      fallbacks++;
    }
    const after = value(next);
    commands.push(command);
    if (restored && continuation < 64) {
      let replayedCommand = choose(restored),
        replayed = applyFourArmyCommand(restored, replayedCommand);
      if (!replayed.ok) {
        const unitId = 'unitId' in replayedCommand ? replayedCommand.unitId : 'transportId' in replayedCommand ? replayedCommand.transportId : undefined;
        replayedCommand = unitId ? { actor: replayedCommand.actor, type: 'wait', unitId } : { actor: replayedCommand.actor, type: 'endTurn' };
        replayed = applyFourArmyCommand(restored, replayedCommand);
      }
      restored = value(replayed);
      if (JSON.stringify(replayedCommand) !== JSON.stringify(command) || JSON.stringify(restored) !== JSON.stringify(after)) throw Error('Save continuation drift');
      continuation++;
    }
    if (witness) experience = advanceFourArmyExperience(experience, state, command, after, commands.length);
    state = after;
    if (witness && commands.length === 64) {
      const text = value(
        serializeFourArmySpectatorSave({
          format: 'ministr-four-army-configurable',
          schemaVersion: 5,
          cpuVersion: 'four-army-cpu-v5',
          controllers: fourArmyControllers(),
          experience: fourArmyExperienceManifest(experience),
          name: 'Compact audit',
          savedAt: '2026-11-16T00:00:00.000Z',
          settings: defaultFourArmyCpuSettings(),
          view: 'all',
          speed: 1,
          archive: { format: 'ministr-four-army-save', schemaVersion: 4, ruleset: 'four-army-v4', payload: { map, commands, state } },
        }),
      );
      restored = value(parseFourArmySpectatorSave(text)).archive.payload.state;
    }
    if (fourArmyParticipants(state).some((a) => state.units.filter((u) => u.owner === a).length > 8)) throw Error('Unit cap');
  }
  if (state.outcome.type === 'ongoing') throw Error('Budget exhausted');
  times.sort((a, b) => a - b);
  const row = {
    ...c,
    commands: commands.length,
    outcome: state.outcome,
    round: state.decision?.round ?? state.round.round,
    deadline: !!state.decision,
    firstContact: firstContact ?? null,
    eliminations: state.eliminations,
    fallbacks,
    continuation,
    seat: state.outcome.type === 'victory' ? c.order.indexOf(state.outcome.winner) + 1 : null,
    trace: hash(commands.map((c) => JSON.stringify(c) + '\n').join('')),
    state: hash(JSON.stringify(state)),
    cpuP95: times[Math.ceil(times.length * 0.95) - 1] ?? 0,
  };
  rows.push(row);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ protocol: 'small-battle-v1', sources, shard, shards, totalCases: cases.length, rows }, null, 2) + '\n');
  console.log(JSON.stringify({ done: rows.length, n: c.n, seed: c.seed, tactics: c.tactics, index: c.index, commands: commands.length, outcome: state.outcome, round: row.round }));
}
