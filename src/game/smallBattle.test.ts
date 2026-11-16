import { smallBattleFocus } from '../ai/fourArmyCpuOrder';
import { describe, expect, it } from 'vitest';
import { createSmallBattleMap } from './smallBattleMap';
import { createFourArmyMap32 } from './fourArmyMap32';
import { applyFourArmyCommand, createFourArmyState, isFourArmyState, observeFourArmy, type FourArmyState } from './fourArmyEngine';
import { isFourArmyObservation } from '../ai/fourArmyObservation';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings } from '../ai/fourArmyCpu';
import { fourArmyParticipants, isSmallBattle, smallBattleDecision, smallBattlePositionRank, smallBattleStandings } from './smallBattle';
import { fourArmyControllers } from './fourArmyControl';
import { serializeFourArmySpectatorSave, parseFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import { initialFourArmyExperience, fourArmyExperienceManifest } from './fourArmyExperience';
import type { GameResult } from './types';
const value = <T>(v: GameResult<T>): T => {
  if (!v.ok) throw Error(v.error);
  return v.value;
};
const make = (n: 3 | 4 = 3, ending: 'short' | 'unlimited' = 'short') =>
  value(createFourArmyState(value(createSmallBattleMap(n, 1521, undefined, ending, { version: 1, tactics: true }))));
const finish = (s: FourArmyState) => value(applyFourArmyCommand(s, { actor: s.round.order[s.round.index]!, type: 'endTurn' }));
describe('compact multi-army rules and compatibility', () => {
  it.each([3, 4] as const)('creates a real %i-army roster and restricted observations', (n) => {
    const s = make(n);
    expect(s.board).toMatchObject({ width: 18, height: 14 });
    expect(s.engineVersion).toBe(4);
    expect(Object.keys(s.capitals)).toEqual(fourArmyParticipants(s));
    expect(Object.keys(s.players)).toHaveLength(n);
    expect(s.units).toHaveLength(n * 4);
    expect(s.setup?.unitLimitPerArmy).toBe(8);
    expect(s.eliminations).toEqual([]);
    expect(s.board.terrain.flat().filter((t) => t.kind === 'capital')).toHaveLength(n);
    for (const a of fourArmyParticipants(s)) {
      const o = value(observeFourArmy(s, a));
      expect(isFourArmyObservation(o)).toBe(true);
      expect(o).not.toHaveProperty('rngSeed');
      expect(o.units.filter((u) => u.owner === a)).toHaveLength(4);
    }
    if (n === 3) {
      expect(s.players).not.toHaveProperty('army4');
      expect(s.extensions?.recon).not.toHaveProperty('army4');
      expect(observeFourArmy(s, 'army4').ok).toBe(false);
    }
  });
  it('gives every participant its initial income once and wraps after three actual turns', () => {
    let s = make();
    expect(s.players.army1.gold).toBe(9000);
    expect(s.players.army2.gold).toBe(6000);
    s = finish(s);
    expect(s.round).toMatchObject({ round: 1, index: 1 });
    expect(s.players.army2.gold).toBe(9000);
    s = finish(s);
    expect(s.players.army3.gold).toBe(9000);
    s = finish(s);
    expect(s.round).toMatchObject({ round: 2, index: 0 });
    expect(s.players.army1.gold).toBe(12000);
  });
  it.each([3, 4] as const)('decides the complete twentieth round without paying round21 (%i)', (n) => {
    let s = make(n);
    for (let i = 0; i < 20 * n - 1; i++) s = finish(s);
    expect(s.outcome.type).toBe('ongoing');
    s = finish(s);
    expect(s.outcome).toEqual({ type: 'draw' });
    expect(s.decision).toEqual({ round: 20 });
    expect(s.round).toMatchObject({ round: 21, phase: 'pending' });
    for (const a of fourArmyParticipants(s)) expect(s.players[a].gold).toBe(66000);
    expect(isFourArmyState(s)).toBe(true);
    expect(applyFourArmyCommand(s, { actor: 'army1', type: 'endTurn' }).ok).toBe(false);
    expect(isFourArmyObservation(value(observeFourArmy(s, 'army1')))).toBe(true);
  });
  it('ranks surviving properties then HP without using bank balance or army identity', () => {
    const s = make();
    s.units.find((u) => u.owner === 'army1')!.hp = 98;
    s.units.find((u) => u.owner === 'army2')!.hp = 99;
    expect(smallBattleDecision(s)).toEqual({ type: 'victory', winner: 'army3' });
    const neutral = s.board.terrain.flat().find((t) => t.kind === 'factory' && !t.owner)!;
    neutral.owner = 'army1';
    expect(smallBattleDecision(s)).toEqual({ type: 'victory', winner: 'army1' });
    expect(smallBattleStandings(s)[0]?.properties).toBe(4);
    const dead = { ...s, alive: [] };
    expect(smallBattleDecision(dead)).toEqual({ type: 'draw' });
  });
  it('keeps unlimited compact play and the old 32x32 state free of deadlines', () => {
    let s = make(3, 'unlimited');
    for (let i = 0; i < 60; i++) s = finish(s);
    expect(s.outcome.type).toBe('ongoing');
    expect(s).not.toHaveProperty('decision');
    const old = value(createFourArmyState(value(createFourArmyMap32())));
    expect(old.engineVersion).toBe(2);
    expect(old).not.toHaveProperty('match');
    expect(fourArmyParticipants(old)).toHaveLength(4);
  });
  it('pauses unlimited three-army play at100R and resumes its next income once', () => {
    let s = make(3, 'unlimited');
    for (let i = 0; i < 300; i++) s = finish(s);
    expect(s).toMatchObject({ paused: true, round: { round: 101, index: 0, phase: 'pending' } });
    const before = s.players.army1.gold;
    const resumed = value(applyFourArmyCommand(s, { actor: 'army1', type: 'resume' }));
    expect(resumed.players.army1.gold).toBe(before + 3000);
    expect(resumed.paused).toBe(false);
    expect(applyFourArmyCommand(resumed, { actor: 'army1', type: 'resume' }).ok).toBe(false);
  });
  it('rejects extra armies, altered setup, invalid variants and forged deadline markers', () => {
    expect(createSmallBattleMap(2 as 3).ok).toBe(false);
    expect(createSmallBattleMap(3, 1, undefined, 'other' as 'short').ok).toBe(false);
    expect(createSmallBattleMap(3, 1, ['army1', 'army1', 'army3']).ok).toBe(false);
    expect(createSmallBattleMap(3, -1).ok).toBe(false);
    expect(createSmallBattleMap(3, Infinity).ok).toBe(false);
    expect(createSmallBattleMap(3, 0x100000000).ok).toBe(false);
    expect(createSmallBattleMap(3, 1, {} as any).ok).toBe(false);
    expect(createSmallBattleMap(3, 1, undefined, 'short', null as any).ok).toBe(false);
    expect(isSmallBattle(null)).toBe(false);
    expect(isSmallBattle({ ...make().match, roundLimit: 30 })).toBe(false);
    const s = make();
    expect(isFourArmyState({ ...s, decision: { round: 20 } })).toBe(false);
    expect(isFourArmyState({ ...s, players: { ...s.players, army4: { gold: 0, income: 0 } } })).toBe(false);
    expect(isFourArmyState({ ...s, pathVersion: 1 })).toBe(false);
    const map = value(createSmallBattleMap());
    expect(createFourArmyState({ ...map, id: 'unknown' }).ok).toBe(false);
    expect(createFourArmyState({ ...map, board: { ...map.board, width: 17 } }).ok).toBe(false);
    expect(smallBattlePositionRank({ width: 18, height: 14 }, { x: 15, y: 11 }, { x: 17, y: 13 })).toBe(0);
  });
  it('uses CPUv5 only for compact matches, from the actor observation', () => {
    const o = value(observeFourArmy(make(), 'army1'));
    expect(() => chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v4')).toThrow();
    const c = chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v5');
    expect(c?.actor).toBe('army1');
    expect(applyFourArmyCommand(make(), c).ok).toBe(true);
  });
  it.each([3, 4] as const)('enforces the ninth-unit rejection without consuming funds (%i)', (n) => {
    const s = make(n),
      infantry = s.units.find((u) => u.owner === 'army1')!;
    for (let i = 0; i < 4; i++) s.units.push({ ...structuredClone(infantry), id: `u${90 + i}`, position: { x: i, y: 0 } });
    s.nextUnitId = 94;
    expect(isFourArmyState(s)).toBe(true);
    const original = JSON.stringify(s);
    expect(
      applyFourArmyCommand(s, { actor: 'army1', type: 'produce', factory: n === 3 ? { x: 8, y: 0 } : { x: s.capitals.army1.x + 1, y: s.capitals.army1.y }, kind: 'infantry' }).ok,
    ).toBe(false);
    expect(JSON.stringify(s)).toBe(original);
  });
  it('eliminates participating armies only and awards early last-army victory', () => {
    const s = make();
    s.units.find((u) => u.owner === 'army1' && u.kind === 'infantry')!.position = { ...s.capitals.army3 };
    s.board.terrain[s.capitals.army3.y]![s.capitals.army3.x]!.capturePoints = 1;
    const captured = value(applyFourArmyCommand(s, { actor: 'army1', type: 'capture', unitId: 'u1' }));
    expect(captured.alive).toEqual(['army1', 'army2']);
    expect(captured.eliminations).toEqual([{ army: 'army3', round: 1 }]);
    expect(captured.units.some((u) => u.owner === 'army3')).toBe(false);
    expect(captured.outcome.type).toBe('ongoing');
    captured.units.find((u) => u.id === 'u2')!.position = { ...captured.capitals.army2 };
    captured.board.terrain[captured.capitals.army2.y]![captured.capitals.army2.x]!.capturePoints = 1;
    const won = value(applyFourArmyCommand(captured, { actor: 'army1', type: 'capture', unitId: 'u2' }));
    expect(won.outcome).toEqual({ type: 'victory', winner: 'army1' });
    expect(won).not.toHaveProperty('decision');
  });
  it('gives all three facing-equivalent starts identical CPU/path priorities', () => {
    const s = make(),
      keys = fourArmyParticipants(s).map((a) => s.units.filter((u) => u.owner === a).map((u) => smallBattlePositionRank(s.board, s.capitals[a], u.position!, true)));
    expect(keys[0]).toEqual(keys[1]);
    expect(keys[0]).toEqual(keys[2]);
    const homes = Object.values(s.capitals);
    expect(homes.map((p, i) => Math.abs(p.x - homes[(i + 1) % 3]!.x) + Math.abs(p.y - homes[(i + 1) % 3]!.y))).toEqual([12, 12, 12]);
  });
  it('uses one public cyclic opponent per army without forcing combat or changing four-army CPU goals', () => {
    const s = make(),
      choices = fourArmyParticipants(s).map((a) => smallBattleFocus(value(observeFourArmy(s, a))));
    expect(choices).toEqual(['army3', 'army1', 'army2']);
    expect(new Set(choices).size).toBe(3);
    expect(smallBattleFocus(value(observeFourArmy(make(4), 'army1')))).toBeUndefined();
    const o = value(observeFourArmy(s, 'army1'));
    o.alive = ['army1', 'army2'];
    expect(smallBattleFocus(o)).toBeUndefined();
  });
  it('uses observed captures and healthy defended properties in late CPU play', () => {
    const s = make();
    s.round.round = 19;
    s.units[0]!.position = { x: 7, y: 5 };
    let o = value(observeFourArmy(s, 'army1'));
    expect(chooseFourArmyCpuCommand(o, { difficulty: 'hard', policy: 'defensive' }, 'four-army-cpu-v5')).toMatchObject({ type: 'capture', unitId: 'u1' });
    s.board.terrain[5]![7]!.owner = 'army1';
    o = value(observeFourArmy(s, 'army1'));
    expect(applyFourArmyCommand(s, chooseFourArmyCpuCommand(o, { difficulty: 'normal', policy: 'balanced' }, 'four-army-cpu-v5')).ok).toBe(true);
    const unlimited = make(3, 'unlimited');
    expect(chooseFourArmyCpuCommand(value(observeFourArmy(unlimited, 'army1')), { difficulty: 'easy', policy: 'offensive' }, 'four-army-cpu-v5')).toBeDefined();
  });
  it.each([3, 4] as const)('round trips schema5 and rejects modified participant/map/rule snapshots (%i)', (n) => {
    const map = value(createSmallBattleMap(n, 1521, undefined, 'short', { version: 1, tactics: true })),
      state = value(createFourArmyState(map));
    const save: FourArmySpectatorSave = {
      format: 'ministr-four-army-configurable',
      schemaVersion: 5,
      cpuVersion: 'four-army-cpu-v5',
      controllers: fourArmyControllers(['army1']),
      experience: fourArmyExperienceManifest(initialFourArmyExperience(state, 0)),
      name: 'Compact',
      savedAt: '2026-11-16T00:00:00.000Z',
      settings: defaultFourArmyCpuSettings(),
      view: 'army1',
      speed: 1,
      archive: { format: 'ministr-four-army-save', schemaVersion: 4, ruleset: 'four-army-v4', payload: { map, commands: [], state } },
    };
    const text = value(serializeFourArmySpectatorSave(save));
    expect(value(parseFourArmySpectatorSave(text))).toMatchObject({ schemaVersion: 5, archive: { payload: { map } } });
    for (const change of [
      (v: any) => (v.archive.payload.map.match.ending = 'unlimited'),
      (v: any) => (v.archive.payload.map.board.terrain[v.archive.payload.map.capitals.army1.y][v.archive.payload.map.capitals.army1.x].kind = 'plain'),
      (v: any) => (v.cpuVersion = 'four-army-cpu-v4'),
      (v: any) => (v.schemaVersion = 4),
      ...(n === 3 ? [(v: any) => (v.view = 'army4')] : []),
    ]) {
      const v = JSON.parse(text);
      change(v);
      expect(parseFourArmySpectatorSave(JSON.stringify(v)).ok).toBe(false);
    }
  });
});
