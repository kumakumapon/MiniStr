import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fourArmyFairnessCases } from './fourArmyFairness';
import { compareFourArmyContinuation } from './fourArmyContinuation';
import { createFourArmyMap32 } from '../src/game/fourArmyMap32';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyCommand, type FourArmyState } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand } from '../src/ai/fourArmyCpu';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from '../src/game/fourArmyExperience';
import { fourArmyControllers } from '../src/game/fourArmyControl';
import { serializeFourArmySpectatorSave, verifyFourArmySpectatorSave } from '../src/game/fourArmySpectatorSave';
import type { GameResult } from '../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const output = process.argv[2];
if (!output) throw Error('Provide the output JSON path');
const previous = JSON.parse(readFileSync('docs/reviews/v1.5.16/comparison.json', 'utf8')) as { rows: Parameters<typeof fourArmyFairnessCases>[0] };
const frozenSources = Object.fromEntries(
  ['src/ai/fourArmyCpu.ts', 'src/ai/fourArmyObservation.ts', 'src/game/fourArmyEngine.ts', 'src/game/fourArmyMap32.ts', 'src/game/fourArmyRules.ts'].map((p) => [
    p,
    hash(readFileSync(p, 'utf8')),
  ]),
);
const rows = [];
for (const c of fourArmyFairnessCases(previous.rows).filter((c) => c.cohort === 'settings')) {
  const map = value(createFourArmyMap32(c.spec.seed, c.spec.order, 1, c.rules === 'expanded' ? { version: 1, tactics: true } : undefined));
  let state = value(createFourArmyState(map)),
    experience = initialFourArmyExperience(state, 0),
    rejected = 0;
  const commands: FourArmyCommand[] = [];
  const choose = (s: FourArmyState): FourArmyCommand => {
    const actor = s.round.order[s.round.index]!;
    const command = s.paused ? { actor, type: 'resume' as const } : chooseFourArmyCpuCommand(value(observeFourArmy(s, actor)), c.spec.settings[actor], c.cpuVersion);
    if (!command) throw Error('No CPU command');
    return command;
  };
  while (commands.length < 512 && state.outcome.type === 'ongoing') {
    let command = choose(state),
      next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      const unitId = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = unitId ? { actor: command.actor, type: 'wait', unitId } : { actor: command.actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
      rejected++;
    }
    const after = value(next);
    commands.push(command);
    experience = advanceFourArmyExperience(experience, state, command, after, commands.length);
    state = after;
  }
  const raw = value(
    serializeFourArmySpectatorSave({
      format: 'ministr-four-army-configurable',
      schemaVersion: 4,
      controllers: fourArmyControllers(),
      experience: fourArmyExperienceManifest(experience),
      cpuVersion: c.cpuVersion,
      name: 'Schema4 continuation',
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
  const verifier = verifyFourArmySpectatorSave(raw);
  let step = verifier.next();
  while (!step.done) step = verifier.next();
  const restored = value(step.value);
  if (JSON.stringify(restored.experience) !== JSON.stringify(experience)) throw Error('Restored observed history drift');
  const continuation = compareFourArmyContinuation(state, restored.save.archive.payload.state, choose);
  const row = {
    id: c.spec.id,
    rules: c.rules,
    cpuVersion: c.cpuVersion,
    spec: c.spec,
    schemaVersion: 4,
    position: commands.length,
    prefixTraceSha256: hash(commands.map((a) => JSON.stringify(a) + '\n').join('')),
    savedStateSha256: hash(JSON.stringify(state)),
    encodedBytes: new TextEncoder().encode(raw).byteLength,
    fallbacksInPrefix: rejected,
    retainedEvents: Object.fromEntries(Object.entries(experience.events).map(([v, events]) => [v, events.length])),
    retainedSightings: Object.fromEntries(Object.entries(experience.sightings).map(([v, sightings]) => [v, sightings.length])),
    continuation: {
      commands: continuation.commands,
      comparedCommands: continuation.commands.length,
      fallbacks: continuation.fallbacks,
      traceSha256: hash(continuation.commands.map((a) => JSON.stringify(a) + '\n').join('')),
      finalStateSha256: hash(JSON.stringify(continuation.restored)),
      outcome: continuation.restored.outcome,
    },
  };
  rows.push(row);
  const temp = output + '.tmp';
  writeFileSync(temp, JSON.stringify({ protocol: 'four-army-schema4-continuation-v1', frozenSources, rows }, null, 2) + '\n');
  renameSync(temp, output);
  console.log(JSON.stringify({ id: row.id, rules: row.rules, cpu: row.cpuVersion, compared: row.continuation.comparedCommands, fallbacks: row.continuation.fallbacks }));
}
