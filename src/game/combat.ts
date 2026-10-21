import { unitDefenseStars } from './engineering';
import { rankDamageFactor } from './experience';
import { defenseStars, manhattanDistance, terrainAt } from './terrain';
import type { Terrain } from './types';
import { damageMultiplier, incomingDamageFactor, unitCategory, type UnitWeapon, type WeaponSlot } from './units';
import { weaponAmmo, weaponsForUnit } from './weapons';
import { isDeployedUnit, usesDualWeapons, type GameResult, type GameState, type Unit } from './types';

export { damageMultiplier };

/** Each terrain defense star reduces incoming damage by this percentage at 100 HP. */
export const DEFENSE_PERCENT_PER_STAR = 10;

/**
 * Terrain cover weakens with the defender's current HP, matching the combat rules.
 * A four-star tile protects a full-health unit by 40%, or a 50-HP unit by 20%.
 */
export function terrainDefenseReduction(terrain: Terrain, hp: number): number {
  return defenseStars(terrain) * DEFENSE_PERCENT_PER_STAR * hp / 100;
}

export interface CombatForecast {
  attackWeapon: WeaponSlot;
  counterWeapon?: WeaponSlot;
  /** Expected damage before the ±10% combat variance is applied. */
  damageToDefender: number;
  /** Expected counterattack damage before the ±10% combat variance is applied. */
  damageToAttacker: number;
  /** Whether the defender can counterattack at the expected damage outcome. */
  canCounter: boolean;
  outgoing: DamageRange;
  incoming: DamageRange;
  /** Counterattack is possible for at least one damage roll. */
  possibleCounter: boolean;
}

export interface DamageRange {
  min: number;
  max: number;
}

/** The inclusive damage bounds shown before combat resolves. */
export function damageRange(expectedDamage: number): DamageRange {
  return { min: applyDamageVariance(expectedDamage, 0), max: applyDamageVariance(expectedDamage, 1) };
}

/** Applies the combat's seeded ±10% modifier to an expected damage value. */
export function applyDamageVariance(expectedDamage: number, randomValue: number): number {
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  return Math.max(0, Math.round(expectedDamage * (0.9 + boundedRandom * 0.2)));
}

/**
 * Rank bonuses and heavy armour. Returns exactly 1 when neither applies so the
 * caller can keep the classic arithmetic bit-for-bit.
 */
export function combatDamageFactor(state: GameState, attacker: Unit, defender: Unit): number {
  const rank = rankDamageFactor(state, attacker, defender);
  const armour = incomingDamageFactor(defender.kind);
  return armour === 1 ? rank : rank * armour;
}

/** Select the strongest legal weapon; ties preserve primary ammunition order. */
export function selectCombatWeapon(state: GameState, attacker: Unit, defender: Unit, requested?: WeaponSlot, counter = false): GameResult<{ slot: WeaponSlot; weapon: UnitWeapon }> {
  if (!isDeployedUnit(attacker) || !isDeployedUnit(defender)) return { ok: false, error: 'Embarked units cannot fight' };
  const weapons = weaponsForUnit(attacker.kind, state);
  if (!weapons.length) return { ok: false, error: 'Unit has no attack capability' };
  if (requested !== undefined && (requested !== 0 && requested !== 1 || !weapons[requested])) return { ok: false, error: 'Weapon is not available' };
  const choices = weapons.map((weapon, slot) => ({ weapon, slot: slot as WeaponSlot }))
    .filter(choice => requested === undefined || choice.slot === requested);
  const loaded = choices.filter(choice => weaponAmmo(attacker, choice.slot) > 0);
  if (!loaded.length) return { ok: false, error: 'Unit is out of ammunition' };
  const ready = loaded.filter(({ weapon }) => counter ? !weapon.indirect : !usesDualWeapons(state) || !attacker.hasMoved || !weapon.indirect);
  if (!ready.length) return { ok: false, error: 'Indirect units cannot attack after moving' };
  const distance = manhattanDistance(attacker.position, defender.position);
  const inRange = ready.filter(({ weapon }) => distance >= weapon.range[0] && distance <= weapon.range[1]);
  const chosen = inRange.sort((a, b) => b.weapon.attack * b.weapon.effectiveness[unitCategory[defender.kind]] - a.weapon.attack * a.weapon.effectiveness[unitCategory[defender.kind]])[0];
  return chosen ? { ok: true, value: chosen } : { ok: false, error: 'Target is out of range' };
}

export function forecastCombat(state: GameState, attacker: Unit, defender: Unit, requested?: WeaponSlot): GameResult<CombatForecast> {
  if (!isDeployedUnit(attacker) || !isDeployedUnit(defender)) return { ok: false, error: 'Embarked units cannot fight' };
  if (attacker.owner === defender.owner) return { ok: false, error: 'Cannot attack a friendly unit' };
  const selected = selectCombatWeapon(state, attacker, defender, requested);
  if (!selected.ok) return selected;
  const { slot: attackWeapon, weapon } = selected.value;
  const defenderTerrain = terrainAt(state.board, defender.position);
  const attackerTerrain = terrainAt(state.board, attacker.position);
  if (!defenderTerrain || !attackerTerrain) return { ok: false, error: 'Unit is outside the board' };
  const baseRaw = weapon.attack * attacker.hp / 100 * weapon.effectiveness[unitCategory[defender.kind]];
  const rankFactor = combatDamageFactor(state, attacker, defender);
  const raw = rankFactor === 1 ? baseRaw : baseRaw * rankFactor;
  const reduction = unitDefenseStars(state, defender) * DEFENSE_PERCENT_PER_STAR * defender.hp / 100;
  const damageToDefender = Math.max(0, Math.round(raw * (1 - reduction / 100)));
  const defenderRemaining = Math.max(0, defender.hp - damageToDefender);
  const counter = !weapon.indirect ? selectCombatWeapon(state, defender, attacker, undefined, true) : undefined;
  const canCounter = defenderRemaining > 0 && counter?.ok === true;
  const counterRankFactor = combatDamageFactor(state, defender, attacker);
  const counterReduction = unitDefenseStars(state, attacker) * DEFENSE_PERCENT_PER_STAR * attacker.hp / 100;
  const counterAt = (remaining: number): number => {
    if (remaining <= 0 || !counter?.ok) return 0;
    const counterWeapon = counter.value.weapon;
    const base = counterWeapon.attack * remaining / 100 * counterWeapon.effectiveness[unitCategory[attacker.kind]];
    return Math.max(0, Math.round((counterRankFactor === 1 ? base : base * counterRankFactor) * (1 - counterReduction / 100)));
  };
  const damageToAttacker = counterAt(defenderRemaining);
  const outgoing = damageRange(damageToDefender);
  const incoming = {
    min: damageRange(counterAt(Math.max(0, defender.hp - outgoing.max))).min,
    max: damageRange(counterAt(Math.max(0, defender.hp - outgoing.min))).max,
  };
  return { ok: true, value: { attackWeapon, ...(counter?.ok ? { counterWeapon: counter.value.slot } : {}), damageToDefender, damageToAttacker, canCounter, outgoing, incoming, possibleCounter: incoming.max > 0 } };
}
