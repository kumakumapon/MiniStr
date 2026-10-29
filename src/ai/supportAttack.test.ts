import { expect, it } from 'vitest';
import { supportedAttack } from './supportAttack';
import { operation, force } from '../game/operations.fixture';
import { createScenarioInitialState } from '../game/maps';

function fixture() {
  const attacker = force('r1', 'tank', 1, 1, { hp: 70 });
  const target = force('b1', 'tank', 2, 1, { owner: 'blue', hp: 99 });
  const support = force('r2', 'artillery', 2, 3);
  const state = { ...createScenarioInitialState(operation()), units: [attacker, support, target] };
  return { state, attacker, target, support };
}

it('coordinates a survivable exchange with a ready artillery finishing shot', () => {
  const { state, attacker, target, support } = fixture();
  expect(supportedAttack(state, attacker, target, false)).toBe(true);
  for (const patch of [{ hasActed: true }, { hasMoved: true }, { owner: 'blue' as const }, { position: { x: 7, y: 3 } }]) {
    expect(supportedAttack({ ...state, units: [attacker, { ...support, ...patch }, target] }, attacker, target, false)).toBe(false);
  }
  expect(supportedAttack({ ...state, ruleVersion: 11 }, attacker, target, false)).toBe(false);
  const damaged = { ...attacker, hp: 10 };
  expect(supportedAttack({ ...state, units: [damaged, support, target] }, damaged, target, false)).toBe(false);
});

it('allows profitable defensive exchanges only from a compatible owned repair facility', () => {
  const { state, attacker, target } = fixture();
  state.units = [attacker, target];
  expect(supportedAttack(state, attacker, target, true)).toBe(false);
  for (const owner of ['red', 'blue'] as const) {
    state.board.terrain[1]![1] = { kind: 'city', owner };
    expect(supportedAttack(state, attacker, target, true)).toBe(owner === 'red');
    expect(supportedAttack(state, attacker, target, false)).toBe(false);
  }
});
