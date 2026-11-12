import { describe, expect, it, vi } from 'vitest';
import * as decisions from './fourArmyCpu';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings, isFourArmyCpuOptions, isFourArmyCpuSettings, isObservedFourArmyCommand } from './fourArmyCpu';
import { fourArmyPlanningView, isFourArmyObservation } from './fourArmyObservation';
import { handleFourArmyCpuRequest, isFourArmyCpuRequest, isFourArmyCpuTicket, type FourArmyCpuRequest } from './fourArmyCpuProtocol';
import { fourCpuMap, fourCpuUnit } from './fourArmyCpu.fixture';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyState } from '../game/fourArmyEngine';
import { FOUR_ARMY_IDS } from '../game/fourArmyFoundation';
import { serializeFourArmyArchive, parseFourArmyArchive } from '../game/fourArmyArchive';
import type { GameResult } from '../game/types';

const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const options = { difficulty: 'normal', policy: 'balanced' } as const;
const observe = (s: FourArmyState) => value(observeFourArmy(s, s.round.order[s.round.index]!));
const request = (): FourArmyCpuRequest => {
  const observation = observe(value(createFourArmyState(fourCpuMap())));
  return { protocol: 1, id: 1, generation: 1, turn: { actor: observation.viewer, round: observation.round.round, index: observation.round.index }, observation, options };
};
const permutations = <T>(a: readonly T[]): T[][] => (a.length ? a.flatMap((v, i) => permutations(a.filter((_, j) => i !== j)).map((r) => [v, ...r])) : [[]]);

