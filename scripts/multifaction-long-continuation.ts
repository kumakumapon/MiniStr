import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { createExpandedBattleMap } from '../src/game/expandedBattleMap';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyState, type FourArmyCommand } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings } from '../src/ai/fourArmyCpu';
import { isFourArmyCpuVersion } from '../src/ai/fourArmyCpuVersion';
import { FOUR_ARMY_IDS } from '../src/game/fourArmyFoundation';
import { fourArmyControllers } from '../src/game/fourArmyControl';
import type { FourArmyControlHistory } from '../src/game/fourArmyControlHistory';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from '../src/game/fourArmyExperience';
import { encodeFourArmySpectatorSave, verifyFourArmySpectatorSave, type FourArmySpectatorSave } from '../src/game/fourArmySpectatorSave';
import { FourArmyReplay } from '../src/ui/fourArmyReplay';
import type { GameResult } from '../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const [kind = 'ai', version = 'four-army-cpu-v7', shardText = '0', shardsText = '1', output = '/tmp/ministr1525-long/report.json'] = process.argv.slice(2),
  shard = Number(shardText),
  shards = Number(shardsText);
if (!['ai', 'soak'].includes(kind) || !isFourArmyCpuVersion(version) || !Number.isSafeInteger(shard) || !Number.isSafeInteger(shards) || shards < 1 || shard < 0 || shard >= shards)
  throw Error('ai|soak CPU shard shards output');
const selectedVersion = version;
const protocol = JSON.parse(readFileSync('docs/reviews/v1.5.25/protocol.json', 'utf8')) as {
  longWaterTeam: { maxRounds: number; maxCommands: number; continuationCommands: number; soakRounds: number };
};
const settings = defaultFourArmyCpuSettings(),
  directory = dirname(output);
