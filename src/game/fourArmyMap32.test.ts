import { describe, expect, it } from 'vitest';
import { createFourArmyMap32, FOUR_ARMY_MAP32_ID, FOUR_ARMY_MAP32_UNIT_LIMIT, rotateFourArmy32 } from './fourArmyMap32';
import { applyFourArmyCommand, createFourArmyState, isFourArmyState, observeFourArmy, type FourArmyCommand } from './fourArmyEngine';
import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { inFourArmyStartZone } from './fourArmySetup';
import { parseFourArmyArchive, serializeFourArmyArchive } from './fourArmyArchive';
import { fourArmyCapacityFixture } from '../../tests/e2e/helpers/fourArmyMapProbe';
import { chooseFourArmyCpuCommand, isObservedFourArmyCommand } from '../ai/fourArmyCpu';
import { isFourArmyObservation, fourArmyPlanningView } from '../ai/fourArmyObservation';
import { fourCpuMap } from '../ai/fourArmyCpu.fixture';
import { parseSavedGame } from './session';
import { parseReplay } from './replay';
import { parseResearch } from './research';
import { movementCost } from './terrain';
import { SUPPLY_CAPACITY } from './supplyStock';
import type { GameResult } from './types';

const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const options = { difficulty: 'hard', policy: 'balanced' } as const;
const permutations = <T>(a: readonly T[]): T[][] => (a.length ? a.flatMap((v, i) => permutations(a.filter((_, j) => i !== j)).map((r) => [v, ...r])) : [[]]);

