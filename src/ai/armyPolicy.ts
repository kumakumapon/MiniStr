import type { ArmyPolicy } from '../game/armyPolicy';
import type { CpuDifficultyConfig } from './rules';

/** Policy changes evaluation weights, never the information available or difficulty handicap. */
export function policyConfig(base: CpuDifficultyConfig, policy: ArmyPolicy): CpuDifficultyConfig {
  if (policy === 'offensive') return { ...base, attackSafetyMargin: 10, threatAvoidanceWeight: 0.2, objectiveDistanceWeight: 10, lowHpRetreatWeight: 0.15 };
  if (policy === 'defensive') return { ...base, coordinatedDefense: true, attackSafetyMargin: 30, threatAvoidanceWeight: 0.65, terrainDefenseWeight: 0.8, lowHpRetreatWeight: 0.5 };
  return base;
}