describe('multiple-enemy CPU', () => {
  it.each(['army2', 'army3', 'army4'] as const)('attacks a visible %s unit and keeps the other armies distinct', (target) => {
    const map = fourCpuMap();
    map.units[0] = fourCpuUnit('attacker', 'army1', { x: 3, y: 3 }, 'tank');
    const enemy = map.units.find((u) => u.owner === target)!;
    enemy.position = { x: 4, y: 3 };
    enemy.hp = 1;
    const state = value(createFourArmyState(map)),
      o = observe(state),
      before = structuredClone(o);
    const command = chooseFourArmyCpuCommand(o, options)!;
    expect(command).toMatchObject({ actor: 'army1', type: 'attack', targetId: enemy.id });
    expect(value(applyFourArmyCommand(state, command)).alive.includes(target)).toBe(false);
    expect(o).toEqual(before);
    expect(chooseFourArmyCpuCommand(o, options)).toEqual(command);
  });
  it('does not change a decision when hidden positions, funds, cargo or RNG change', () => {
    const map = fourCpuMap();
    const a = value(createFourArmyState(map));
    const b = structuredClone(a);
    b.players.army2.gold = 999999;
    b.rngSeed = 1234;
    b.units[1]!.position = { x: 6, y: 2 };
    b.units[1]!.hp = 12;
    b.units[1]!.fuel = 0;
    const carrier = fourCpuUnit('hidden-carrier', 'army3', { x: 6, y: 5 }, 'apc');
    const cargo = fourCpuUnit('hidden-cargo', 'army3', { x: 5, y: 5 });
    delete cargo.position;
    cargo.embarkedIn = carrier.id;
    b.units.push(carrier, cargo);
    b.board.terrain[0]![7]!.capturePoints = 7;
    expect(observe(a)).toEqual(observe(b));
    expect(observe(b).board.terrain[0]![7]!.capturePoints).toBe(20);
    expect(chooseFourArmyCpuCommand(observe(a), options)).toEqual(chooseFourArmyCpuCommand(observe(b), options));
    expect(fourArmyPlanningView(observe(b)).players.blue.gold).toBe(0);
    expect(fourArmyPlanningView(observe(b)).rngSeed).toBe(0);
  });
  it.each(['easy', 'normal', 'hard'] as const)('finishes controlled %s matches in all 24 hand orders and resumes from verified JSON', (difficulty) => {
    for (const order of permutations(FOUR_ARMY_IDS)) {
      const map = fourCpuMap();
      map.order = order;
      map.board = {
        width: 2,
        height: 2,
        terrain: [
          [
            { kind: 'capital', owner: 'army1' },
            { kind: 'capital', owner: 'army2' },
          ],
          [
            { kind: 'capital', owner: 'army4' },
            { kind: 'capital', owner: 'army3' },
          ],
        ],
      };
      map.capitals = { army1: { x: 0, y: 0 }, army2: { x: 1, y: 0 }, army3: { x: 1, y: 1 }, army4: { x: 0, y: 1 } };
      map.units = FOUR_ARMY_IDS.map((a, i) => ({ ...fourCpuUnit(`u${i + 1}`, a, map.capitals[a]), hp: i === 0 ? 100 : 1 }));
      let state = value(createFourArmyState(map));
      const commands = [];
      for (let i = 0; i < 64 && state.outcome.type === 'ongoing'; i++) {
        const command = chooseFourArmyCpuCommand(observe(state), { difficulty, policy: 'balanced' })!;
        state = value(applyFourArmyCommand(state, command));
        commands.push(command);
      }
      expect(state.outcome.type).toBe('victory');
      expect(chooseFourArmyCpuCommand(observe(state), { difficulty, policy: 'balanced' })).toBeUndefined();
      expect(value(parseFourArmyArchive(value(serializeFourArmyArchive(map, commands, state)))).payload.state).toEqual(state);
    }
  });
  it.each(['balanced', 'offensive', 'defensive'] as const)('makes legal deterministic %s decisions with a mixed roster', (policy) => {
    const map = fourCpuMap();
    map.players.army1.gold = 50000;
    map.board.terrain[2]![1] = { kind: 'factory', owner: 'army1' };
    map.board.terrain[2]![2] = { kind: 'airport', owner: 'army1' };
    map.board.terrain[2]![3] = { kind: 'port', owner: 'army1' };
    map.units.push(
      fourCpuUnit('tank', 'army1', { x: 2, y: 1 }, 'tank'),
      fourCpuUnit('rocket', 'army1', { x: 1, y: 3 }, 'rocket'),
      fourCpuUnit('supply', 'army1', { x: 2, y: 3 }, 'apc'),
      fourCpuUnit('air', 'army2', { x: 4, y: 1 }, 'fighter'),
    );
    let state = value(createFourArmyState(map));
    for (let i = 0; i < 36 && state.outcome.type === 'ongoing'; i++) {
      const o = observe(state);
      const command = chooseFourArmyCpuCommand(o, { difficulty: i % 2 ? 'hard' : 'easy', policy })!;
      expect(isObservedFourArmyCommand(o, command)).toBe(true);
      const next = applyFourArmyCommand(state, command);
      if (next.ok) state = next.value;
      else state = value(applyFourArmyCommand(state, { actor: o.viewer, type: 'endTurn' }));
    }
  });
  it('captures hostile facilities, waits for paid repair and approaches service when damaged', () => {
    const m = fourCpuMap();
    m.units[0]!.position = { x: 7, y: 0 };
    let s = value(createFourArmyState(m));
    expect(chooseFourArmyCpuCommand(observe(s), options)).toMatchObject({ type: 'capture' });
    const heal = fourCpuMap();
    heal.units[0]!.position = { x: 0, y: 0 };
    heal.units[0]!.hp = 30;
    s = value(createFourArmyState(heal));
    expect(chooseFourArmyCpuCommand(observe(s), { difficulty: 'hard', policy: 'defensive' })).toMatchObject({ type: 'wait' });
    const retreat = fourCpuMap();
    retreat.units[0]!.hp = 20;
    retreat.units[0]!.fuel = 2;
    s = value(createFourArmyState(retreat));
    expect(chooseFourArmyCpuCommand(observe(s), options)).toMatchObject({ type: 'move', destination: { x: 0, y: 0 } });
  });
  it('uses compatible factories/airports/ports, respects funds and difficulty force caps', () => {
    for (const kind of ['factory', 'airport', 'port'] as const) {
      const m = fourCpuMap();
      m.board.terrain[2]![1] = { kind, owner: 'army1' };
      m.players.army1.gold = 50000;
      const s = value(createFourArmyState(m));
      s.units[0]!.hasActed = true;
      const c = chooseFourArmyCpuCommand(observe(s), options)!;
      expect(c.type).toBe('produce');
      expect(applyFourArmyCommand(s, c).ok).toBe(true);
      s.players.army1.gold = 0;
      expect(chooseFourArmyCpuCommand(observe(s), options)).toMatchObject({ type: 'endTurn' });
    }
    const m = fourCpuMap();
    m.board.terrain[1]![1] = { kind: 'factory', owner: 'army1' };
    m.players.army1.gold = 50000;
    const s = value(createFourArmyState(m));
    s.units[0]!.hasActed = true;
    expect(chooseFourArmyCpuCommand(observe(s), options)).toMatchObject({ type: 'endTurn' });
    const capped = fourCpuMap();
    capped.players.army1.gold = 50000;
    capped.board.terrain[2]![1] = { kind: 'factory', owner: 'army1' };
    for (let x = 0; x < 7; x++) capped.units.push(fourCpuUnit(`reserve${x}`, 'army1', { x, y: 3 }));
    const full = value(createFourArmyState(capped));
    full.units.filter((u) => u.owner === 'army1').forEach((u) => (u.hasActed = true));
    expect(chooseFourArmyCpuCommand(observe(full), { ...options, difficulty: 'easy' })).toMatchObject({ type: 'endTurn' });
    expect(chooseFourArmyCpuCommand(observe(full), options)).toMatchObject({ type: 'produce' });
  });
  it('prioritises finite supply and visible anti-air needs without reading enemy stock', () => {
    const m = fourCpuMap();
    m.players.army1.gold = 30000;
    m.board.terrain[2]![1] = { kind: 'factory', owner: 'army1' };
    const s = value(createFourArmyState(m));
    s.units[0]!.hasActed = true;
    s.units[0]!.fuel = 0;
    expect(chooseFourArmyCpuCommand(observe(s), options)).toMatchObject({ type: 'produce', kind: 'apc' });
    s.units[0]!.fuel = 99;
    s.units.push(fourCpuUnit('enemy-air', 'army2', { x: 3, y: 1 }, 'fighter'));
    expect(chooseFourArmyCpuCommand(observe(s), options)).toMatchObject({ type: 'produce', kind: 'antiAir' });
  });
  it('boards distant infantry, unloads near an objective and routes naval cargo toward a reachable shore', () => {
    const m = fourCpuMap();
    m.units.push(fourCpuUnit('carrier', 'army1', { x: 2, y: 1 }, 'apc'));
    let s = value(createFourArmyState(m));
    expect(chooseFourArmyCpuCommand(observe(s), options)).toMatchObject({ type: 'embark' });
    const u = fourCpuMap();
    u.units[0]!.position = undefined;
    u.units[0]!.embarkedIn = 'carrier';
    u.units.push(fourCpuUnit('carrier', 'army1', { x: 6, y: 0 }, 'apc'));
    s = value(createFourArmyState(u));
    expect(chooseFourArmyCpuCommand(observe(s), options)).toMatchObject({ type: 'disembark' });
    const sea = fourCpuMap();
    for (let y = 3; y <= 4; y++) for (let x = 0; x < 8; x++) sea.board.terrain[y]![x] = { kind: 'sea' };
    sea.units[0]!.position = undefined;
    sea.units[0]!.embarkedIn = 'ship';
    sea.units.push(fourCpuUnit('ship', 'army1', { x: 1, y: 3 }, 'landingShip'));
    s = value(createFourArmyState(sea));
    const command = chooseFourArmyCpuCommand(observe(s), options)!;
    expect(command.type).toBe('move');
    expect(applyFourArmyCommand(s, command).ok).toBe(true);
    const air = fourCpuMap();
    air.units[0]!.position = undefined;
    air.units[0]!.embarkedIn = 'transport';
    air.units.push(fourCpuUnit('transport', 'army1', { x: 3, y: 3 }, 'transportHelicopter'));
    s = value(createFourArmyState(air));
    expect(applyFourArmyCommand(s, chooseFourArmyCpuCommand(observe(s), options)).ok).toBe(true);
  });
  it('does not act for another army or a pending turn and rejects out-of-contract commands', () => {
    const s = value(createFourArmyState(fourCpuMap())),
      o = observe(s);
    expect(chooseFourArmyCpuCommand(value(observeFourArmy(s, 'army2')), options)).toBeUndefined();
    expect(isObservedFourArmyCommand(value(observeFourArmy(s, 'army2')), { actor: 'army2', type: 'endTurn' })).toBe(false);
    expect(isObservedFourArmyCommand({ ...o, round: { ...o.round, phase: 'pending' } }, { actor: 'army1', type: 'endTurn' })).toBe(false);
    expect(chooseFourArmyCpuCommand({ ...o, round: { ...o.round, phase: 'pending' } }, options)).toBeUndefined();
    for (const c of [
      null,
      { actor: 'army2', type: 'endTurn' },
      { actor: 'army1', type: 'resume' },
      { actor: 'army1', type: 'attack', unitId: 'u1', targetId: 'u1' },
      { actor: 'army1', type: 'produce', factory: { x: 0, y: 0 }, kind: 'fighter' },
    ])
      expect(isObservedFourArmyCommand(o, c)).toBe(false);
    expect(
      chooseFourArmyCpuCommand(
        {
          ...o,
          board: { ...o.board, terrain: o.board.terrain.map((row) => row.map((t) => ({ ...t, owner: undefined }))) },
          outcome: { type: 'draw' },
          alive: [],
          units: [],
          visible: [],
        },
        options,
      ),
    ).toBeUndefined();
  });
});