describe('dedicated four-army 32 board', () => {
  it('creates fresh fixed snapshots with the same initial roster, stock, facilities and economy for every army', () => {
    const map = value(createFourArmyMap32());
    expect(map.id).toBe(FOUR_ARMY_MAP32_ID);
    expect(map.board.width).toBe(32);
    expect(map.board.height).toBe(32);
    expect(map.setup!.unitLimitPerArmy).toBe(FOUR_ARMY_MAP32_UNIT_LIMIT);
    expect(map.units).toHaveLength(32);
    for (const a of FOUR_ARMY_IDS) {
      const own = map.units.filter((u) => u.owner === a);
      expect(own).toHaveLength(8);
      expect(own.map((u) => u.kind)).toEqual(['infantry', 'infantry', 'infantry', 'recon', 'tank', 'artillery', 'apc', 'antiAir']);
      expect(own.every((u) => u.hp === 100 && !u.hasActed && !u.hasMoved && inFourArmyStartZone(u.position!, map.setup!.startZones[a]))).toBe(true);
      expect(own.find((u) => u.kind === 'apc')!.supplyStock).toBe(SUPPLY_CAPACITY);
      expect(own.find((u) => u.kind === 'tank')!.secondaryAmmo).toBe(6);
      expect(map.players[a]).toEqual({ gold: 10000, income: 0 });
      expect(
        map.board.terrain
          .flat()
          .filter((t) => t.owner === a)
          .map((t) => t.kind)
          .sort(),
      ).toEqual(['airport', 'capital', 'city', 'city', 'factory']);
    }
    expect(new Set(map.units.map((u) => u.id)).size).toBe(32);
    const before = value(createFourArmyMap32());
    map.setup!.startZones.army1.x = 9;
    map.units[0]!.hp = 1;
    map.board.terrain[0]![0]!.kind = 'sea';
    expect(value(createFourArmyMap32())).toEqual(before);
  });
  it('rotates every terrain, owner, capital and starting unit through all four equal sectors', () => {
    const m = value(createFourArmyMap32());
    for (let i = 0; i < 4; i++) {
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const p = rotateFourArmy32({ x, y }, i),
            original = m.board.terrain[y]![x]!,
            rotated = m.board.terrain[p.y]![p.x]!;
          expect(rotated).toEqual({ ...original, ...(original.owner ? { owner: FOUR_ARMY_IDS[(FOUR_ARMY_IDS.indexOf(original.owner) + i) % 4] } : {}) });
        }
      expect(m.capitals[FOUR_ARMY_IDS[i]!]).toEqual(rotateFourArmy32(m.capitals.army1, i));
      m.units.filter((u) => u.owner === 'army1').forEach((u, j) => expect(m.units[i * 8 + j]!.position).toEqual(rotateFourArmy32(u.position!, i)));
    }
    expect(m.board.terrain.flat().filter((t) => !t.owner && t.kind === 'factory')).toHaveLength(4);
    expect(m.board.terrain.flat().filter((t) => !t.owner && t.kind === 'city')).toHaveLength(4);
  });
  it('has ground routes from every start to every capital and neutral objective', () => {
    const m = value(createFourArmyMap32()),
      state = value(createFourArmyState(m));
    const board = fourArmyPlanningView(value(observeFourArmy(state, 'army1'))).board;
    for (const u of m.units) {
      const seen = new Set<string>(),
        pending = [u.position!];
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i]!,
          k = `${p.x},${p.y}`;
        if (seen.has(k)) continue;
        seen.add(k);
        for (const q of [
          { x: p.x - 1, y: p.y },
          { x: p.x + 1, y: p.y },
          { x: p.x, y: p.y - 1 },
          { x: p.x, y: p.y + 1 },
        ])
          if (q.x >= 0 && q.y >= 0 && q.x < 32 && q.y < 32 && !seen.has(`${q.x},${q.y}`) && Number.isFinite(movementCost(board, q, u.kind))) pending.push(q);
      }
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (['capital', 'city', 'factory'].includes(board.terrain[y]![x]!.kind)) expect(seen.has(`${x},${y}`)).toBe(true);
    }
  });
  it('applies identical opening income once in all 24 hand orders and keeps setup immutable', () => {
    for (const order of permutations(FOUR_ARMY_IDS)) {
      const m = value(createFourArmyMap32(42, order));
      let s = value(createFourArmyState(m));
      for (const actor of order) {
        expect(s.round.order[s.round.index]).toBe(actor);
        expect(s.players[actor]).toEqual({ gold: 15000, income: 5000 });
        expect(s.setup).toEqual(m.setup);
        s = value(applyFourArmyCommand(s, { actor, type: 'endTurn' }));
      }
      expect(s.players[order[0]!]!.gold).toBe(20000);
      expect(s.round.round).toBe(2);
    }
  });
  it('rejects invalid seeds and hand orders without changing a snapshot', () => {
    for (const seed of [-1, 0x100000000, NaN, 1.5]) expect(createFourArmyMap32(seed).ok).toBe(false);
    expect(createFourArmyMap32(0).ok).toBe(true);
    expect(createFourArmyMap32(0xffffffff).ok).toBe(true);
    expect(createFourArmyMap32(1, ['army1', 'army1', 'army3', 'army4']).ok).toBe(false);
  });
  it('rejects malformed setup, overlapping or out-of-board zones and capitals outside their zone', () => {
    const m = value(createFourArmyMap32()),
      s = value(createFourArmyState(m));
    const mutations: ((v: any) => void)[] = [
      (v) => (v.setup = null),
      (v) => (v.setup.version = 2),
      (v) => (v.setup.extra = 1),
      (v) => (v.setup.unitLimitPerArmy = 3),
      (v) => (v.setup.unitLimitPerArmy = 33),
      (v) => (v.setup.unitLimitPerArmy = 4.5),
      (v) => (v.setup.startZones = null),
      (v) => delete v.setup.startZones.army4,
      (v) => (v.setup.startZones.army1.extra = 1),
      (v) => (v.setup.startZones.army1.x = -1),
      (v) => (v.setup.startZones.army1.width = 0),
      (v) => (v.setup.startZones.army1.height = 33),
      (v) => (v.setup.startZones.army1.width = 32),
      (v) => (v.setup.startZones.army1.x = 4),
      (v) => (v.setup.startZones.army1.width = 25),
    ];
    for (const mutate of mutations) {
      const bad = structuredClone(m);
      mutate(bad);
      expect(createFourArmyState(bad).ok).toBe(false);
      const badState = structuredClone(s);
      mutate(badState);
      expect(isFourArmyState(badState)).toBe(false);
    }
    const overlap = structuredClone(m);
    overlap.setup!.startZones.army1.width = 30;
    expect(createFourArmyState(overlap).ok).toBe(false);
    const wrong = structuredClone(s);
    wrong.engineVersion = 1;
    expect(isFourArmyState(wrong)).toBe(false);
    const missing = structuredClone(s);
    delete missing.setup;
    expect(isFourArmyState(missing)).toBe(false);
  });
  it('enforces zones only at deployment, including the carrier of embarked units', () => {
    const m = value(createFourArmyMap32());
    m.units[0]!.position = { x: 15, y: 15 };
    expect(createFourArmyState(m).ok).toBe(false);
    const state = value(createFourArmyState(value(createFourArmyMap32())));
    state.units[0]!.position = { x: 15, y: 15 };
    expect(isFourArmyState(state)).toBe(true);
    expect(applyFourArmyCommand(state, { actor: 'army1', type: 'wait', unitId: 'u1' }).ok).toBe(true);
    const carried = value(createFourArmyMap32());
    delete carried.units[2]!.position;
    carried.units[2]!.embarkedIn = 'u7';
    expect(createFourArmyState(carried).ok).toBe(true);
    carried.units[6]!.position = { x: 15, y: 15 };
    expect(createFourArmyState(carried).ok).toBe(false);
  });
});

