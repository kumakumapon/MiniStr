import { createFourArmyMap32 } from './fourArmyMap32';
import { describe, expect, it } from 'vitest';
import { createExpandedBattleMap } from './expandedBattleMap';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, isFourArmyState, type FourArmyCommand } from './fourArmyEngine';
import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { battleWinners, isSmallBattle } from './smallBattle';
import { isFourArmyObservation, fourArmyPlanningView } from '../ai/fourArmyObservation';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings, isObservedFourArmyCommand } from '../ai/fourArmyCpu';
import { fourArmyControllers } from './fourArmyControl';
import { initialFourArmyExperience, fourArmyExperienceManifest, advanceFourArmyExperience } from './fourArmyExperience';
import { parseFourArmySpectatorSave, serializeFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import { packFourArmyCommands, unpackFourArmyCommands } from './fourArmyCommandLog';
import type { GameResult } from './types';
const value = <T>(v: GameResult<T>): T => {
  if (!v.ok) throw Error(v.error);
  return v.value;
};
const preset = () => value(createExpandedBattleMap({ participants: ['army2', 'army3', 'army4'], rules: { version: 1, tactics: true } }));
describe('expanded matches preserve army identities and legacy boundaries', () => {
  for (const sourceMapId of ['skirmish', 'outpost', 'strait', 'frontier'] as const)
    for (const participants of [['army2', 'army4'], ['army2', 'army3', 'army4'], [...FOUR_ARMY_IDS]] as const)
      it(`starts ${sourceMapId}/${participants.join(',')} with observed CPU commands`, () => {
        const map = value(createExpandedBattleMap({ sourceMapId, participants, rules: { version: 1, tactics: true } }));
        let state = value(createFourArmyState(map));
        expect(Object.keys(state.players)).toEqual(participants);
        expect(Object.keys(state.capitals)).toEqual(participants);
        expect(Object.keys(state.setup!.startZones)).toEqual(participants);
        expect(state.units).toHaveLength(participants.length * (sourceMapId === 'frontier' ? 8 : 4));
        for (let i = 0; i < 20; i++) {
          const actor = state.round.order[state.round.index]!,
            o = value(observeFourArmy(state, actor));
          expect(isFourArmyObservation(o)).toBe(true);
          const c = chooseFourArmyCpuCommand(o, defaultFourArmyCpuSettings()[actor], 'four-army-cpu-v6')!;
          expect(isObservedFourArmyCommand(o, c)).toBe(true);
          let next = applyFourArmyCommand(state, c);
          if (!next.ok) next = applyFourArmyCommand(state, { actor, type: 'endTurn' });
          state = value(next);
        }
        expect(isFourArmyState(state)).toBe(true);
        for (const inactive of FOUR_ARMY_IDS.filter((a) => !participants.includes(a as never))) expect(observeFourArmy(state, inactive).ok).toBe(false);
      });
  it('rotates every full round and equalizes each position over the whole short game', () => {
    for (const n of [3, 4]) {
      let s = value(createFourArmyState(value(createExpandedBattleMap({ participants: FOUR_ARMY_IDS.slice(0, n) }))));
      const counts = Object.fromEntries(s.alive.map((a) => [a, Array<number>(n).fill(0)]));
      const rounds = n === 3 ? 21 : 20;
      for (let r = 1; r <= rounds; r++) {
        expect(s.round.round).toBe(r);
        for (let seat = 0; seat < n; seat++) {
          const actor = s.round.order[s.round.index]!;
          counts[actor]![seat]!++;
          s = value(applyFourArmyCommand(s, { actor, type: 'endTurn' }));
        }
      }
      expect(s.decision?.round).toBe(rounds);
      expect(s.outcome.type).toBe('draw');
      for (const row of Object.values(counts)) expect(row).toEqual(Array(n).fill(rounds / n));
      expect(isFourArmyObservation(value(observeFourArmy(s, 'army1')))).toBe(true);
    }
  });
  it('rejects malformed rosters, orders and unanimous teams', () => {
    for (const participants of [[], ['army1'], ['army2', 'army1'], ['army1', 'army1']]) expect(createExpandedBattleMap({ participants: participants as never }).ok).toBe(false);
    expect(createExpandedBattleMap({ order: ['army1', 'army1', 'army3', 'army4'] }).ok).toBe(false);
    expect(createExpandedBattleMap({ teams: { army1: 'army1', army2: 'army1', army3: 'army1', army4: 'army1' } }).ok).toBe(false);
    expect(createExpandedBattleMap({ teams: { army1: 'army1', army3: 'army1' }, sharedVision: false }).ok).toBe(false);
    expect(isSmallBattle({ ...preset().match, unknown: true })).toBe(false);
  });
  it('shares allied vision while forbidding foreign commands, capture, merge and attacks', () => {
    const map = value(createExpandedBattleMap({ teams: { army1: 'army1', army2: 'army2', army3: 'army1', army4: 'army2' }, rules: { version: 1, tactics: false } }));
    let s = value(createFourArmyState(map));
    const o = value(observeFourArmy(s, 'army1')),
      ally = o.units.find((u) => u.owner === 'army3')!;
    expect(isFourArmyObservation(o)).toBe(true);
    expect(o.units.filter((u) => u.owner === 'army3')).toHaveLength(4);
    expect(fourArmyPlanningView(o).units.find((u) => u.id === ally.id)!.owner).toBe('red');
    const own = o.units.find((u) => u.owner === 'army1')!;
    for (const c of [
      { actor: 'army1', type: 'wait', unitId: ally.id },
      { actor: 'army1', type: 'attack', unitId: own.id, targetId: ally.id },
      { actor: 'army1', type: 'merge', unitId: own.id, targetId: ally.id },
      { actor: 'army1', type: 'embark', unitId: own.id, transportId: ally.id },
      { actor: 'army1', type: 'produce', factory: map.capitals.army3, kind: 'infantry' },
    ]) {
      expect(isObservedFourArmyCommand(o, c)).toBe(false);
      expect(applyFourArmyCommand(s, c).ok).toBe(false);
    }
    // At the deadline, allied holdings are counted together and both members receive victory.
    s = { ...s, board: structuredClone(s.board) };
    s.board.terrain[0]![0] = { kind: 'city', owner: 'army1', capturePoints: 20 };
    for (let i = 0; i < 80; i++) s = value(applyFourArmyCommand(s, { actor: s.round.order[s.round.index]!, type: 'endTurn' }));
    expect(battleWinners(s)).toEqual(['army1', 'army3']);
    expect(isFourArmyObservation(value(observeFourArmy(s, 'army3')))).toBe(true);
  });
  it('permits an engineer to demolish and rebuild a public vacant crossing and packs it losslessly', () => {
    let s = value(createFourArmyState(value(createExpandedBattleMap({ sourceMapId: 'strait' }))));
    const engineer = s.units.find((u) => u.owner === 'army1' && u.kind === 'engineer')!;
    // Public test position at the bridge bank, within the same army and legal terrain.
    s = { ...s, units: s.units.map((u) => (u.id === engineer.id ? { ...u, position: { x: 7, y: 3 } } : u)) };
    expect(isFourArmyState(s)).toBe(true);
    const remove: FourArmyCommand = { actor: 'army1', type: 'destroyBridge', unitId: engineer.id, destination: { x: 8, y: 3 } };
    s = value(applyFourArmyCommand(s, remove));
    expect(s.bridges).toHaveLength(3);
    for (let i = 0; i < 7; i++) s = value(applyFourArmyCommand(s, { actor: s.round.order[s.round.index]!, type: 'endTurn' }));
    const build: FourArmyCommand = { actor: 'army1', type: 'bridge', unitId: engineer.id, destination: { x: 8, y: 3 } };
    // Rotating initiative: army1 follows armies2–4 in round2, then receives upkeep exactly once.
    expect(s.round.order[s.round.index]).toBe('army1');
    const gold = s.players.army1.gold;
    s = value(applyFourArmyCommand(s, build));
    expect(s.players.army1.gold).toBe(gold - 1000);
    expect(s.bridges).toHaveLength(4);
    expect(value(unpackFourArmyCommands(packFourArmyCommands([remove, build])))).toEqual([remove, build]);
    expect(unpackFourArmyCommands({ ...packFourArmyCommands([build]), encoding: 'four-army-log-v2' }).ok).toBe(false);
  });
  it('CPU v6 lets a healthy capturer reach a fuel-safe enemy service objective while wounded units still return', () => {
    const original = value(createFourArmyState(value(createFourArmyMap32(1522, undefined, 1))));
    const unit = original.units.find((u) => u.owner === 'army1' && u.kind === 'infantry')!;
    const s = {
      ...original,
      board: {
        ...original.board,
        terrain: original.board.terrain.map((row, y) =>
          row.map((_, x) => {
            const home = FOUR_ARMY_IDS.find((a) => original.capitals[a].x === x && original.capitals[a].y === y);
            return home ? { kind: 'capital' as const, owner: home, capturePoints: 20 } : { kind: 'plain' as const };
          }),
        ),
      },
      players: { ...original.players, army1: { gold: 0, income: 1000 } },
      units: original.units.map((u) => (u.id === unit.id ? { ...u, position: { x: 16, y: 16 }, fuel: 28 } : u.owner === 'army1' ? { ...u, hasMoved: true, hasActed: true } : u)),
    };
    const o = value(observeFourArmy(s, 'army1')),
      settings = defaultFourArmyCpuSettings().army1;
    const distance = (p: { x: number; y: number }) => Math.abs(p.x - original.capitals.army1.x) + Math.abs(p.y - original.capitals.army1.y);
    const old = chooseFourArmyCpuCommand(o, settings, 'four-army-cpu-v4'),
      improved = chooseFourArmyCpuCommand(o, settings, 'four-army-cpu-v6');
    expect(old?.type).toBe('move');
    expect(improved?.type).toBe('move');
    if (old?.type === 'move' && improved?.type === 'move') {
      expect(distance(old.destination)).toBeLessThan(distance({ x: 16, y: 16 }));
      expect(distance(improved.destination)).toBeGreaterThan(distance({ x: 16, y: 16 }));
    }
    const wounded = value(observeFourArmy({ ...s, units: s.units.map((u) => (u.id === unit.id ? { ...u, hp: 25 } : u)) }, 'army1'));
    expect(chooseFourArmyCpuCommand(wounded, settings, 'four-army-cpu-v6')).toEqual(chooseFourArmyCpuCommand(wounded, settings, 'four-army-cpu-v4'));
  });
  it('keeps a full canonical naval engineering history through schema6 verification', () => {
    const map = value(createExpandedBattleMap({ sourceMapId: 'strait', rules: { version: 1, tactics: true } }));
    let state = value(createFourArmyState(map));
    let experience = initialFourArmyExperience(state, 0);
    const commands: FourArmyCommand[] = [];
    const engineer = state.units.find((u) => u.owner === 'army1' && u.kind === 'engineer')!;
    const apply = (c: FourArmyCommand) => {
      const next = value(applyFourArmyCommand(state, c));
      commands.push(c);
      experience = advanceFourArmyExperience(experience, state, c, next, commands.length);
      state = next;
    };
    const cycle = () => {
      do {
        apply({ actor: state.round.order[state.round.index]!, type: 'endTurn' });
      } while (state.round.order[state.round.index] !== 'army1');
    };
    apply({ actor: 'army1', type: 'move', unitId: engineer.id, destination: { x: 6, y: 3 } });
    cycle();
    apply({ actor: 'army1', type: 'move', unitId: engineer.id, destination: { x: 7, y: 3 } });
    cycle();
    apply({ actor: 'army1', type: 'destroyBridge', unitId: engineer.id, destination: { x: 8, y: 3 } });
    cycle();
    const engineerTurn = value(observeFourArmy(state, 'army1'));
    engineerTurn.units = engineerTurn.units.map((u) => (u.owner === 'army1' && u.id !== engineer.id ? { ...u, hasActed: true, hasMoved: true } : u));
    engineerTurn.board = {
      ...engineerTurn.board,
      terrain: engineerTurn.board.terrain.map((row) => row.map((t) => (t.capturePoints !== undefined && t.owner === undefined ? { ...t, owner: 'army1' as const } : t))),
    };
    expect(chooseFourArmyCpuCommand(engineerTurn, defaultFourArmyCpuSettings().army1, 'four-army-cpu-v6')?.type).toBe('bridge');
    apply({ actor: 'army1', type: 'bridge', unitId: engineer.id, destination: { x: 8, y: 3 } });
    cycle();
    apply({ actor: 'army1', type: 'move', unitId: engineer.id, destination: { x: 9, y: 3 } });
    const controllers = fourArmyControllers(['army1']);
    const save: FourArmySpectatorSave = {
      format: 'ministr-four-army-configurable',
      schemaVersion: 6,
      cpuVersion: 'four-army-cpu-v6',
      controllers,
      controlHistory: { initial: controllers, events: [] },
      experience: fourArmyExperienceManifest(experience),
      name: 'Bridge history',
      savedAt: '2026-11-17T00:00:00.000Z',
      settings: defaultFourArmyCpuSettings(),
      view: 'army1',
      speed: 1,
      archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, commands, state } },
    };
    expect(value(parseFourArmySpectatorSave(value(serializeFourArmySpectatorSave(save))))).toEqual(save);
    for (const bridges of [[{ owner: 'army9', position: { x: 8, y: 3 } }], [{ owner: 'army1', position: { x: 0, y: 0 } }], [...state.bridges!, state.bridges![0]!]])
      expect(isFourArmyState({ ...state, bridges })).toBe(false);
    const o = value(observeFourArmy(state, 'army1'));
    expect(isFourArmyObservation({ ...o, bridges: [{ owner: 'army1', position: { x: 0, y: 0 } }] })).toBe(false);
  });

  it('directs late surviving combat units past an uncapturable enemy factory', () => {
    let s = value(createFourArmyState(value(createFourArmyMap32(1522, undefined, 1))));
    const tank = s.units.find((u) => u.owner === 'army1' && u.kind === 'tank')!;
    s = {
      ...s,
      alive: ['army1', 'army2'],
      eliminations: [
        { army: 'army3', round: 1 },
        { army: 'army4', round: 1 },
      ],
      round: { ...s.round, round: 40 },
      board: { ...s.board, terrain: s.board.terrain.map((row) => row.map((t) => (t.owner === 'army3' || t.owner === 'army4' ? { ...t, owner: undefined } : t))) },
      units: s.units
        .filter((u) => u.owner === 'army1' || u.owner === 'army2')
        .map((u) => (u.id === tank.id ? { ...u, position: { x: 12, y: 10 } } : u.owner === 'army1' ? { ...u, hasActed: true, hasMoved: true } : u)),
      players: { ...s.players, army1: { gold: 0, income: s.players.army1.income } },
    };
    s.board.terrain[10]![12] = { kind: 'factory', owner: 'army2', capturePoints: 20 };
    expect(isFourArmyState(s)).toBe(true);
    const o = value(observeFourArmy(s, 'army1')),
      opts = defaultFourArmyCpuSettings().army1;
    const old = chooseFourArmyCpuCommand(o, opts, 'four-army-cpu-v4'),
      improved = chooseFourArmyCpuCommand(o, opts, 'four-army-cpu-v6');
    expect(old?.type).toBe('move');
    expect(improved?.type).toBe('move');
    if (old?.type === 'move' && improved?.type === 'move') {
      const home = s.capitals.army2;
      const distance = (p: { x: number; y: number }) => Math.abs(p.x - home.x) + Math.abs(p.y - home.y);
      expect(distance(old.destination)).toBeGreaterThan(distance({ x: 12, y: 10 }));
      expect(distance(improved.destination)).toBeLessThan(distance({ x: 12, y: 10 }));
    }
  });
  it('does not treat an allied facility or army as personal income, upkeep or control', () => {
    const map = value(createExpandedBattleMap({ participants: ['army1', 'army2', 'army3'], teams: { army1: 'army1', army2: 'army2', army3: 'army1' } }));
    let s = value(createFourArmyState(map));
    expect(s.players.army1.income).toBe(3000);
    expect(s.players.army1.gold).toBe(9000);
    const unit = s.units.find((u) => u.owner === 'army1' && u.kind === 'infantry')!;
    const allyCity = s.board.terrain.flatMap((row, y) => row.flatMap((t, x) => (t.owner === 'army3' && t.kind === 'city' ? [{ x, y }] : [])))[0]!;
    s = {
      ...s,
      players: { ...s.players, army1: { gold: 0, income: 3000 } },
      units: s.units.map((u) => (u.id === unit.id ? { ...u, position: allyCity, hp: 25, fuel: 50 } : u.owner === 'army1' ? { ...u, hasActed: true, hasMoved: true } : u)),
    };
    const o = value(observeFourArmy(s, 'army1'));
    expect(isFourArmyObservation(o)).toBe(true);
    expect(chooseFourArmyCpuCommand(o, defaultFourArmyCpuSettings().army1, 'four-army-cpu-v6')?.type).toBe('move');
    do {
      s = value(applyFourArmyCommand(s, { actor: s.round.order[s.round.index]!, type: 'endTurn' }));
    } while (s.round.order[s.round.index] !== 'army1');
    expect(s.units.find((u) => u.id === unit.id)!.hp).toBe(25);
    expect(s.units.find((u) => u.id === unit.id)!.fuel).toBe(50);
  });
  it('validates controller histories against replay, saves v6 and continues identically', () => {
    const map = preset();
    let s = value(createFourArmyState(map));
    let experience = initialFourArmyExperience(s, 0);
    const commands: FourArmyCommand[] = [];
    for (let i = 0; i < 6; i++) {
      const c: FourArmyCommand = { actor: s.round.order[s.round.index]!, type: 'endTurn' },
        next = value(applyFourArmyCommand(s, c));
      commands.push(c);
      experience = advanceFourArmyExperience(experience, s, c, next, commands.length);
      s = next;
    }
    const initial = fourArmyControllers(['army2']),
      controllers = fourArmyControllers(['army4']);
    const save: FourArmySpectatorSave = {
      format: 'ministr-four-army-configurable',
      schemaVersion: 6,
      cpuVersion: 'four-army-cpu-v6',
      controllers,
      controlHistory: {
        initial,
        events: [
          { at: 2, army: 'army2', from: 'human', to: 'cpu' },
          { at: 2, army: 'army4', from: 'cpu', to: 'human' },
        ],
      },
      experience: fourArmyExperienceManifest(experience),
      name: 'Switches',
      savedAt: '2026-11-17T00:00:00.000Z',
      settings: defaultFourArmyCpuSettings(),
      view: 'army4',
      speed: 1,
      archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, commands, state: s } },
    };
    const text = value(serializeFourArmySpectatorSave(save)),
      loaded = value(parseFourArmySpectatorSave(text));
    expect(loaded).toEqual(save);
    const o = value(observeFourArmy(s, s.round.order[s.round.index]!)),
      c = chooseFourArmyCpuCommand(o, save.settings[o.viewer], 'four-army-cpu-v6')!;
    expect(applyFourArmyCommand(loaded.archive.payload.state, c)).toEqual(applyFourArmyCommand(s, c));
    for (const change of [{ army: 'army1' }, { from: 'cpu' }, { at: 7 }]) {
      const bad = structuredClone(save);
      Object.assign(bad.controlHistory.events[0]!, change);
      expect(serializeFourArmySpectatorSave(bad).ok).toBe(false);
    }
    const bad = structuredClone(save);
    bad.controllers.army2 = 'human';
    expect(serializeFourArmySpectatorSave(bad).ok).toBe(false);
  });
});
