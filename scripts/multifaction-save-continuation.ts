import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createExpandedBattleMap } from '../src/game/expandedBattleMap';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyState, type FourArmyCommand } from '../src/game/fourArmyEngine';
import { defaultFourArmyCpuSettings, chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';
import { fourArmyControllers } from '../src/game/fourArmyControl';
import type { FourArmyControlHistory } from '../src/game/fourArmyControlHistory';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from '../src/game/fourArmyExperience';
import { serializeFourArmySpectatorSave, parseFourArmySpectatorSave, type FourArmySpectatorSave } from '../src/game/fourArmySpectatorSave';
import { FOUR_ARMY_IDS } from '../src/game/fourArmyFoundation';
import type { GameResult } from '../src/game/types';
const value = <T>(r: GameResult<T>): T => {
    if (!r.ok) throw Error(r.error);
    return r.value;
  },
  hash = (s: string) => createHash('sha256').update(s).digest('hex');
const output = process.argv[2];
if (!output) throw Error('Provide output');
const settings = defaultFourArmyCpuSettings();
const scenarios = (['skirmish', 'outpost', 'strait', 'frontier'] as const).flatMap((sourceMapId) =>
  [2, 3, 4].map((n) => ({ sourceMapId, participants: FOUR_ARMY_IDS.slice(4 - n), team: false })),
);
for (const sourceMapId of ['skirmish', 'strait'] as const) for (const n of [3, 4]) scenarios.push({ sourceMapId, participants: FOUR_ARMY_IDS.slice(4 - n), team: true });
const sources = [
  'src/game/fourArmyEngine.ts',
  'src/game/expandedBattleMap.ts',
  'src/game/smallBattle.ts',
  'src/game/fourArmySpectatorSave.ts',
  'src/game/fourArmyControlHistory.ts',
  'src/game/fourArmyExperience.ts',
  'src/game/fourArmyCommandLog.ts',
  'src/ai/fourArmyCpu.ts',
  'src/ai/fourArmyObservation.ts',
];
const report = {
  protocol: 'multifaction-schema6-continuation-v1',
  sourceHashes: Object.fromEntries(sources.map((p) => [p, hash(readFileSync(p, 'utf8'))])),
  rows: [] as unknown[],
};
function choose(s: FourArmyState): FourArmyCommand {
  const actor = s.round.order[s.round.index]!;
  return s.paused ? { actor, type: 'resume' } : chooseFourArmyCpuCommand(value(observeFourArmy(s, actor)), settings[actor], 'four-army-cpu-v6')!;
}
function step(s: FourArmyState) {
  let command = choose(s),
    next = applyFourArmyCommand(s, command);
  if (!next.ok) {
    const id = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
    command = id ? { actor: command.actor, type: 'wait', unitId: id } : { actor: command.actor, type: 'endTurn' };
    next = applyFourArmyCommand(s, command);
  }
  return { command, next: value(next) };
}
for (const [index, c] of scenarios.entries()) {
  const map = value(
    createExpandedBattleMap({
      ...c,
      seed: 152203,
      rules: { version: 1, tactics: true },
      ...(c.team ? { teams: { army1: 'army1', army2: 'army2', army3: 'army1', army4: 'army2' } as const } : {}),
    }),
  );
  let state = value(createFourArmyState(map)),
    experience = initialFourArmyExperience(state, 0);
  const commands: FourArmyCommand[] = [],
    history: FourArmyControlHistory = { initial: fourArmyControllers(), events: [] };
  const human = map.match!.participants[0]!;
  while (commands.length < 64 && state.outcome.type === 'ongoing') {
    const { command, next } = step(state);
    commands.push(command);
    experience = advanceFourArmyExperience(experience, state, command, next, commands.length);
    state = next;
    if (commands.length === 32 && state.alive.includes(human) && state.outcome.type === 'ongoing') history.events.push({ at: 32, army: human, from: 'cpu', to: 'human' });
  }
  const controllers = fourArmyControllers(history.events.length ? [human] : []),
    save: FourArmySpectatorSave = {
      format: 'ministr-four-army-configurable',
      schemaVersion: 6,
      cpuVersion: 'four-army-cpu-v6',
      controllers,
      controlHistory: history,
      experience: fourArmyExperienceManifest(experience),
      name: 'Continuation',
      savedAt: '2026-11-17T00:00:00.000Z',
      settings,
      view: history.events.length ? human : 'all',
      speed: 1,
      archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, commands, state } },
    };
  const encoded = value(serializeFourArmySpectatorSave(save)),
    restored = value(parseFourArmySpectatorSave(encoded));
  let a = state,
    b = restored.archive.payload.state;
  const trace = createHash('sha256');
  let count = 0;
  while (a.outcome.type === 'ongoing' && count < 128) {
    const left = step(a),
      right = step(b);
    if (JSON.stringify(left) !== JSON.stringify(right)) throw Error('Continuation drift');
    trace.update(JSON.stringify(left.command) + '\n');
    a = left.next;
    b = right.next;
    count++;
  }
  report.rows.push({
    index,
    map: map.id,
    participants: map.match!.participants,
    teams: c.team,
    prefix: commands.length,
    controlEvents: history.events.length,
    bytes: new TextEncoder().encode(encoded).byteLength,
    savedStateSha256: hash(JSON.stringify(state)),
    compared: count,
    traceSha256: trace.digest('hex'),
    finalStateSha256: hash(JSON.stringify(a)),
    outcome: a.outcome,
  });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(map.id, c.team, count);
}
