import { usesModernRules, type GameState, type Unit } from './types';

export const MAX_EXPERIENCE = 10;
/** Experience needed for ranks 1, 2, and 3. */
export const RANK_THRESHOLDS = [3, 6, 10] as const;
/** Each rank adds this much outgoing damage and removes this much incoming damage. */
export const RANK_DAMAGE_PERCENT = 5;

export type Rank = 0 | 1 | 2 | 3;

export function experienceRank(experience = 0): Rank {
  return RANK_THRESHOLDS.filter(threshold => experience >= threshold).length as Rank;
}

/**
 * Damage multiplier from the attacker's and defender's ranks. Classic states
 * and unranked matchups return exactly 1 so callers can skip the multiplication
 * and keep the historical floating-point result bit-for-bit.
 */
export function rankDamageFactor(state: Pick<GameState, 'ruleVersion'>, attacker: Unit, defender: Unit): number {
  if (!usesModernRules(state)) return 1;
  const attackerRank = experienceRank(attacker.experience);
  const defenderRank = experienceRank(defender.experience);
  if (attackerRank === 0 && defenderRank === 0) return 1;
  return (1 + attackerRank * RANK_DAMAGE_PERCENT / 100) * (1 - defenderRank * RANK_DAMAGE_PERCENT / 100);
}

/** Experience earned in one exchange: +1 for dealing damage and +1 more for destroying the enemy. */
export function experienceAfterCombat(unit: Unit, dealtDamage: number, destroyedEnemy: boolean): number {
  const earned = (dealtDamage > 0 ? 1 : 0) + (destroyedEnemy ? 1 : 0);
  return Math.min(MAX_EXPERIENCE, (unit.experience ?? 0) + earned);
}
