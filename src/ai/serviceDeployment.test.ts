import { expect, it } from 'vitest';
import { applyGameCommand, createScenarioInitialState, endTurn, type GameState, type PlayerId } from '../game';
import { force, operation, valueOf } from '../game/operations.fixture';
import { isDeployedUnit } from '../game/types';
import { visibleEnemies } from '../game/fog';
import { canLeaveRepairForFire, defensiveServiceWait } from './recovery';
import { chooseCpuAction } from './rules';

function fixture(player: PlayerId = 'red'): GameState {
  const foe = player === 'red' ? 'blue' : 'red';
  const state = createScenarioInitialState(
    operation({ board: { width: 12, height: 8, cells: [] }, victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] }),
  );
  state.activePlayer = player;
  state.recon = { remaining: { red: 0, blue: 0 }, centers: [] };
  state.players[player] = { ...state.players[player], gold: 5000, income: 0 };
  state.board.terrain[3]![1] = { kind: 'city', owner: player };
  state.units = [
    force('gun', 'artillery', 1, 3, { owner: player, hp: 42 }),
    force('observer', 'infantry', 6, 4, { owner: player, hasMoved: true, hasActed: true }),
    force('target', 'tank', 7, 3, { owner: foe, hp: 72 }),
  ];
  return state;
}

it.each(['red', 'blue'] as const)('deploys a repairable %s gun for a new observed firing position', (player) => {
  let state = fixture(player);
  const before = structuredClone(state),
    unit = state.units[0]!;
  if (!isDeployedUnit(unit)) throw Error('Expected deployed gun');
  expect(defensiveServiceWait(state, player, visibleEnemies(state, player), unit.id)).toEqual({ type: 'wait', unitId: unit.id });
  expect(canLeaveRepairForFire(state, player, unit, { x: 4, y: 3 }, visibleEnemies(state, player))).toBe(true);
  const action = chooseCpuAction(state, 'normal', player, 'defensive');
  expect(action).toMatchObject({ type: 'move', unitId: unit.id });
  expect(chooseCpuAction(structuredClone(state), 'normal', player, 'defensive')).toEqual(action);
  expect(state).toEqual(before);
  state = valueOf(applyGameCommand(state, action));
  state = endTurn(endTurn(state));
  expect(chooseCpuAction(state, 'normal', player, 'defensive')).toMatchObject({ type: 'attack', unitId: unit.id, targetId: 'target' });
});

it('preserves critical repair, direct units, ammunition, current shots and spent units', () => {
  const original = fixture();
  for (const patch of [{ hp: 35 }, { hp: 50 }, { hasMoved: true }, { hasActed: true }, { ammo: 0 }, { kind: 'tank' as const }]) {
    const state = structuredClone(original);
    const unit = { ...state.units[0]!, ...patch };
    if (!isDeployedUnit(unit)) throw Error('Expected deployed gun');
    state.units[0] = unit;
    expect(canLeaveRepairForFire(state, 'red', unit, { x: 4, y: 3 }, visibleEnemies(state, 'red'))).toBe(false);
  }
  const state = fixture();
  state.units[2]!.position = { x: 4, y: 3 };
  const unit = state.units[0]!;
  if (!isDeployedUnit(unit)) throw Error('Expected deployed gun');
  expect(canLeaveRepairForFire(state, 'red', unit, { x: 3, y: 3 }, visibleEnemies(state, 'red'))).toBe(false);
});

it.each(['red', 'blue'] as const)('keeps %s required holding posts and excludes observed lethal berths', (player) => {
  const state = fixture(player);
  const unit = state.units[0]!;
  if (!isDeployedUnit(unit)) throw Error('Expected deployed gun');
  const hold = { type: 'hold' as const, positions: [{ x: 1, y: 3 }], turns: 8, groundOnly: true };
  const held = { ...state, scenarioSnapshot: { ...state.scenarioSnapshot!, ...(player === 'red' ? { victoryConditions: [hold] } : { defeatConditions: [hold] }) } };
  expect(canLeaveRepairForFire(held, player, unit, { x: 4, y: 3 }, visibleEnemies(state, player))).toBe(false);
  const foe = player === 'red' ? 'blue' : 'red';
  state.units.push(force('threat', 'artillery', 6, 2, { owner: foe }));
  expect(canLeaveRepairForFire(state, player, unit, { x: 4, y: 3 }, visibleEnemies(state, player))).toBe(false);
});

it('requires a known target and preserves hidden contacts, legacy rules and the input', () => {
  const state = fixture();
  const unit = state.units[0]!;
  if (!isDeployedUnit(unit)) throw Error('Expected deployed gun');
  const before = structuredClone(state);
  expect(canLeaveRepairForFire(state, 'red', unit, { x: 4, y: 3 }, [])).toBe(false);
  const unknown = structuredClone(state);
  unknown.units.push(force('hidden', 'artillery', 6, 1, { owner: 'blue' }));
  const known = visibleEnemies(state, 'red');
  expect(canLeaveRepairForFire(unknown, 'red', unit, { x: 4, y: 3 }, known)).toBe(canLeaveRepairForFire(state, 'red', unit, { x: 4, y: 3 }, known));
  const legacy = { ...state };
  delete legacy.ruleVersion;
  expect(canLeaveRepairForFire(legacy, 'red', unit, { x: 4, y: 3 }, known)).toBe(false);
  expect(canLeaveRepairForFire(state, 'blue', unit, { x: 4, y: 3 }, known)).toBe(false);
  expect(state).toEqual(before);
});

it('keeps capital guards and naval guns on their existing recovery rules', () => {
  const state = fixture();
  const unit = state.units[0]!;
  if (!isDeployedUnit(unit)) throw Error('Expected deployed gun');
  state.board.terrain[3]![1] = { kind: 'capital', owner: 'red' };
  expect(canLeaveRepairForFire(state, 'red', unit, { x: 4, y: 3 }, visibleEnemies(state, 'red'))).toBe(false);
  state.board.terrain[3]![1] = { kind: 'port', owner: 'red' };
  const ship = force('ship', 'battleship', 1, 3, { hp: 42 });
  state.units[0] = ship;
  expect(canLeaveRepairForFire(state, 'red', ship, { x: 4, y: 3 }, visibleEnemies(state, 'red'))).toBe(false);
});
