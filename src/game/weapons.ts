import { usesDualWeapons, type GameState, type Unit, type UnitKind } from './types';
import { remainingAmmo, unitDefinitions, unitKinds, type UnitDefinition, type UnitWeapon, type WeaponSlot } from './units';

// Cache fixed loadouts: forecasts and CPU movement inspect them many times per turn.
const loadouts = new Map(
  unitKinds.map((kind) => {
    const definition: UnitDefinition = unitDefinitions[kind];
    const { attack, range, ammo, indirect } = definition.stats;
    const primary: readonly UnitWeapon[] = definition.weapon === null ? [] : [{ kind: definition.weapon, attack, range, ammo, indirect, effectiveness: definition.effectiveness }];
    return [kind, { primary, dual: definition.secondaryWeapon ? [...primary, definition.secondaryWeapon] : primary }];
  }),
);

/** Historical matches retain their single weapon and combat arithmetic. */
export function weaponsForUnit(kind: UnitKind, state: Pick<GameState, 'ruleVersion'>): readonly UnitWeapon[] {
  const loadout = loadouts.get(kind)!;
  return usesDualWeapons(state) ? loadout.dual : loadout.primary;
}

export function weaponAmmo(unit: Pick<Unit, 'kind' | 'ammo' | 'secondaryAmmo'>, slot: WeaponSlot): number {
  if (slot === 0) return remainingAmmo(unit);
  const maximum = (unitDefinitions[unit.kind] as UnitDefinition).secondaryWeapon?.ammo ?? 0;
  const value = unit.secondaryAmmo ?? maximum;
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
}

export function isValidSecondaryAmmo(kind: UnitKind, ammo: unknown, state: Pick<GameState, 'ruleVersion'>): boolean {
  if (ammo === undefined) return true;
  const weapon = weaponsForUnit(kind, state)[1];
  return weapon !== undefined && typeof ammo === 'number' && Number.isSafeInteger(ammo) && ammo >= 0 && ammo <= weapon.ammo;
}

export function consumeWeaponAmmo(unit: Unit, slot: WeaponSlot): Unit {
  return slot === 0 ? { ...unit, ammo: weaponAmmo(unit, slot) - 1 } : { ...unit, secondaryAmmo: weaponAmmo(unit, slot) - 1 };
}

export function rearmUnit(unit: Unit, state: Pick<GameState, 'ruleVersion'>): Unit {
  const secondary = weaponsForUnit(unit.kind, state)[1];
  return { ...unit, ammo: unitDefinitions[unit.kind].stats.ammo, ...(secondary ? { secondaryAmmo: secondary.ammo } : {}) };
}

export function hasUsableWeapon(state: Pick<GameState, 'ruleVersion'>, unit: Unit, afterMoving = unit.hasMoved): boolean {
  return weaponsForUnit(unit.kind, state).some((weapon, slot) => weaponAmmo(unit, slot as WeaponSlot) > 0 && (!afterMoving || !weapon.indirect));
}
