import { describe, expect, it } from 'vitest';
import { applyGameCommand, createScenarioInitialState, endTurn, type GameState } from '../game';
import { force, operation, valueOf } from '../game/operations.fixture';
import { supplyRendezvous } from './supplyRendezvous';
import { chooseCpuAction } from './rules';
import { isDeployedUnit, type DeployedUnit } from '../game/types';

const setup = (units: GameState['units']) => ({
  ...createScenarioInitialState(operation({ victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] })),
  units,
});
const plan = (state: GameState, score = (_truck: DeployedUnit, p: { x: number; y: number }) => -p.y) =>
  supplyRendezvous(
    state,
    state.activePlayer,
    state.units.filter((unit): unit is DeployedUnit => unit.owner === state.activePlayer && isDeployedUnit(unit)),
    score,
  );

describe('CPU supply rendezvous', () => {
  it('commits the truck then the dry battery and delivers next turn without chasing', () => {
    let state = setup([force('gun', 'artillery', 5, 1, { ammo: 0, fuel: 0 }), force('truck', 'apc', 0, 1), force('enemy', 'infantry', 7, 3, { owner: 'blue' })]);
    const snapshot = structuredClone(state);
    const move = plan(state);
    expect(move).toMatchObject({ type: 'move', unitId: 'truck' });
    expect(state).toEqual(snapshot);
    state = valueOf(applyGameCommand(state, move!));
    expect(plan(state)).toEqual({ type: 'wait', unitId: 'gun' });
    state = valueOf(applyGameCommand(state, plan(state)!));
    expect(plan(state)).toEqual({ type: 'wait', unitId: 'truck' });
    state = valueOf(applyGameCommand(state, plan(state)!));
    expect(plan(state)).toBeUndefined();
    state = endTurn(endTurn(state));
    expect(state.units.find((unit) => unit.id === 'gun')!.ammo).toBeGreaterThan(0);
    expect(state.units.find((unit) => unit.id === 'gun')!.fuel).toBeGreaterThan(0);
    expect(state.units.find((unit) => unit.id === 'truck')!.supplyStock).toBeLessThan(300);
  });

  it('holds an adjacent provider, supports stationary acted units and ignores healthy, fixed-service and incompatible recipients', () => {
    const truck = force('truck', 'apc', 1, 1),
      gun = force('gun', 'artillery', 2, 1, { ammo: 1, hasActed: true });
    expect(plan(setup([truck, gun]), () => 0)).toEqual({ type: 'wait', unitId: 'truck' });
    expect(plan(setup([truck, { ...gun, ammo: 6 }]))).toBeUndefined();
    expect(plan(setup([truck, { ...gun, kind: 'fighter', ammo: 0 }]))).toBeUndefined();
    const serviced = setup([truck, gun]);
    serviced.board.terrain[1]![2] = { kind: 'city', owner: 'red' };
    expect(plan(serviced)).toBeUndefined();
    expect(plan({ ...setup([truck, gun]), ruleVersion: 11 })).toBeUndefined();
    expect(plan({ ...setup([truck, gun]), ruleVersion: undefined })).toBeUndefined();
    expect(plan(setup([truck, force('infantry', 'infantry', 2, 1, { fuel: 0 })]))).toBeDefined();
  });

  it('keeps refilling and loaded trucks on their own missions and rejects unreachable or unsafe berths', () => {
    const truck = force('truck', 'apc', 0, 1),
      gun = force('gun', 'artillery', 5, 1, { ammo: 0 });
    for (const stock of [0, 100]) expect(plan(setup([{ ...truck, supplyStock: stock }, gun]))).toBeUndefined();
    expect(plan(setup([{ ...truck, hasMoved: true }, gun]))).toBeUndefined();
    expect(plan(setup([truck, gun]), () => Number.NEGATIVE_INFINITY)).toBeUndefined();
    const cargo = { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'truck' };
    expect(plan(setup([truck, gun, cargo]))).toBeUndefined();
    const mission = { ...createScenarioInitialState(operation()), units: [force('r1', 'apc', 0, 1), gun] };
    expect(plan(mission)).toBeUndefined();
    expect(plan({ ...mission, units: [truck, force('r1', 'artillery', 5, 1, { ammo: 0 })] })).toBeUndefined();
    expect(plan(setup([truck, { ...gun, ammo: undefined, fuel: undefined }]))).toBeUndefined();
  });

  it.each(['red', 'blue'] as const)('makes a legal deterministic integrated delivery for %s without using hidden logistics', (player) => {
    const state = {
      ...setup([
        force('gun', 'artillery', 5, 1, { owner: player, ammo: 0, fuel: 0 }),
        force('truck', 'apc', 0, 1, { owner: player }),
        force('enemy', 'infantry', 7, 3, { owner: player === 'red' ? 'blue' : 'red' }),
      ]),
      activePlayer: player,
    };
    for (const difficulty of ['normal', 'hard'] as const) {
      const action = chooseCpuAction(state, difficulty);
      expect(action).toMatchObject({ type: 'move', unitId: 'truck' });
      expect(chooseCpuAction(structuredClone(state), difficulty)).toEqual(action);
      expect(applyGameCommand(state, action).ok).toBe(true);
    }
  });
});
