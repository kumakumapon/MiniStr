import { describe, expect, it } from 'vitest';
import {
  applyModernUpkeep,
  attackUnit,
  createBoard,
  createGameState,
  forecastCombat,
  isGameState,
  isValidUnitAmmo,
  remainingAmmo,
  unitDefinitions,
  unitKinds,
  unitStats,
  unitWeapons,
  type GameState,
  type Unit,
} from './index';

const tank = (ammo?: number): Unit => ({
  id: 'r1',
  kind: 'tank',
  owner: 'red',
  position: { x: 0, y: 0 },
  hp: 100,
  ammo,
  hasMoved: false,
  hasActed: false,
});

describe('unit weapons and ammunition bounds', () => {
  it('defines a weapon and integer capacity for each armed kind, and no weapon for landing ships', () => {
    for (const kind of unitKinds) {
      expect(Number.isSafeInteger(unitStats[kind].ammo)).toBe(true);
      if (unitStats[kind].attack > 0) {
        expect(unitWeapons[kind]).not.toBeNull();
        expect(unitStats[kind].ammo).toBeGreaterThan(0);
      } else {
        expect(unitWeapons[kind]).toBeNull();
        expect(unitStats[kind].ammo).toBe(0);
      }
    }
  });

  it.each(unitKinds)('validates both magazine boundaries for %s', (kind) => {
    const maximum = unitStats[kind].ammo;
    for (const ammo of [undefined, 0, maximum]) expect(isValidUnitAmmo(kind, ammo)).toBe(true);
    for (const ammo of [-1, maximum + 1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
      expect(isValidUnitAmmo(kind, ammo)).toBe(false);
    }
  });

  it.each([
    [undefined, 6],
    [0, 0],
    [6, 6],
    [99, 6],
    [-1, 0],
    [2.9, 2],
    [NaN, 0],
    [Infinity, 0],
    [-Infinity, 0],
  ])('reads ammunition %s as %s without mutating its source', (ammo, expected) => {
    const unit = Object.freeze(tank(ammo));
    expect(remainingAmmo(unit)).toBe(expected);
    expect(unit.ammo).toBe(ammo);
  });

  it('keeps the unarmed landing ship at zero even for a direct caller with excess ammunition', () => {
    expect(remainingAmmo({ kind: 'landingShip', ammo: 1 })).toBe(0);
  });

  it.each([undefined, 2, 3, 4] as const)('validates stored ammunition under rule version %s', (ruleVersion) => {
    const state: GameState = { ...createGameState(createBoard(2, 1)), ruleVersion, units: [tank()] };
    for (const ammo of [undefined, 0, unitStats.tank.ammo]) {
      expect(isGameState({ ...state, units: [tank(ammo)] })).toBe(true);
    }
    for (const ammo of [-1, 0.5, unitStats.tank.ammo + 1, NaN, Infinity]) {
      expect(isGameState({ ...state, units: [tank(ammo)] })).toBe(false);
    }
    expect(isGameState({ ...state, units: [{ ...tank(), kind: 'landingShip', ammo: 1 }] })).toBe(false);
  });

  it.each([undefined, 0, 1])('reports no attack capability for an unarmed unit with reserve %s', (ammo) => {
    const state: GameState = {
      ...createGameState(createBoard(2, 1, { kind: 'sea' })),
      units: [
        { ...tank(ammo), kind: 'landingShip' },
        { ...tank(9), id: 'b1', kind: 'destroyer', owner: 'blue', position: { x: 1, y: 0 } },
      ],
    };
    const before = structuredClone(state);
    expect(forecastCombat(state, state.units[0]!, state.units[1]!)).toEqual({ ok: false, error: 'Unit has no attack capability' });
    expect(attackUnit(state, 'r1', 'b1')).toEqual({ ok: false, error: 'Unit has no attack capability' });
    expect(state).toEqual(before);
  });

  it.each(unitKinds)('restores %s exactly to its capacity at a compatible owned facility', (kind) => {
    const profile = unitDefinitions[kind].movementProfile;
    const terrain = profile === 'air' ? 'airport' : profile === 'sea' ? 'port' : 'city';
    const state: GameState = {
      ...createGameState(createBoard(2, 1, { kind: terrain, owner: 'red' })),
      ruleVersion: kind === 'engineer' ? 8 : 4,
      units: [{ ...tank(0), kind }],
    };
    const before = structuredClone(state);
    const after = applyModernUpkeep(state, 'red');
    expect(after.units[0]!.ammo).toBe(unitStats[kind].ammo);
    expect(isGameState(after)).toBe(true);
    expect(state).toEqual(before);
  });
});
