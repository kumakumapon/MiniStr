import { describe, expect, it } from 'vitest';
import { fourCpuMap, fourCpuUnit } from './fourArmyCpu.fixture';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyState } from '../game/fourArmyEngine';
import { chooseFourArmyCpuCommand, isObservedFourArmyCommand } from './fourArmyCpu';
import { fourArmyBridgeBenefit, fourArmyPressureFocus } from './fourArmyCpuRecovery';
import { fourArmyPlanningView } from './fourArmyObservation';
import { createExpandedBattleMap } from '../game/expandedBattleMap';
import { manhattanDistance } from '../game/terrain';
import type { GameResult } from '../game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const options = { difficulty: 'normal', policy: 'balanced' } as const;
const observation = (s: FourArmyState) => value(observeFourArmy(s, 'army1'));
function decide(s: FourArmyState, version: 'four-army-cpu-v6' | 'four-army-cpu-v7' = 'four-army-cpu-v7') {
  const o = observation(s),
    original = structuredClone(o),
    command = chooseFourArmyCpuCommand(o, options, version)!;
  expect(o).toEqual(original);
  expect(isObservedFourArmyCommand(o, command)).toBe(true);
  return { command, after: value(applyFourArmyCommand(s, command)) };
}
function base() {
  return value(createFourArmyState(fourCpuMap()));
}
describe('CPU v7 recovery, support and observed production', () => {
  it('returns damaged infantry along a multi-turn repair route instead of charging the enemy headquarters', () => {
    const s = base();
    s.units[0] = { ...s.units[0]!, position: { x: 4, y: 1 }, hp: 20 };
    s.units[1]!.position = { x: 7, y: 7 };
    s.units[2]!.position = { x: 6, y: 7 };
    const old = decide(s, 'four-army-cpu-v6'),
      next = decide(s);
    expect(next.command.type).toBe('move');
    expect(old.command.type).toBe('move');
    const distance = (state: FourArmyState) => manhattanDistance(state.units[0]!.position!, state.capitals.army1);
    expect(distance(next.after)).toBeLessThan(distance(s));
    expect(distance(next.after)).toBeLessThan(distance(old.after));
  });
  it('refills an exhausted primary weapon using own service facilities', () => {
    const s = base();
    s.units[0] = { ...fourCpuUnit('u1', 'army1', { x: 4, y: 1 }, 'tank'), ammo: 0, secondaryAmmo: 0 };
    s.units[1]!.position = { x: 7, y: 7 };
    s.units[2]!.position = { x: 6, y: 7 };
    const next = decide(s);
    expect(next.command.type).toBe('move');
    expect(manhattanDistance(next.after.units[0]!.position!, s.capitals.army1)).toBeLessThan(manhattanDistance(s.units[0]!.position!, s.capitals.army1));
  });
  it('replenishes healthy capture strength instead of counting severely damaged infantry as a complete force', () => {
    const s = base();
    s.board.terrain[0]![1] = { kind: 'factory', owner: 'army1', capturePoints: 20 };
    s.players.army1.gold = 20000;
    s.units[0]!.hp = 3;
    s.units.push({ ...fourCpuUnit('second', 'army1', { x: 2, y: 2 }), hp: 20 });
    s.units.filter((u) => u.owner === 'army1').forEach((u) => (u.hasActed = true));
    expect(decide(s, 'four-army-cpu-v6').command).toMatchObject({ type: 'produce', kind: 'tank' });
    expect(decide(s).command).toMatchObject({ type: 'produce', kind: 'infantry' });
  });
  it('uses a single indirect counter against observed armour, without consulting hidden enemy forces', () => {
    const s = base();
    s.board.terrain[0]![1] = { kind: 'factory', owner: 'army1', capturePoints: 20 };
    s.players.army1.gold = 20000;
    s.units[0] = { ...fourCpuUnit('u1', 'army1', { x: 3, y: 3 }, 'recon'), hasActed: true };
    s.units.push({ ...fourCpuUnit('cap1', 'army1', { x: 1, y: 2 }), hasActed: true }, { ...fourCpuUnit('cap2', 'army1', { x: 2, y: 2 }), hasActed: true });
    s.units[1] = fourCpuUnit('u2', 'army2', { x: 4, y: 3 }, 'tank');
    s.units[2] = fourCpuUnit('u3', 'army3', { x: 5, y: 3 }, 'heavyTank');
    expect(decide(s).command).toMatchObject({ type: 'produce', kind: 'artillery' });
    const hidden = structuredClone(s);
    hidden.units[1]!.position = { x: 7, y: 7 };
    hidden.units[2]!.position = { x: 7, y: 6 };
    expect(observation(hidden).units.some((u) => u.owner !== 'army1' && (u.kind === 'tank' || u.kind === 'heavyTank'))).toBe(false);
    expect(decide(hidden).command).toMatchObject({ type: 'produce', kind: 'tank' });
  });
  it('moves artillery into firing range and attacks on the next turn', () => {
    let s = base();
    s.units[0] = fourCpuUnit('u1', 'army1', { x: 3, y: 1 }, 'artillery');
    s.units[1] = fourCpuUnit('u2', 'army2', { x: 4, y: 1 }, 'tank');
    const next = decide(s);
    expect(next.command.type).toBe('move');
    s = next.after;
    const distance = manhattanDistance(s.units[0]!.position!, s.units[1]!.position!);
    expect(distance).toBeGreaterThanOrEqual(2);
    expect(distance).toBeLessThanOrEqual(3);
    for (const actor of ['army1', 'army2', 'army3', 'army4'] as const) s = value(applyFourArmyCommand(s, { actor, type: 'endTurn' }));
    const shot = decide(s);
    expect(shot.command).toMatchObject({ type: 'attack', unitId: 'u1', targetId: 'u2' });
    expect(shot.after.units.find((u) => u.id === 'u2')?.hp ?? 0).toBeLessThan(100);
  });
  it('advances capture units towards the remaining headquarters instead of detouring to rearward neutral property after round 40', () => {
    const s = base();
    s.round.round = 50;
    s.units[0]!.position = { x: 3, y: 1 };
    s.units[1]!.position = { x: 7, y: 7 };
    s.units[2]!.position = { x: 6, y: 7 };
    s.board.terrain[3]![3] = { kind: 'city', capturePoints: 20 };
    const next = decide(s),
      old = decide(s, 'four-army-cpu-v6');
    expect(next.command.type).toBe('move');
    const distance = (state: FourArmyState) => Math.min(...state.alive.filter((a) => a !== 'army1').map((a) => manhattanDistance(state.units[0]!.position!, state.capitals[a])));
    expect(distance(next.after)).toBeLessThan(distance(s));
    expect(old.command).toMatchObject({ type: 'move', destination: { x: 3, y: 3 } });
  });
  it('uses spare hard-cap slots only for missing healthy capture strength and respects the configured ceiling', () => {
    const s = base();
    s.board.terrain[0]![1] = { kind: 'factory', owner: 'army1', capturePoints: 20 };
    s.players.army1.gold = 20000;
    s.units[0]!.hp = 3;
    for (let i = 0; i < 4; i++) s.units.push({ ...fourCpuUnit('extra' + i, 'army1', { x: i + 2, y: 2 }, 'tank'), hasActed: true });
    s.units.filter((u) => u.owner === 'army1').forEach((u) => (u.hasActed = true));
    const o = { ...observation(s), unitLimitPerArmy: 8 };
    expect(chooseFourArmyCpuCommand(o, options, 'four-army-cpu-v6')).toMatchObject({ type: 'endTurn' });
    expect(chooseFourArmyCpuCommand(o, options, 'four-army-cpu-v7')).toMatchObject({ type: 'produce', kind: 'infantry' });
    expect(chooseFourArmyCpuCommand({ ...o, unitLimitPerArmy: 5 }, options, 'four-army-cpu-v7')).toMatchObject({ type: 'endTurn' });
  });
  it('unloads a naval transport after a legal move, while v6 keeps its archived decision', () => {
    const map = value(createExpandedBattleMap({ sourceMapId: 'strait', ending: 'unlimited', rules: { version: 1, tactics: false } }));
    let s = value(createFourArmyState(map));
    s.players.army1.gold = 0;
    s.units.filter((u) => u.owner === 'army1' && u.kind !== 'landingShip').forEach((u) => (u.hasActed = true));
    s = value(applyFourArmyCommand(s, { actor: 'army1', type: 'move', unitId: 'u2', destination: { x: 4, y: 7 } }));
    expect(decide(s, 'four-army-cpu-v6').command).toMatchObject({ type: 'wait', unitId: 'u2' });
    const next = decide(s);
    expect(next.command).toMatchObject({ type: 'disembark', transportId: 'u2' });
    expect(next.after.units.find((u) => u.id === 'u3')).toMatchObject({ hasActed: true, hasMoved: true });
    expect(next.after.units.find((u) => u.id === 'u3')?.embarkedIn).toBeUndefined();
  });
  it('builds crossings for actual route savings and leaves redundant crossings unbuilt', () => {
    const view = fourArmyPlanningView(observation(base()));
    view.ruleVersion = 14;
    for (const row of view.board.terrain) row[4] = { kind: 'sea' };
    const own = [{ ...view.units[0]!, position: { x: 3, y: 2 } }],
      goals = [{ x: 7, y: 0 }];
    view.bridges = [];
    expect(fourArmyBridgeBenefit(view, { x: 4, y: 3 }, own, goals)).toBeGreaterThan(0);
    const connected = { ...view, bridges: [{ owner: 'red' as const, position: { x: 4, y: 1 } }] };
    expect(fourArmyBridgeBenefit(connected, { x: 4, y: 3 }, own, goals)).toBe(0);
  });
  it('gives every three-way FFA start one strategic opponent instead of concentrating on the public property leader', () => {
    const map = value(createExpandedBattleMap({ participants: ['army1', 'army2', 'army3'] })),
      s = value(createFourArmyState(map));
    for (const row of s.board.terrain) for (const tile of row) if (tile.kind === 'factory' && tile.owner === undefined) tile.owner = 'army1';
    const targets = s.alive.map((a) => fourArmyPressureFocus(value(observeFourArmy(s, a))));
    expect(new Set(targets).size).toBe(3);
    expect(targets).not.toContain(undefined);
    for (let i = 0; i < 3; i++) expect(targets[i]).not.toBe(s.alive[i]);
    const team = value(
      createFourArmyState(value(createExpandedBattleMap({ participants: ['army1', 'army2', 'army3'], teams: { army1: 'army1', army2: 'army2', army3: 'army1' } }))),
    );
    expect(fourArmyPressureFocus(value(observeFourArmy(team, 'army1')))).toBe('army2');
    expect(fourArmyPressureFocus(value(observeFourArmy(team, 'army3')))).toBe('army2');
  });
});

it('takes a reachable enemy headquarters in a short four-way pass assault', () => {
  const map = value(createExpandedBattleMap({ sourceMapId: 'canyon' }));
  let state = value(createFourArmyState(map));
  while (state.round.round < 6 || state.round.order[state.round.index] !== 'army1') {
    state = value(applyFourArmyCommand(state, { actor: state.round.order[state.round.index]!, type: 'endTurn' }));
  }
  const h = state.capitals.army2;
  const unit = state.units.find((u) => u.owner === 'army1' && u.kind === 'infantry')!;
  unit.position = { x: h.x - 1, y: h.y - 1 };
  for (const other of state.units) if (other.owner === 'army1' && other !== unit) other.hasActed = true;
  state.players.army1.gold = 0;
  expect(decide(state).command).toMatchObject({ type: 'move', unitId: unit.id, destination: h });
});
