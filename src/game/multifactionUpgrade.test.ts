import { describe, expect, it } from 'vitest';
import { createExpandedBattleMap, latestExpandedBattleLayout } from './expandedBattleMap';
import { applyFourArmyCommand, createFourArmyState, isFourArmyCommand, observeFourArmy, type FourArmyCommand } from './fourArmyEngine';
import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from './fourArmyExperience';
import { fourArmyControllers } from './fourArmyControl';
import { parseFourArmySpectatorSave, serializeFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings } from '../ai/fourArmyCpu';
import type { GameResult } from './types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
function fixture(layoutVersion: 2 | 3 = 2): FourArmySpectatorSave {
  const map = value(createExpandedBattleMap({ participants: ['army1', 'army2', 'army3'], seed: 42, layoutVersion, rules: { version: 1, tactics: true } }));
  let state = value(createFourArmyState(map)),
    experience = initialFourArmyExperience(state, 0);
  const commands: FourArmyCommand[] = [],
    settings = defaultFourArmyCpuSettings();
  for (let i = 0; i < 16; i++) {
    const actor = state.round.order[state.round.index]!,
      command = chooseFourArmyCpuCommand(value(observeFourArmy(state, actor)), settings[actor], 'four-army-cpu-v6')!,
      next = value(applyFourArmyCommand(state, command));
    commands.push(command);
    experience = advanceFourArmyExperience(experience, state, command, next, commands.length);
    state = next;
  }
  const controllers = fourArmyControllers();
  return {
    format: 'ministr-four-army-configurable',
    schemaVersion: 6,
    cpuVersion: layoutVersion === 2 ? 'four-army-cpu-v6' : 'four-army-cpu-v7',
    name: 'Compatibility',
    savedAt: '2026-11-19T00:00:00.000Z',
    settings,
    controllers,
    controlHistory: { initial: controllers, events: [] },
    experience: fourArmyExperienceManifest(experience),
    view: 'all',
    speed: 1,
    archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, state, commands } },
  };
}
describe('v1.5.25 explicit CPU and layout compatibility', () => {
  it('keeps old layout and CPU decisions on load, and upgrades only future CPU decisions without replacing history', () => {
    const old = fixture(),
      original = structuredClone(old),
      text = value(serializeFourArmySpectatorSave(old)),
      restored = value(parseFourArmySpectatorSave(text));
    expect(restored.cpuVersion).toBe('four-army-cpu-v6');
    expect(restored.archive.payload).toEqual(old.archive.payload);
    const changed = { ...restored, cpuVersion: 'four-army-cpu-v7' as const },
      next = value(parseFourArmySpectatorSave(value(serializeFourArmySpectatorSave(changed))));
    expect(next.archive.payload).toEqual(old.archive.payload);
    expect(next.cpuVersion).toBe('four-army-cpu-v7');
    expect(old).toEqual(original);
    const state = old.archive.payload.state,
      actor = state.round.order[state.round.index]!;
    expect(chooseFourArmyCpuCommand(value(observeFourArmy(state, actor)), old.settings[actor], old.cpuVersion)).toEqual(
      chooseFourArmyCpuCommand(value(observeFourArmy(restored.archive.payload.state, actor)), restored.settings[actor], restored.cpuVersion),
    );
  });
  it('roundtrips the explicit new northern facilities while preserving the legacy constructor default', () => {
    const old = fixture(),
      next = fixture(3),
      restored = value(parseFourArmySpectatorSave(value(serializeFourArmySpectatorSave(next))));
    expect(old.archive.payload.map.match?.layoutVersion).toBe(2);
    expect(next.archive.payload.map.match?.layoutVersion).toBe(3);
    expect(restored.archive.payload).toEqual(next.archive.payload);
    expect(old.archive.payload.map.board.terrain[5]![8]!.kind).toBe('factory');
    expect(next.archive.payload.map.board.terrain[4]![8]!.kind).toBe('factory');
    const forged = structuredClone(old);
    forged.archive.payload.map.match!.layoutVersion = 3;
    forged.archive.payload.map.id = forged.archive.payload.map.id.replace('-v2', '-v3');
    expect(parseFourArmySpectatorSave(JSON.stringify(forged)).ok).toBe(false);
  });
  it('applies the northern layout by starting slot for every valid three-army roster, with unchanged initial strength', () => {
    for (const absent of FOUR_ARMY_IDS) {
      const participants = FOUR_ARMY_IDS.filter((a) => a !== absent),
        old = value(createExpandedBattleMap({ participants })),
        next = value(createExpandedBattleMap({ participants, layoutVersion: 3 }));
      expect(next.units).toEqual(old.units);
      expect(next.players).toEqual(old.players);
      expect(next.capitals).toEqual(old.capitals);
      expect(Object.keys(next.players)).toEqual(participants);
      expect(createFourArmyState(next).ok).toBe(true);
    }
    expect(latestExpandedBattleLayout('skirmish', 3)).toBe(3);
    expect(latestExpandedBattleLayout('strait', 3)).toBe(2);
    expect(createExpandedBattleMap({ sourceMapId: 'strait', participants: ['army1', 'army2', 'army3'], layoutVersion: 3 }).ok).toBe(false);
    expect(createExpandedBattleMap({ layoutVersion: 3 }).ok).toBe(false);
  });
  it('rejects reserved future schemas, diplomacy and submarine commands without reinterpreting existing data', () => {
    const saved = fixture(3),
      original = JSON.stringify(saved);
    for (const edit of [
      (s: FourArmySpectatorSave) => {
        Object.assign(s, { schemaVersion: 7 });
      },
      (s: FourArmySpectatorSave) => {
        Object.assign(s.archive, { schemaVersion: 6, ruleset: 'four-army-v6' });
      },
      (s: FourArmySpectatorSave) => {
        Object.assign(s.archive.payload.map.match!, { version: 3 });
      },
      (s: FourArmySpectatorSave) => {
        Object.assign(s, { cpuVersion: 'four-army-cpu-v8' });
      },
      (s: FourArmySpectatorSave) => {
        Object.assign(s, { diplomacy: { teams: {} } });
      },
      (s: FourArmySpectatorSave) => {
        Object.assign(s.archive.payload.state.units[0]!, { submerged: true, diveTurns: 0 });
      },
    ]) {
      const altered: FourArmySpectatorSave = JSON.parse(original);
      edit(altered);
      expect(parseFourArmySpectatorSave(JSON.stringify(altered)).ok).toBe(false);
      expect(JSON.stringify(saved)).toBe(original);
    }
    for (const command of [
      { actor: 'army1', type: 'joinArmy', army: 'army4' },
      { actor: 'army1', type: 'alliance', target: 'army2' },
      { actor: 'army1', type: 'dive', unitId: 'u1' },
    ])
      expect(isFourArmyCommand(command)).toBe(false);
  });
});
