import { describe, expect, it, vi } from 'vitest';
import { fourArmyHumanChoices } from './fourArmyHuman';
import { FourArmyCpuSession } from './fourArmyCpuSession';
import { FOUR_ARMY_CPU_VERSION } from '../ai/fourArmyCpuVersion';
import { defaultFourArmyCpuSettings } from '../ai/fourArmyCpu';
import { fourCpuMap, fourCpuUnit } from '../ai/fourArmyCpu.fixture';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyState } from '../game/fourArmyEngine';
import type { GameResult } from '../game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const initial = () => value(createFourArmyState(fourCpuMap()));
const choices = (s: FourArmyState, x = 1, y = 1) => fourArmyHumanChoices(value(observeFourArmy(s, 'army1')), { x, y });
const session = (s: FourArmyState) =>
  new FourArmyCpuSession(
    s,
    () => {
      throw Error('no worker');
    },
    defaultFourArmyCpuSettings(),
    FOUR_ARMY_CPU_VERSION,
    'army1',
  );

describe('human commands from observations', () => {
  it('keeps hidden enemy changes out of highlights and commits an unknown contact by the shared engine', () => {
    const a = initial(),
      b = structuredClone(a);
    a.units.find((u) => u.id === 'u2')!.position = { x: 4, y: 1 };
    const before = structuredClone(a),
      listed = choices(a);
    expect(listed).toEqual(choices(b));
    const move = listed.find((c) => c.action === 'move' && c.target?.x === 4 && c.target.y === 1)!;
    expect(move).toBeDefined();
    const human = session(a);
    expect(human.submit(move.command)).toBe(true);
    expect(human.state).toEqual(value(applyFourArmyCommand(a, move.command)));
    expect(human.state.units.find((u) => u.id === 'u1')!.position).toEqual({ x: 3, y: 1 });
    expect(a).toEqual(before);
    human.stop();
  });
  it('offers both legal weapons with public damage ranges and records the selected one exactly', () => {
    const map = fourCpuMap();
    map.units[0] = fourCpuUnit('u1', 'army1', { x: 1, y: 1 }, 'tank');
    map.units[1]!.position = { x: 2, y: 1 };
    const s = value(createFourArmyState(map)),
      listed = choices(s).filter((c) => c.command.type === 'attack');
    expect(listed.map((c) => c.action)).toEqual(['attack-primary', 'attack-secondary']);
    for (const choice of listed) {
      expect(choice.damage!.max).toBeGreaterThanOrEqual(choice.damage!.min);
      expect(choice.counterDamage!.max).toBeGreaterThanOrEqual(choice.counterDamage!.min);
      const human = session(s);
      expect(human.submit(choice.command)).toBe(true);
      expect(human.state).toEqual(value(applyFourArmyCommand(s, choice.command)));
      expect(human.commands).toEqual([choice.command]);
      human.stop();
    }
  });
  it('supports wait, capture, merge, embark, disembark and production with authoritative legality', () => {
    const map = fourCpuMap();
    map.board.terrain[1]![1] = { kind: 'city', capturePoints: 20 };
    map.units.push(fourCpuUnit('u5', 'army1', { x: 2, y: 1 }));
    map.units.push(fourCpuUnit('u6', 'army1', { x: 1, y: 2 }, 'apc'));
    map.units[0]!.hp = 40;
    const s = value(createFourArmyState(map));
    for (const action of ['wait', 'capture', 'merge', 'embark'] as const) {
      const choice = choices(s).find((c) => c.action === action)!;
      expect(choice, action).toBeDefined();
      const human = session(s);
      expect(human.submit(choice.command)).toBe(true);
      if (action === 'embark') {
        // Boarding spends both units. Return to the human turn before disembarking.
        let next = human.state;
        for (let i = 0; i < 4; i++) next = value(applyFourArmyCommand(next, { actor: next.round.order[next.round.index]!, type: 'endTurn' }));
        human.replaceState(next);
        const drop = choices(human.state, 1, 2).find((c) => c.action === 'disembark');
        expect(drop).toBeDefined();
        expect(human.submit(drop!.command)).toBe(true);
      }
      human.stop();
    }
    const factory = initial();
    factory.board.terrain[1]![2] = { kind: 'factory', owner: 'army1', capturePoints: 20 };
    factory.players.army1.gold = 10000;
    const produce = choices(factory, 2, 1).filter((c) => c.action === 'produce');
    expect(produce.some((c) => c.command.type === 'produce' && c.command.kind === 'infantry')).toBe(true);
    const human = session(factory);
    expect(human.submit(produce[0]!.command)).toBe(true);
    expect(human.state.units).toHaveLength(5);
    human.stop();
  });
  it('rejects exhausted units, enemy selections, other actors, invalid targets and commands after stopping', () => {
    const s = initial(),
      human = session(s),
      before = human.state;
    expect(choices(s, 6, 1).map((c) => c.action)).toEqual(['endTurn']);
    expect(human.submit({ actor: 'army2', type: 'endTurn' })).toBe(false);
    expect(human.submit({ actor: 'army1', type: 'move', unitId: 'u2', destination: { x: 5, y: 1 } })).toBe(false);
    expect(human.submit({ actor: 'army1', type: 'attack', unitId: 'u1', targetId: 'u2' })).toBe(false);
    expect(human.state).toEqual(before);
    expect(human.commands).toEqual([]);
    expect(human.submit({ actor: 'army1', type: 'wait', unitId: 'u1' })).toBe(true);
    expect(choices(human.state).map((c) => c.action)).toEqual(['endTurn']);
    human.stop();
    expect(human.submit({ actor: 'army1', type: 'endTurn' })).toBe(false);
  });
  it('never plans for the human, rejects commands on enemy turns, and cancels a pending CPU before resuming', async () => {
    const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
    const factory = vi.fn(() => worker as unknown as Worker);
    const human = new FourArmyCpuSession(initial(), factory, defaultFourArmyCpuSettings(), FOUR_ARMY_CPU_VERSION, 'army1');
    human.resume();
    expect(await human.step()).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
    expect(human.submit({ actor: 'army1', type: 'endTurn' })).toBe(true);
    human.resume();
    const pending = human.step();
    expect(factory).toHaveBeenCalledOnce();
    const before = human.state;
    expect(human.submit({ actor: 'army1', type: 'endTurn' })).toBe(false);
    human.pause();
    expect(await pending).toBeUndefined();
    expect(human.state).toEqual(before);
    expect(human.commands).toEqual([{ actor: 'army1', type: 'endTurn' }]);
    human.stop();
  });
});
