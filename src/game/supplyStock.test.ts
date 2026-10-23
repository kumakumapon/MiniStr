import { describe, expect, it } from 'vitest';
import {
  applyModernUpkeep,
  createBoard,
  createGameState,
  isGameState,
  observeLogistics,
  SUPPLY_CAPACITY,
  supplyStock,
  unitStats,
  type GameState,
  type Unit,
  type UnitKind,
} from './index';

const unit = (id: string, kind: UnitKind, x: number, patch: Partial<Unit> = {}): Unit => ({
  id,
  kind,
  owner: 'red',
  position: { x, y: 1 },
  hp: 100,
  ammo: unitStats[kind].ammo,
  fuel: unitStats[kind].fuel,
  hasMoved: false,
  hasActed: false,
  ...patch,
});
const army = (units: Unit[]): GameState => ({ ...createGameState(createBoard(9, 3)), ruleVersion: 10, units });
const find = (state: GameState, id: string): Unit => state.units.find((candidate) => candidate.id === id)!;

describe('finite APC supplies', () => {
  it('spends stock on primary ammo, secondary ammo, then fuel and stops at zero', () => {
    const before = army([unit('truck', 'apc', 2, { supplyStock: 35 }), unit('tank', 'tank', 3, { ammo: 0, secondaryAmmo: 0, fuel: 0, hp: 50 })]);
    const after = applyModernUpkeep(before, 'red');
    expect(find(after, 'tank')).toMatchObject({ ammo: 3, secondaryAmmo: 0, fuel: 5, hp: 50 });
    expect(find(after, 'truck').supplyStock).toBe(0);
    expect(find(before, 'truck').supplyStock).toBe(35);
    expect(applyModernUpkeep(after, 'red').units).toEqual(after.units);
  });

  it('gives cargo priority, then uses stable recipient and provider IDs', () => {
    const before = army([
      unit('truck', 'apc', 2, { supplyStock: 20 }),
      unit('z-cargo', 'infantry', 0, { position: undefined, embarkedIn: 'truck', ammo: 8 }),
      unit('b', 'infantry', 3, { ammo: 8 }),
      unit('a', 'infantry', 1, { ammo: 8 }),
    ]);
    const result = applyModernUpkeep(before, 'red');
    expect(find(result, 'z-cargo').ammo).toBe(9);
    expect(find(result, 'a').ammo).toBe(9);
    expect(find(result, 'b').ammo).toBe(8);
    const shuffled = applyModernUpkeep({ ...before, units: [...before.units].reverse() }, 'red');
    for (const value of result.units) expect(find(shuffled, value.id)).toEqual(value);
  });

  it('partially refills the secondary magazine after the primary magazine', () => {
    const state = army([unit('truck', 'apc', 2, { supplyStock: 45 }), unit('tank', 'tank', 3, { ammo: 2, secondaryAmmo: 0, fuel: 0 })]);
    const next = applyModernUpkeep(state, 'red');
    expect(find(next, 'tank')).toMatchObject({ ammo: 3, secondaryAmmo: 3, fuel: 5 });
    expect(find(next, 'truck').supplyStock).toBe(0);
  });

  it('refills stock at compatible owned facilities and depot coverage before distributing it', () => {
    for (const kind of ['city', 'factory', 'capital', 'supplyDepot'] as const) {
      const state = army([unit('truck', 'apc', 2, { supplyStock: 0 }), unit('rifle', 'infantry', 3, { ammo: 0 })]);
      state.board.terrain[1]![2] = { kind, owner: 'red' };
      const next = applyModernUpkeep(state, 'red');
      expect(find(next, 'rifle').ammo).toBe(9);
      expect(find(next, 'truck').supplyStock).toBe(kind === 'supplyDepot' ? SUPPLY_CAPACITY : SUPPLY_CAPACITY - 90);
    }
    const nearby = army([unit('truck', 'apc', 2, { supplyStock: 0 })]);
    nearby.board.terrain[1]![1] = { kind: 'supplyDepot', owner: 'red' };
    expect(find(applyModernUpkeep(nearby, 'red'), 'truck').supplyStock).toBe(SUPPLY_CAPACITY);
  });

  it('does not transfer APC stock, serve enemies or aircraft, or refill at enemy/incompatible facilities', () => {
    const state = army([
      unit('full', 'apc', 2),
      unit('empty', 'apc', 3, { supplyStock: 0 }),
      unit('foe', 'infantry', 1, { owner: 'blue', ammo: 0 }),
      unit('plane', 'fighter', 2, { position: { x: 2, y: 0 }, ammo: 0 }),
    ]);
    const result = applyModernUpkeep(state, 'red', false);
    expect(find(result, 'empty').supplyStock).toBe(0);
    expect(supplyStock(find(result, 'full'))).toBe(SUPPLY_CAPACITY);
    expect(find(result, 'foe').ammo).toBe(0);
    expect(find(result, 'plane').ammo).toBe(0);
    for (const tile of [
      { kind: 'city', owner: 'blue' },
      { kind: 'airport', owner: 'red' },
    ] as const) {
      const other = army([unit('truck', 'apc', 2, { supplyStock: 0 })]);
      other.board.terrain[1]![2] = tile;
      expect(find(applyModernUpkeep(other, 'red'), 'truck').supplyStock).toBe(0);
    }
  });

  it('draws from multiple providers without charging for a resource twice', () => {
    const state = army([unit('b-truck', 'apc', 3, { supplyStock: 50 }), unit('a-truck', 'apc', 1, { supplyStock: 50 }), unit('rifle', 'infantry', 2, { ammo: 0 })]);
    const result = applyModernUpkeep(state, 'red');
    expect(find(result, 'rifle').ammo).toBe(9);
    expect(find(result, 'a-truck').supplyStock).toBe(0);
    expect(find(result, 'b-truck').supplyStock).toBe(10);
  });

  it('retains unlimited upkeep for rule v9 and earlier', () => {
    for (const ruleVersion of [2, 5, 8, 9] as const) {
      const state = { ...army([unit('truck', 'apc', 2), unit('tank', 'tank', 3, { ammo: 0, fuel: 0 })]), ruleVersion };
      const result = applyModernUpkeep(state, 'red');
      expect(find(result, 'tank')).toMatchObject({ ammo: unitStats.tank.ammo, fuel: unitStats.tank.fuel });
      expect(find(result, 'truck').supplyStock).toBeUndefined();
    }
  });

  it('validates stock and hides enemy stock from observed state', () => {
    const valid = army([unit('truck', 'apc', 2, { supplyStock: 12 })]);
    expect(isGameState(valid)).toBe(true);
    for (const supplyStock of [-1, 301, 0.5, NaN, Infinity, '12', null]) {
      expect(isGameState({ ...valid, units: [{ ...valid.units[0], supplyStock }] })).toBe(false);
    }
    expect(isGameState({ ...valid, ruleVersion: 9 })).toBe(false);
    expect(isGameState(army([unit('rifle', 'infantry', 2, { supplyStock: 12 })]))).toBe(false);
    const hidden = observeLogistics({ ...valid, units: [{ ...valid.units[0]!, owner: 'blue' }] }, 'red');
    expect(hidden.units[0]?.supplyStock).toBeUndefined();
    expect(observeLogistics(valid, 'red').units[0]?.supplyStock).toBe(12);
  });
});
