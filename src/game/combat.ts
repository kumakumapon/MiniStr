import { rankDamageFactor } from './experience';
import { defenseStars, manhattanDistance, terrainAt } from './terrain';
import type { Terrain } from './types';
import { damageMultiplier, incomingDamageFactor, unitCategory, unitStats } from './units';
import { isDeployedUnit, type GameResult, type GameState, type Unit } from './types';

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

export function forecastCombat(state: GameState, attacker: Unit, defender: Unit): GameResult<CombatForecast> {
  if (!isDeployedUnit(attacker) || !isDeployedUnit(defender)) return { ok: false, error: 'Embarked units cannot fight' };
  if (attacker.owner === defender.owner) return { ok: false, error: 'Cannot attack a friendly unit' };
  const attackerAmmo = attacker.ammo ?? unitStats[attacker.kind].ammo;
  if (attackerAmmo <= 0) return { ok: false, error: 'Unit is out of ammunition' };
  if (unitStats[attacker.kind].attack <= 0) return { ok: false, error: 'Unit has no attack capability' };
  const distance = manhattanDistance(attacker.position, defender.position);
  const attackRange = unitStats[attacker.kind].range;
  if (distance < attackRange[0] || distance > attackRange[1]) return { ok: false, error: 'Target is out of range' };
  const defenderTerrain = terrainAt(state.board, defender.position);
  const attackerTerrain = terrainAt(state.board, attacker.position);
  if (!defenderTerrain || !attackerTerrain) return { ok: false, error: 'Unit is outside the board' };
  const baseRaw = unitStats[attacker.kind].attack * attacker.hp / 100 * damageMultiplier[attacker.kind][unitCategory[defender.kind]];
  const rankFactor = combatDamageFactor(state, attacker, defender);
  const raw = rankFactor === 1 ? baseRaw : baseRaw * rankFactor;
  const reduction = terrainDefenseReduction(defenderTerrain, defender.hp);
  const damageToDefender = Math.max(0, Math.round(raw * (1 - reduction / 100)));
  const defenderRemaining = Math.max(0, defender.hp - damageToDefender);
  const counterRange = unitStats[defender.kind].range;
  const defenderAmmo = defender.ammo ?? unitStats[defender.kind].ammo;
  const canCounter = !unitStats[attacker.kind].indirect && !unitStats[defender.kind].indirect
    && defenderRemaining > 0 && defenderAmmo > 0 && distance >= counterRange[0] && distance <= counterRange[1];
  const baseCounterRaw = canCounter ? unitStats[defender.kind].attack * defenderRemaining / 100 * damageMultiplier[defender.kind][unitCategory[attacker.kind]] : 0;
  const counterRankFactor = combatDamageFactor(state, defender, attacker);
  const counterRaw = counterRankFactor === 1 ? baseCounterRaw : baseCounterRaw * counterRankFactor;
  const counterReduction = terrainDefenseReduction(attackerTerrain, attacker.hp);
  const damageToAttacker = Math.max(0, Math.round(counterRaw * (1 - counterReduction / 100)));
  const outgoing = damageRange(damageToDefender);
  const counterAt = (remaining: number): number => {
    if (remaining <= 0 || defenderAmmo <= 0 || unitStats[attacker.kind].indirect
      || unitStats[defender.kind].indirect || distance < counterRange[0] || distance > counterRange[1]) return 0;
    const base = unitStats[defender.kind].attack * remaining / 100 * damageMultiplier[defender.kind][unitCategory[attacker.kind]];
    return Math.max(0, Math.round((counterRankFactor === 1 ? base : base * counterRankFactor) * (1 - counterReduction / 100)));
  };
  const incoming = {
    min: damageRange(counterAt(Math.max(0, defender.hp - outgoing.max))).min,
    max: damageRange(counterAt(Math.max(0, defender.hp - outgoing.min))).max,
  };
  return { ok: true, value: { damageToDefender, damageToAttacker, canCounter, outgoing, incoming, possibleCounter: incoming.max > 0 } };
}
