import { expect, it } from 'vitest';
import { escortScreenAt } from './coordination';
import { chooseCpuAction } from './rules';
import { bluePlanningState, rotatePosition } from './perspective';
import { visibleEnemies } from '../game/fog';
import { escortScreenCommands, escortEscapeCommands } from './escortScreen.fixture';
import { evaluationScenario } from '../../scripts/tacticsV151Scenario';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { valueOf } from '../game/operations.fixture';
import { applyGameCommand } from '../game/session';
import { isDeployedUnit, type DeployedUnit, type GameState, type Position } from '../game/types';

function screenState(): GameState {
  const initial: GameState = { ...createScenarioInitialState(evaluationScenario(scenarioById('convoy-escort')!, 'default', 15411)), ruleVersion: 14 };
  return escortScreenCommands.slice(0, 51).reduce((state, command) => valueOf(applyGameCommand(state, command)), initial);
}
const target = (state: GameState) => {
  const unit = state.units.find((unit) => unit.id === 'r1')!;
  if (!isDeployedUnit(unit)) throw Error('Expected deployed escort');
  return unit;
};

const screen = (state: GameState, unit: DeployedUnit, destination: Position) => escortScreenAt(state, unit, destination, visibleEnemies(state, unit.owner));

it('chooses a covered advance instead of the rain-blind flank, without mutating state', () => {
  const state = screenState(),
    unit = target(state),
    snapshot = JSON.stringify(state);
  expect(screen(state, unit, { x: 7, y: 3 })).toBe(false);
  expect(screen(state, unit, { x: 7, y: 6 })).toBe(true);
  expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'move', unitId: 'r1', destination: { x: 7, y: 6 } });
  expect(JSON.stringify(state)).toBe(snapshot);
});

it('preserves clear weather, old rules, tactics OFF and withdrawal decisions', () => {
  const state = screenState();
  const withdrawal = { ...state.scenarioSnapshot!, victoryConditions: [{ type: 'withdraw' as const, unitIds: ['r1'], positions: [{ x: 11, y: 5 }], required: 1 }] };
  for (const variant of [
    { ...state, turn: 5 },
    { ...state, ruleVersion: 13 as const },
    { ...state, tactics: undefined },
    { ...state, scenarioSnapshot: withdrawal },
  ])
    expect(screen(variant, target(variant), { x: 7, y: 3 })).toBe(true);
});

it('keeps waiting, rearward recovery and isolated survivors available', () => {
  const state = screenState(),
    unit = target(state);
  expect(screen(state, unit, unit.position)).toBe(true);
  expect(screen(state, unit, { x: 5, y: 7 })).toBe(true);
  const withoutArmor = { ...state, units: state.units.filter((other) => other.id !== 'r2') };
  expect(screen(withoutArmor, target(withoutArmor), { x: 7, y: 3 })).toBe(true);
  const spentArmor = { ...state, units: state.units.map((other) => (other.id === 'r2' ? { ...other, hp: 39 } : other)) };
  expect(screen(spentArmor, target(spentArmor), { x: 7, y: 3 })).toBe(true);
});

it('does not use hidden enemy positions or private resources', () => {
  const state = screenState();
  const hidden = { ...state, players: { ...state.players, blue: { gold: 99999, income: 99999 } }, units: state.units.filter((unit) => unit.owner === 'red') };
  expect(screen(hidden, target(hidden), { x: 7, y: 3 })).toBe(false);
  const privateChanges = { ...state, players: hidden.players, units: state.units.map((unit) => (unit.owner === 'blue' ? { ...unit, fuel: 0, ammo: 0, supplyStock: 0 } : unit)) };
  expect(chooseCpuAction(privateChanges, 'hard')).toEqual(chooseCpuAction(state, 'hard'));
});

it('uses the same relative screen after rotating the planning board', () => {
  const state = screenState(),
    rotated = bluePlanningState(state);
  expect(screen(rotated, target(rotated), rotatePosition({ x: 7, y: 3 }, state.board))).toBe(false);
  expect(screen(rotated, target(rotated), rotatePosition({ x: 7, y: 6 }, state.board))).toBe(true);
});

it('keeps an existing risk-aware escape instead of forcing the convoy back into its screen', () => {
  const initial: GameState = { ...createScenarioInitialState(evaluationScenario(scenarioById('convoy-escort')!, 'default', 15511)), ruleVersion: 14 };
  const state = escortEscapeCommands.reduce((state, command) => valueOf(applyGameCommand(state, command)), initial);
  expect(screen(state, target(state), { x: 7, y: 3 })).toBe(true);
  expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'move', unitId: 'r1', destination: { x: 7, y: 3 } });
});
