import { describe, expect, it } from 'vitest';
import { createBoard, createGameState, unitStats, type DeployedUnit, type GameState, type UnitKind } from '../game';
import { chooseCpuAction, cpuDifficultyConfig, evaluateCpuPosition } from './rules';

const unit = (id: string, kind: UnitKind, x: number, patch: Partial<DeployedUnit> = {}): DeployedUnit => ({
  id,
  kind,
  owner: 'blue',
  position: { x, y: 1 },
  hp: 100,
  ammo: unitStats[kind].ammo,
  fuel: unitStats[kind].fuel,
  hasMoved: false,
  hasActed: false,
  ...patch,
});
const army = (units: DeployedUnit[]): GameState => ({ ...createGameState(createBoard(12, 3)), ruleVersion: 10, activePlayer: 'blue', units });

describe('CPU finite logistics', () => {
  it('returns an empty supply truck toward a replenishment facility', () => {
    const truck = unit('truck', 'apc', 6, { supplyStock: 0 });
    const state = army([truck, unit('front', 'tank', 8, { ammo: 0, hasActed: true })]);
    state.board.terrain[1]![0] = { kind: 'city', owner: 'blue' };
    state.board.terrain[1]![11] = { kind: 'capital', owner: 'red' };
    const action = chooseCpuAction(state, 'normal', 'blue');
    expect(action).toMatchObject({ type: 'move', unitId: 'truck' });
    if (action.type === 'move') expect(action.destination.x).toBeLessThan(truck.position.x);
  });

  it('does not regard an empty or unaffordable truck as a source for an empty magazine', () => {
    const rifle = unit('rifle', 'infantry', 3, { ammo: 0 });
    const score = (supplyStock: number) => {
      const state = army([rifle, unit('truck', 'apc', 5, { supplyStock })]);
      return evaluateCpuPosition(state, 'blue', rifle, { x: 4, y: 1 }, [], cpuDifficultyConfig.normal, []);
    };
    expect(score(9)).toBe(score(0));
    expect(score(10)).toBeGreaterThan(score(0));
  });

  it('plans identically when only an enemy supply truck stock changes', () => {
    const state = army([unit('tank', 'tank', 3), unit('enemy', 'apc', 5, { owner: 'red', supplyStock: 0 })]);
    state.board.terrain[1]![0] = { kind: 'capital', owner: 'blue' };
    state.board.terrain[1]![11] = { kind: 'capital', owner: 'red' };
    const full = { ...state, units: state.units.map((candidate) => (candidate.id === 'enemy' ? { ...candidate, supplyStock: 300 } : candidate)) };
    for (const difficulty of ['easy', 'normal', 'hard'] as const) expect(chooseCpuAction(full, difficulty, 'blue')).toEqual(chooseCpuAction(state, difficulty, 'blue'));
  });
});
