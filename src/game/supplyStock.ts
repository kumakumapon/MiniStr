import { usesFiniteSupplyRules, type GameState, type Unit } from './types';
import { unitStats, type WeaponSlot } from './units';
import { weaponAmmo, weaponsForUnit } from './weapons';

export const SUPPLY_CAPACITY = 300;
export const AMMO_SUPPLY_COST = 10;

export const supplyStock = (unit: Pick<Unit, 'supplyStock'>): number => unit.supplyStock ?? SUPPLY_CAPACITY;

export function isValidSupplyStock(kind: string, value: unknown, state: Pick<GameState, 'ruleVersion'>): boolean {
  return (
    value === undefined || (usesFiniteSupplyRules(state) && kind === 'apc' && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= SUPPLY_CAPACITY)
  );
}

/** Whether at least one resource the recipient lacks can be supplied. */
export function stockCanSupply(state: Pick<GameState, 'ruleVersion'>, stock: number, unit: Unit): boolean {
  return (
    (stock > 0 && (unit.fuel ?? unitStats[unit.kind].fuel) < unitStats[unit.kind].fuel) ||
    (stock >= AMMO_SUPPLY_COST && weaponsForUnit(unit.kind, state).some((weapon, slot) => weaponAmmo(unit, slot as WeaponSlot) < weapon.ammo))
  );
}

/** Primary ammo, secondary ammo, then fuel. No HP or APC-stock transfer. */
export function supplyFromStock(state: Pick<GameState, 'ruleVersion'>, unit: Unit, stock: number): { unit: Unit; spent: number } {
  let next = unit;
  let remaining = stock;
  weaponsForUnit(unit.kind, state).forEach((weapon, index) => {
    const slot = index as WeaponSlot;
    const current = weaponAmmo(next, slot);
    const rounds = Math.min(weapon.ammo - current, Math.floor(remaining / AMMO_SUPPLY_COST));
    if (rounds > 0) {
      next = slot === 0 ? { ...next, ammo: current + rounds } : { ...next, secondaryAmmo: current + rounds };
      remaining -= rounds * AMMO_SUPPLY_COST;
    }
  });
  const fuel = next.fuel ?? unitStats[next.kind].fuel;
  const delivered = Math.min(unitStats[next.kind].fuel - fuel, remaining);
  if (delivered > 0) {
    next = { ...next, fuel: fuel + delivered };
    remaining -= delivered;
  }
  return { unit: next, spent: stock - remaining };
}