describe('four-army production ceiling and archive version', () => {
  it.each(FOUR_ARMY_IDS)('blocks the 17th %s unit in the engine and observed CPU command validation', (actor) => {
    const { map } = fourArmyCapacityFixture(16, false, actor);
    const removed = map.units.filter((u) => u.owner === actor).at(-1)!;
    map.units = map.units.filter((u) => u.id !== removed.id);
    const s = value(createFourArmyState(map));
    s.players[actor].gold = 50000;
    const factory = map.board.terrain.flatMap((row, y) => row.flatMap((t, x) => (t.owner === actor && t.kind === 'factory' ? [{ x, y }] : [])))[0]!;
    const command: FourArmyCommand = { actor, type: 'produce', factory, kind: 'infantry' };
    expect(isObservedFourArmyCommand(value(observeFourArmy(s, actor)), command)).toBe(true);
    const full = value(applyFourArmyCommand(s, command)),
      before = structuredClone(full);
    expect(full.units.filter((u) => u.owner === actor)).toHaveLength(16);
    expect(isObservedFourArmyCommand(value(observeFourArmy(full, actor)), command)).toBe(false);
    expect(applyFourArmyCommand(full, command).ok).toBe(false);
    expect(full).toEqual(before);
    full.units.filter((u) => u.owner === actor).forEach((u) => (u.hasActed = true));
    expect(chooseFourArmyCpuCommand(value(observeFourArmy(full, actor)), options)).toMatchObject({ type: 'endTurn' });
    const forged = structuredClone(full);
    forged.units.push({ ...removed });
    expect(isFourArmyState(forged)).toBe(false);
    const badMap = structuredClone(map);
    badMap.units.push({ ...removed }, { ...removed, id: 'overflow', position: { x: 9, y: 2 } });
    expect(createFourArmyState(badMap).ok).toBe(false);
  });
  it('counts embarked infantry toward the ceiling and frees a slot after a merge', () => {
    const { state: s } = fourArmyCapacityFixture(16);
    const packed = value(applyFourArmyCommand(s, { actor: 'army1', type: 'embark', unitId: 'u3', transportId: 'u7' }));
    expect(packed.units.filter((u) => u.owner === 'army1' && u.position)).toHaveLength(15);
    expect(applyFourArmyCommand(packed, { actor: 'army1', type: 'produce', factory: { x: 5, y: 3 }, kind: 'infantry' }).ok).toBe(false);
    s.units.find((u) => u.id === 'u1')!.hp = 50;
    s.units.find((u) => u.id === 'u2')!.hp = 50;
    const merged = value(applyFourArmyCommand(s, { actor: 'army1', type: 'merge', unitId: 'u1', targetId: 'u2' }));
    expect(merged.units.filter((u) => u.owner === 'army1')).toHaveLength(15);
    expect(
      value(applyFourArmyCommand(merged, { actor: 'army1', type: 'produce', factory: { x: 5, y: 3 }, kind: 'infantry' })).units.filter((u) => u.owner === 'army1'),
    ).toHaveLength(16);
  });
  it('rejects invalid observed caps and observable overflows without accepting hidden data', () => {
    const { state } = fourArmyCapacityFixture(16),
      o = value(observeFourArmy(state, 'army1'));
    expect(isFourArmyObservation(o)).toBe(true);
    for (const cap of [null, 3, 33, 4.2, '16', undefined]) expect(isFourArmyObservation({ ...o, unitLimitPerArmy: cap })).toBe(false);
    expect(isFourArmyObservation({ ...o, unitLimitPerArmy: 8 })).toBe(false);
  });
  it('keeps pre-v2 maps and archives on their exact legacy path', () => {
    const m = fourCpuMap(),
      s = value(createFourArmyState(m));
    expect(s.engineVersion).toBe(1);
    expect(s).not.toHaveProperty('setup');
    expect(value(observeFourArmy(s, 'army1'))).not.toHaveProperty('unitLimitPerArmy');
    const text = value(serializeFourArmyArchive(m, [], s)),
      parsed = value(parseFourArmyArchive(text));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.ruleset).toBe('four-army-v1');
    expect(parsed.payload.state).toEqual(s);
    const { map } = fourArmyCapacityFixture(17);
    delete map.setup;
    expect(value(createFourArmyState(map)).engineVersion).toBe(1);
  });
  it('replays v2 with immutable setup and rejects envelope downgrades, state or map cap tampering', () => {
    const m = value(createFourArmyMap32());
    let s = value(createFourArmyState(m));
    const commands: FourArmyCommand[] = [];
    for (let i = 0; i < 8; i++) {
      const command: FourArmyCommand = { actor: s.round.order[s.round.index]!, type: 'endTurn' };
      s = value(applyFourArmyCommand(s, command));
      commands.push(command);
    }
    const text = value(serializeFourArmyArchive(m, commands, s)),
      parsed = value(parseFourArmyArchive(text));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.ruleset).toBe('four-army-v2');
    expect(parsed.payload.state).toEqual(s);
    expect(parseSavedGame(text).ok).toBe(false);
    expect(parseReplay(text).ok).toBe(false);
    expect(parseResearch(text).ok).toBe(false);
    for (const mutate of [
      (v: any) => (v.schemaVersion = 1),
      (v: any) => (v.ruleset = 'four-army-v1'),
      (v: any) => (v.payload.state.setup.unitLimitPerArmy = 12),
      (v: any) => (v.payload.map.setup.unitLimitPerArmy = 12),
    ]) {
      const bad = JSON.parse(text);
      mutate(bad);
      expect(parseFourArmyArchive(JSON.stringify(bad)).ok).toBe(false);
    }
  });
  it.each([42, 1512])('runs legal CPU steps on the real map and resumes verified history for seed %s', (seed) => {
    const m = value(createFourArmyMap32(seed));
    let s = value(createFourArmyState(m));
    const commands: FourArmyCommand[] = [];
    for (let i = 0; i < 40; i++) {
      const o = value(observeFourArmy(s, s.round.order[s.round.index]!)),
        command = chooseFourArmyCpuCommand(o, options)!;
      expect(isObservedFourArmyCommand(o, command)).toBe(true);
      s = value(applyFourArmyCommand(s, command));
      commands.push(command);
    }
    expect(value(parseFourArmyArchive(value(serializeFourArmyArchive(m, commands, s)))).payload.state).toEqual(s);
  });
});
