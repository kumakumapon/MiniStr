import type { PlayerId } from './types';

export const armyPolicies = ['balanced', 'offensive', 'defensive'] as const;
export type ArmyPolicy = (typeof armyPolicies)[number];
export type ArmyPolicies = Record<PlayerId, ArmyPolicy>;
export const defaultArmyPolicies = (): ArmyPolicies => ({ red: 'balanced', blue: 'balanced' });
export const isArmyPolicy = (value: unknown): value is ArmyPolicy => armyPolicies.some((policy) => policy === value);
export function validArmyPolicies(value: unknown): value is ArmyPolicies {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Object.keys(data).sort().join() === 'blue,red' && isArmyPolicy(data.red) && isArmyPolicy(data.blue);
}
