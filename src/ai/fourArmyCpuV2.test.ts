import { describe, expect, it } from 'vitest';
import { chooseFourArmyCpuCommand } from './fourArmyCpu';
import { fourCpuMap } from './fourArmyCpu.fixture';
import { FOUR_ARMY_CPU_VERSION } from './fourArmyCpuVersion';
import { createFourArmyState, observeFourArmy, applyFourArmyCommand, type FourArmyCommand } from '../game/fourArmyEngine';
import { createFourArmyMap32, rotateFourArmy32 } from '../game/fourArmyMap32';
import { FOUR_ARMY_IDS } from '../game/fourArmyFoundation';
import type { GameResult } from '../game/types';
import { handleFourArmyCpuRequest, isFourArmyCpuRequest } from './fourArmyCpuProtocol';

const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const options = { difficulty: 'normal', policy: 'balanced' } as const;
describe('four-army CPU v2 bounded fixes', () => {
  it('retains unversioned protocol1 and explicit v1 choices while routing v2 and rejecting unknown versions', () => {
    let state = value(createFourArmyState(value(createFourArmyMap32(15141))));
    for (let i = 0; i < 2; i++) state = value(applyFourArmyCommand(state, chooseFourArmyCpuCommand(value(observeFourArmy(state, 'army1')), options, 'four-army-cpu-v1')));
    const observation = value(observeFourArmy(state, 'army1'));
    const request = { protocol: 1, id: 1, generation: 1, turn: { actor: 'army1', round: state.round.round, index: state.round.index }, observation, options };
    const old = chooseFourArmyCpuCommand(observation, options, 'four-army-cpu-v1'),
      next = chooseFourArmyCpuCommand(observation, options);
    expect(old).toMatchObject({ type: 'move', unitId: 'u4', destination: { x: 11, y: 6 } });
    expect(next).toMatchObject({ type: 'move', unitId: 'u4', destination: { x: 12, y: 5 } });
    expect(handleFourArmyCpuRequest(request)).toMatchObject({ kind: 'command', command: old });
    expect(handleFourArmyCpuRequest({ ...request, cpuVersion: 'four-army-cpu-v1' })).toMatchObject({ kind: 'command', command: old });
    expect(handleFourArmyCpuRequest({ ...request, cpuVersion: FOUR_ARMY_CPU_VERSION })).toMatchObject({ kind: 'command', command: next });
    expect(isFourArmyCpuRequest({ ...request, cpuVersion: 'future' })).toBe(false);
    expect(isFourArmyCpuRequest({ ...request, cpuVersion: undefined })).toBe(false);
  });
  it('finishes observed unit actions before unseen production without probing hidden occupancy', () => {
    const map = fourCpuMap();
    map.players.army1.gold = 30000;
    map.board.terrain[0]![5] = { kind: 'factory', owner: 'army1' };
    map.units[1]!.position = { x: 5, y: 0 };
    const occupied = value(createFourArmyState(map));
    const empty = structuredClone(occupied);
    empty.units[1]!.position = { x: 6, y: 0 };
    const o = value(observeFourArmy(occupied, 'army1'));
    expect(o).toEqual(value(observeFourArmy(empty, 'army1')));
    const old = chooseFourArmyCpuCommand(o, options, 'four-army-cpu-v1')!;
    expect(old).toMatchObject({ type: 'produce', factory: { x: 5, y: 0 }, kind: 'infantry' });
    expect(applyFourArmyCommand(occupied, old).ok).toBe(false);
    expect(applyFourArmyCommand(empty, old).ok).toBe(true);
    const fixed = chooseFourArmyCpuCommand(o, options)!;
    expect(fixed.type).toBe('move');
    expect(applyFourArmyCommand(occupied, fixed).ok).toBe(true);
    expect(chooseFourArmyCpuCommand(value(observeFourArmy(empty, 'army1')), options)).toEqual(fixed);
    // Preserve legitimate fog production once every own action has finished; a rejection can only end that completed turn.
    occupied.units
      .filter((u) => u.owner === 'army1')
      .forEach((u) => {
        u.hasMoved = true;
        u.hasActed = true;
      });
    expect(chooseFourArmyCpuCommand(value(observeFourArmy(occupied, 'army1')), options)).toEqual(old);
  });
  it('keeps normal priorities for a visible empty facility', () => {
    const map = fourCpuMap();
    map.players.army1.gold = 30000;
    map.board.terrain[2]![1] = { kind: 'factory', owner: 'army1' };
    const state = value(createFourArmyState(map)),
      o = value(observeFourArmy(state, 'army1'));
    expect(chooseFourArmyCpuCommand(o, options)).toEqual(chooseFourArmyCpuCommand(o, options, 'four-army-cpu-v1'));
  });
  it('uses the same physical choices for 90/180/270-degree rotations, including candidate pruning', () => {
    const traces: unknown[][] = [];
    for (let rotation = 0; rotation < 4; rotation++) {
      const order = [...FOUR_ARMY_IDS.slice(rotation), ...FOUR_ARMY_IDS.slice(0, rotation)];
      let state = value(createFourArmyState(value(createFourArmyMap32(15141, order))));
      const trace = [];
      for (let n = 0; n < 24; n++) {
        const actor = state.round.order[state.round.index]!,
          o = value(observeFourArmy(state, actor)),
          command = chooseFourArmyCpuCommand(o, options)!;
        const unitKey = (id: string) => {
          const unit = o.units.find((u) => u.id === id)!;
          return { kind: unit.kind, position: unit.position ? rotateFourArmy32(unit.position, (4 - rotation) % 4) : null };
        };
        const normalize = (c: FourArmyCommand) => ({
          type: c.type,
          actor: FOUR_ARMY_IDS[(FOUR_ARMY_IDS.indexOf(c.actor) - rotation + 4) % 4],
          ...('unitId' in c ? { unit: unitKey(c.unitId) } : {}),
          ...('transportId' in c ? { transport: unitKey(c.transportId) } : {}),
          ...('targetId' in c ? { target: unitKey(c.targetId) } : {}),
          ...('destination' in c ? { destination: rotateFourArmy32(c.destination, (4 - rotation) % 4) } : {}),
          ...('factory' in c ? { factory: rotateFourArmy32(c.factory, (4 - rotation) % 4), kind: c.kind } : {}),
        });
        trace.push(normalize(command));
        state = value(applyFourArmyCommand(state, command));
      }
      traces.push(trace);
    }
    for (const trace of traces.slice(1)) expect(trace).toEqual(traces[0]);
  });
  it('does not rank equal actions by unit IDs or observation array order', () => {
    let state = value(createFourArmyState(value(createFourArmyMap32())));
    for (let i = 0; i < 16; i++) {
      const o = value(observeFourArmy(state, state.round.order[state.round.index]!));
      const names = new Map(o.units.map((u, i) => [u.id, `renamed-${o.units.length - i}`]));
      const renamed = {
        ...structuredClone(o),
        units: o.units.map((u) => ({ ...u, id: names.get(u.id)!, ...(u.embarkedIn ? { embarkedIn: names.get(u.embarkedIn)! } : {}) })).reverse(),
      };
      const expected = chooseFourArmyCpuCommand(o, options)!;
      const actual = chooseFourArmyCpuCommand(renamed, options)!;
      expect(actual).toEqual({
        ...expected,
        ...('unitId' in expected ? { unitId: names.get(expected.unitId) } : {}),
        ...('transportId' in expected ? { transportId: names.get(expected.transportId) } : {}),
        ...('targetId' in expected ? { targetId: names.get(expected.targetId) } : {}),
      });
      expect(() => chooseFourArmyCpuCommand(o, options, 'future' as typeof FOUR_ARMY_CPU_VERSION)).toThrow();
      state = value(applyFourArmyCommand(state, expected));
    }
  });
});
