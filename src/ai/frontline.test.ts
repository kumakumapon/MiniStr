import { describe, expect, it } from 'vitest';
import { createBoard, createGameState, fortifyUnit, unitStats, type GameState } from '../game';
import { force, valueOf } from '../game/operations.fixture';
import { chooseCpuAction, cpuDifficultyConfig, evaluateCpuPosition } from './rules';

function fixture(): GameState {
  const board = createBoard(8, 5);
  board.terrain[2]![3] = { kind: 'supplyDepot', owner: 'blue' };
  return {
    ...createGameState(board),
    ruleVersion: 8,
    recon: { remaining: { red: 0, blue: 0 }, centers: [] },
    players: { red: { gold: 1000, income: 0 }, blue: { gold: 0, income: 0 } },
    units: [force('e', 'engineer', 2, 2), force('b', 'tank', 4, 2, { owner: 'blue' })],
  };
}

describe('frontline CPU decisions', () => {
  it('builds near a public objective and a visible threat, and stays invariant to hidden enemy supplies', () => {
    const state = fixture();
    const action = chooseCpuAction(state, 'easy');
    expect(action).toEqual({ type: 'fortify', unitId: 'e' });
    const hidden = force('hidden', 'tank', 7, 4, { owner: 'blue', ammo: 0, fuel: 0 });
    expect(chooseCpuAction({ ...state, units: [...state.units, hidden] }, 'easy')).toEqual(action);
    expect(chooseCpuAction({ ...state, units: [...state.units, { ...hidden, ammo: 6, fuel: unitStats.tank.fuel }] }, 'easy')).toEqual(action);
    const built = valueOf(fortifyUnit(state, 'e'));
    expect(chooseCpuAction(built, 'easy').type).not.toBe('fortify');
  });
  it('does not build far from an objective, without a confirmed threat, or when a capturer needs the lane', () => {
    const state = fixture();
    expect(chooseCpuAction({ ...state, units: [state.units[0]!] }, 'easy').type).not.toBe('fortify');
    expect(chooseCpuAction({ ...state, units: [...state.units, force('i', 'infantry', 1, 2)] }, 'easy').type).not.toBe('fortify');
    const far = fixture();
    far.board.terrain[2]![3] = { kind: 'plain' };
    far.board.terrain[2]![7] = { kind: 'supplyDepot', owner: 'blue' };
    expect(chooseCpuAction(far, 'easy').type).not.toBe('fortify');
  });
  it('values depot service for depleted ground units and owned cover, without treating a depot as HP repair', () => {
    const state = fixture();
    state.board.terrain[2]![3] = { kind: 'supplyDepot', owner: 'red' };
    const depleted = force('t', 'tank', 1, 1, { ammo: 0, fuel: 5 });
    const score = (current: GameState, x: number, y: number) => evaluateCpuPosition(current, 'red', depleted, { x, y }, [], cpuDifficultyConfig.normal, []);
    expect(score(state, 3, 1)).toBeGreaterThan(score(state, 0, 0));
    const built = valueOf(fortifyUnit({ ...state, board: createBoard(8, 5) }, 'e'));
    expect(score(built, 2, 2)).toBeGreaterThan(score({ ...built, fortifications: [] }, 2, 2));
  });
});
