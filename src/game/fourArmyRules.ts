import { fourArmyRoster } from './smallBattle';
import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import { combinedTactics } from './tactics';
import type { GameState, Position } from './types';

export interface FourArmyRules {
  version: 1;
  tactics: boolean;
}
export interface FourArmyRecon {
  remaining: number;
  centers: Position[];
}
export interface FourArmyFortification {
  owner: FourArmyId;
  position: Position;
}
export interface FourArmyExtensions {
  recon: Record<FourArmyId, FourArmyRecon>;
  fortifications: FourArmyFortification[];
  repairReserve: Record<FourArmyId, number>;
  weatherSeed: number;
}
/** Only the viewing army's charges, budget and known positions leave the engine. */
export interface FourArmyRuleObservation {
  recon: FourArmyRecon;
  fortifications: FourArmyFortification[];
  repairReserve: number;
  weatherSeed: number;
}
export const isFourArmyRules = (v: unknown): v is FourArmyRules =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === 'tactics,version' &&
  (v as FourArmyRules).version === 1 &&
  typeof (v as FourArmyRules).tactics === 'boolean';
export function initialFourArmyExtensions(seed: number, participants: readonly FourArmyId[] = FOUR_ARMY_IDS): FourArmyExtensions {
  return {
    recon: fourArmyRoster(participants, () => ({ remaining: 2, centers: [] })),
    fortifications: [],
    repairReserve: Object.fromEntries(participants.map((a) => [a, 0])) as FourArmyExtensions['repairReserve'],
    weatherSeed: (seed ^ 0x57454154) >>> 0,
  };
}
export function fourArmyRuleProjection(
  rules: FourArmyRules | undefined,
  extensions: FourArmyRuleObservation | undefined,
  viewer: FourArmyId,
): Pick<GameState, 'ruleVersion' | 'recon' | 'fortifications' | 'repairReserve' | 'tactics'> {
  if (!rules || !extensions) return { ruleVersion: 12 };
  return {
    ruleVersion: 14,
    recon: { remaining: { red: extensions.recon.remaining, blue: 2 }, centers: extensions.recon.centers },
    fortifications: extensions.fortifications.map((site) => ({ ...site, owner: site.owner === viewer ? 'red' : 'blue' })),
    repairReserve: { red: extensions.repairReserve, blue: 0 },
    ...(rules.tactics ? { tactics: { options: { ...combinedTactics, submarines: false }, weatherSeed: extensions.weatherSeed, revealed: { red: [], blue: [] } } } : {}),
  };
}