describe('observation and Worker protocol boundaries', () => {
  it('rejects malformed observations without accepting hidden or unredacted enemy data', () => {
    const o = request().observation;
    const mutations: ((v: any) => void)[] = [
      (v) => (v.extra = 1),
      (v) => (v.viewer = 'red'),
      (v) => (v.board = null),
      (v) => (v.board.extra = 1),
      (v) => (v.board.width = 33),
      (v) => (v.board.height = 0),
      (v) => (v.board.terrain = []),
      (v) => (v.board.terrain[0] = null),
      (v) => (v.board.terrain[0][0] = { kind: 'mystery' }),
      (v) => (v.board.terrain[0][0].owner = 'army5'),
      (v) => (v.board.terrain[1][1].owner = 'army1'),
      (v) => (v.capitals = null),
      (v) => (v.capitals.army1 = { x: 99, y: 0 }),
      (v) => (v.capitals.army2 = v.capitals.army1),
      (v) => (v.capitals.extra = { x: 2, y: 2 }),
      (v) => (v.player = null),
      (v) => (v.player.extra = 1),
      (v) => (v.player.gold = -1),
      (v) => (v.player.income = 1e10),
      (v) => (v.round.phase = 'unknown'),
      (v) => (v.round.round = 1e8),
      (v) => (v.alive = ['army1', 'army1']),
      (v) => (v.alive = ['army5']),
      (v) => (v.alive = []),
      (v) => (v.outcome = null),
      (v) => (v.outcome = { type: 'unknown' }),
      (v) => (v.outcome = { type: 'draw' }),
      (v) => (v.outcome = { type: 'victory', winner: 'army1' }),
      (v) => (v.units = null),
      (v) => (v.units = Array(129).fill(v.units[0])),
      (v) => v.units.push(null),
      (v) => (v.units[0].id = ''),
      (v) => (v.units[0].hp = 0),
      (v) => (v.units[0].fuel = 9999),
      (v) => (v.units[0].position = { x: 99, y: 1 }),
      (v) => (v.units[0].logistics = {}),
      (v) => (v.units[0].embarkedIn = 'missing'),
      (v) => (v.units[0].id = 'u999999999999999999999'),
      (v) => (v.visible = []),
      (v) => v.visible.push(v.visible[0]),
      (v) => v.visible.push({ x: 7, y: 7 }),
      (v) => (v.visible[0] = { x: -1, y: 0 }),
      (v) => (v.board.terrain[0][7].capturePoints = 10),
    ];
    expect(isFourArmyObservation(o)).toBe(true);
    for (const mutate of mutations) {
      const bad = structuredClone(o);
      mutate(bad);
      expect(isFourArmyObservation(bad)).toBe(false);
      expect(() => chooseFourArmyCpuCommand(bad, options)).toThrow('Invalid');
    }
    const m = fourCpuMap();
    m.units[1]!.position = { x: 2, y: 1 };
    const seen = observe(value(createFourArmyState(m)));
    expect(isFourArmyObservation(seen)).toBe(true);
    for (const mutate of [
      (v: any) => (v.units[1].fuel = 1),
      (v: any) => (v.units[1].ammo = 0),
      (v: any) => (v.units[1].hasMoved = true),
      (v: any) => (v.units[1].supplyStock = 1),
      (v: any) => (v.units[1].position = { x: 7, y: 6 }),
      (v: any) => (v.units[1].owner = 'army5'),
    ]) {
      const bad = structuredClone(seen);
      mutate(bad);
      expect(isFourArmyObservation(bad)).toBe(false);
    }
  });
  it('validates settings and request identity without coercing hostile JSON', () => {
    expect(isFourArmyCpuSettings(defaultFourArmyCpuSettings())).toBe(true);
    for (const v of [null, {}, { ...defaultFourArmyCpuSettings(), extra: options }, { ...defaultFourArmyCpuSettings(), army4: { difficulty: 'expert', policy: 'balanced' } }])
      expect(isFourArmyCpuSettings(v)).toBe(false);
    for (const v of [null, {}, { difficulty: { toString: 'normal' }, policy: 'balanced' }, { difficulty: 'normal', policy: 'invalid' }, { ...options, extra: 1 }]) {
      expect(isFourArmyCpuOptions(v)).toBe(false);
      expect(() => chooseFourArmyCpuCommand(request().observation, v)).toThrow('Invalid');
    }
    const r = request();
    expect(isFourArmyCpuRequest(r)).toBe(true);
    expect(handleFourArmyCpuRequest(r)).toMatchObject({ id: 1, generation: 1, kind: 'command', turn: r.turn });
    for (const mutate of [
      (v: any) => (v.protocol = 2),
      (v: any) => (v.id = '1'),
      (v: any) => (v.generation = 0),
      (v: any) => (v.turn = null),
      (v: any) => (v.turn.actor = 'red'),
      (v: any) => (v.turn.round = 0),
      (v: any) => (v.turn.index = 4),
      (v: any) => (v.turn.extra = 1),
      (v: any) => (v.extra = 1),
      (v: any) => (v.options = null),
      (v: any) => (v.observation = {}),
      (v: any) => (v.turn.round = 2),
      (v: any) => (v.turn.actor = 'army2'),
      (v: any) => (v.turn.index = 1),
      (v: any) => (v.observation.round.phase = 'pending'),
    ]) {
      const bad = structuredClone(r);
      mutate(bad);
      expect(isFourArmyCpuRequest(bad)).toBe(false);
      expect(handleFourArmyCpuRequest(bad)).toBeUndefined();
    }
    expect(isFourArmyCpuTicket(null)).toBe(false);
  });
  it('does not leak internal exceptions when decision computation fails unexpectedly', () => {
    const r = request();
    const spy = vi
      .spyOn(decisions, 'chooseFourArmyCpuCommand')
      .mockImplementationOnce(() => {
        throw Error('private data');
      })
      .mockReturnValueOnce(undefined);
    expect(handleFourArmyCpuRequest(r)).toMatchObject({ kind: 'error', error: 'CPU planning failed' });
    expect(handleFourArmyCpuRequest(r)).toMatchObject({ kind: 'error', error: 'CPU planning failed' });
    spy.mockRestore();
  });
});
