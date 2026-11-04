import { describe, expect, it } from 'vitest';
import { applyGameCommand, createScenarioInitialState, endTurn, type GameState } from '../game';
import { force, operation, valueOf } from '../game/operations.fixture';
import { isDeployedUnit } from '../game/types';
import { policyConfig } from './armyPolicy';
import { chooseCpuAction, cpuDifficultyConfig, evaluateCpuPosition } from './rules';

const fixture = () => {
  const state = createScenarioInitialState(operation({ victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] }));
  state.players.red = { ...state.players.red, gold: 5000, income: 0 };
  state.units = [force('hurt', 'tank', 1, 1, { hp: 30 }), force('enemy', 'tank', 4, 1, { owner: 'blue' })];
  state.board.terrain[1]![0] = { kind: 'city', owner: 'red' };
  return state;
};

describe('defensive repairs', () => {
  it('values affordable HP repairs only on a compatible owned facility', () => {
    const state = fixture();
    const unit = state.units[0]!;
    if (!isDeployedUnit(unit)) throw Error('Fixture must be deployed');
    const config = policyConfig(cpuDifficultyConfig.normal, 'defensive');
    const delta = (s: GameState) =>
      evaluateCpuPosition(s, 'red', unit, { x: 0, y: 1 }, [], config, []) - evaluateCpuPosition(s, 'red', unit, { x: 0, y: 1 }, [], { ...config, coordinatedDefense: false }, []);
    expect(delta(state)).toBe(40);
    expect(delta({ ...state, players: { ...state.players, red: { ...state.players.red, gold: 0 } } })).toBe(0);
    for (const tile of [
      { kind: 'supplyDepot' as const, owner: 'red' as const },
      { kind: 'airport' as const, owner: 'red' as const },
      { kind: 'city' as const, owner: 'blue' as const },
    ]) {
      state.board.terrain[1]![0] = tile;
      expect(delta(state)).toBe(0);
    }
  });

  it('returns a damaged supplied defender to repair and actually restores HP next turn', () => {
    let state = fixture();
    const before = structuredClone(state);
    const action = chooseCpuAction(state, 'normal', 'red', 'defensive');
    expect(action).toEqual({ type: 'move', unitId: 'hurt', destination: { x: 0, y: 1 } });
    expect(chooseCpuAction(structuredClone(state), 'normal', 'red', 'defensive')).toEqual(action);
    expect(state).toEqual(before);
    state = valueOf(applyGameCommand(state, action));
    state = endTurn(endTurn(state));
    expect(state.units.find((u) => u.id === 'hurt')?.hp).toBe(50);
  });
});