mkdirSync(directory, { recursive: true });
const cases = (kind === 'ai' ? [152509, 152510] : [152501]).flatMap((seed) => [
  { sourceMapId: 'strait' as const, n: 3, team: false, seed },
  { sourceMapId: 'strait' as const, n: 4, team: false, seed },
  { sourceMapId: 'strait' as const, n: 3, team: true, seed },
  { sourceMapId: 'strait' as const, n: 4, team: true, seed },
  ...(kind === 'ai'
    ? [
        { sourceMapId: 'skirmish' as const, n: 4, team: true, seed },
        { sourceMapId: 'frontier' as const, n: 4, team: true, seed },
      ]
    : []),
]);
const sources = [
  'src/game/expandedBattleMap.ts',
  'src/game/fourArmyEngine.ts',
  'src/game/smallBattle.ts',
  'src/game/fourArmySpectatorSave.ts',
  'src/game/fourArmyControlHistory.ts',
  'src/game/fourArmyExperience.ts',
  'src/ui/fourArmyReplay.ts',
  'src/ai/fourArmyCpu.ts',
  'src/ai/fourArmyCpuRecovery.ts',
];
const report = {
  protocol: 'multifaction-long-continuation-v1525-v1',
  kind,
  version,
  shard,
  shards,
  budgets: protocol.longWaterTeam,
  sourceHashes: Object.fromEntries(sources.map((p) => [p, hash(readFileSync(p, 'utf8'))])),
  rows: [] as unknown[],
};
function step(state: FourArmyState) {
  const actor = state.round.order[state.round.index]!;
  const ready = state.units.find((u) => u.owner === actor && u.position && !u.hasActed);
  let command: FourArmyCommand = state.paused
    ? { actor, type: 'resume' }
    : kind === 'soak'
      ? ready
        ? { actor, type: 'wait', unitId: ready.id }
        : { actor, type: 'endTurn' }
      : chooseFourArmyCpuCommand(value(observeFourArmy(state, actor)), settings[actor], selectedVersion)!;
  let next = applyFourArmyCommand(state, command),
    fallback = false;
  if (!next.ok) {
    const id = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
    command = id ? { actor, type: 'wait', unitId: id } : { actor, type: 'endTurn' };
    next = applyFourArmyCommand(state, command);
    fallback = true;
  }
  return { command, state: value(next), fallback };
}
function verify(text: string) {
  const iterator = verifyFourArmySpectatorSave(text);
  let next = iterator.next();
  while (!next.done) next = iterator.next();
  return value(next.value);
}
for (const [index, c] of cases.entries()) {
  if (index % shards !== shard) continue;
  const id = `${kind}-${c.sourceMapId}-${c.n}-${c.team}-${c.seed}`,
    participants = FOUR_ARMY_IDS.slice(0, c.n);
  const map = value(
    createExpandedBattleMap({
      sourceMapId: c.sourceMapId,
      participants,
      seed: c.seed,
      ending: 'unlimited',
      rules: { version: 1, tactics: true },
      ...(c.team && c.n > 2 ? { teams: { army1: 'army1', army2: 'army2', army3: 'army1', army4: 'army2' } as const } : {}),
    }),
  );
  let state = value(createFourArmyState(map)),
    experience = initialFourArmyExperience(state, 0),
    fallbacks = 0,
    lastPausedRound = 0;
  const commands: FourArmyCommand[] = [],
    controllers = fourArmyControllers(),
    history: FourArmyControlHistory = { initial: controllers, events: [] },
    started = performance.now(),
    actions: Record<string, number> = {},
    pauses: number[] = [];
  type Point = { at: number; reason: string; bytes: number; saveSha256: string; stateSha256: string; compared: number; futureTraceSha256?: string; futureStateSha256?: string };
  const points: Point[] = [],
    forks: { state: FourArmyState; remaining: number; trace: ReturnType<typeof createHash>; point: Point }[] = [],
    seen = new Set<number>();
  const save = (): FourArmySpectatorSave => ({
    format: 'ministr-four-army-configurable',
    schemaVersion: 6,
    cpuVersion: version,
    name: 'Long continuation',
    savedAt: '2026-11-19T00:00:00.000Z',
    settings,
    controllers,
    controlHistory: history,
    experience: fourArmyExperienceManifest(experience),
    view: 'all',
    speed: 1,
    archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, state, commands } },
  });
  const checkpoint = (reason: string) => {
    if (seen.has(commands.length)) return;
    seen.add(commands.length);
    const encoded = value(encodeFourArmySpectatorSave(save())),
      decoded = verify(encoded).save;
    assert.equal(hash(decoded.archive.payload.state), hash(state));
    assert.deepEqual(decoded.archive.payload.commands, commands);
    assert.equal(decoded.cpuVersion, version);
    if (decoded.format !== 'ministr-four-army-configurable' || decoded.schemaVersion !== 6) throw Error('Expected configurable save');
    assert.deepEqual(decoded.controlHistory, history);
    assert.deepEqual(decoded.experience, fourArmyExperienceManifest(experience));
    assert.deepEqual(decoded.controllers, controllers);
    const point: Point = { at: commands.length, reason, bytes: new TextEncoder().encode(encoded).byteLength, saveSha256: hash(encoded), stateSha256: hash(state), compared: 0 };
    points.push(point);
    if (state.outcome.type === 'ongoing')
      forks.push({ state: decoded.archive.payload.state, remaining: protocol.longWaterTeam.continuationCommands, trace: createHash('sha256'), point });
    console.log(JSON.stringify({ id, checkpoint: point.at, reason, round: state.round.round, bytes: point.bytes }));
  };
  const maxRound = kind === 'soak' ? protocol.longWaterTeam.soakRounds : protocol.longWaterTeam.maxRounds;
  while (state.outcome.type === 'ongoing' && state.round.round <= maxRound && commands.length < protocol.longWaterTeam.maxCommands) {
    if ([256, 1024, 2048, 4096, 6144].includes(commands.length)) checkpoint('command-checkpoint');
    if (state.paused && lastPausedRound !== state.round.round) {
      lastPausedRound = state.round.round;
      pauses.push(lastPausedRound);
      checkpoint('100-round-boundary');
    }
    const next = step(state);
    for (const fork of forks.filter((f) => f.remaining > 0)) {
      const resumed = step(fork.state);
      assert.deepEqual(resumed.command, next.command);
      assert.equal(hash(resumed.state), hash(next.state));
      fork.state = resumed.state;
      fork.remaining--;
      fork.point.compared++;
      fork.trace.update(JSON.stringify(resumed.command) + '\n');
      if (!fork.remaining || resumed.state.outcome.type !== 'ongoing') {
        fork.point.futureTraceSha256 = fork.trace.digest('hex');
        fork.point.futureStateSha256 = hash(fork.state);
        fork.remaining = 0;
      }
    }
    if (next.fallback) fallbacks++;
    commands.push(next.command);
    actions[next.command.type] = (actions[next.command.type] ?? 0) + 1;
    experience = advanceFourArmyExperience(experience, state, next.command, next.state, commands.length);
    state = next.state;
    if (kind === 'soak' && commands.length === 256) {
      const army = state.alive[0]!;
      history.events.push({ at: 256, army, from: 'cpu', to: 'human' }, { at: 256, army, from: 'human', to: 'cpu' });
    }
  }
  for (const fork of forks.filter((f) => f.remaining > 0)) {
    fork.point.futureTraceSha256 = fork.trace.digest('hex');
    fork.point.futureStateSha256 = hash(fork.state);
    fork.remaining = 0;
  }
  checkpoint('final');
  const encoded = value(encodeFourArmySpectatorSave(save())),
    verified = verify(encoded),
    replay = new FourArmyReplay(map, verified.save.archive.payload.commands, verified.checkpoints);
  await replay.seek(commands.length);
  assert.equal(hash(replay.state), hash(state));
  await replay.seek(0);
  if (commands.length >= 16) {
    const pending = replay.seek(Math.min(97, commands.length));
    replay.cancel();
    assert.equal(await pending, undefined);
    assert.equal(replay.position, 0);
  }
  await replay.seek(commands.length);
  assert.equal(hash(replay.state), hash(state));
  assert.ok(replay.cachedStates <= FourArmyReplay.CACHE_LIMIT + 1 + verified.checkpoints.length);
  writeFileSync(join(directory, `${id}.save.json`), encoded);
  const row = {
    id,
    sourceMapId: c.sourceMapId,
    participants,
    team: c.team,
    seed: c.seed,
    commands: commands.length,
    round: state.round.round,
    outcome: state.outcome,
    stoppedBy: state.outcome.type !== 'ongoing' ? 'natural-result' : commands.length >= protocol.longWaterTeam.maxCommands ? 'command-budget' : 'round-budget',
    actions,
    fallbacks,
    pauses,
    controlEvents: history.events.length,
    points,
    bytes: new TextEncoder().encode(encoded).byteLength,
    traceSha256: hash(commands),
    stateSha256: hash(state),
    verifiedCheckpoints: verified.checkpoints.length,
    replayCache: replay.cachedStates,
    replayCancelled: true,
    seconds: (performance.now() - started) / 1000,
  };
  report.rows.push(row);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ id, commands: row.commands, round: row.round, outcome: row.outcome, seconds: row.seconds }));
}
