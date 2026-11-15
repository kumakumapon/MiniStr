import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';

export type FourArmyControllers = Record<FourArmyId, 'human' | 'cpu'>;
export const fourArmyControllers = (humanArmies: readonly FourArmyId[] = []): FourArmyControllers =>
  Object.fromEntries(FOUR_ARMY_IDS.map((a) => [a, humanArmies.includes(a) ? 'human' : 'cpu'])) as FourArmyControllers;
export function isFourArmyControllers(v: unknown): v is FourArmyControllers {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === 4 &&
    FOUR_ARMY_IDS.every((a) => Object.hasOwn(v, a) && ['human', 'cpu'].includes((v as FourArmyControllers)[a]))
  );
}
export function normalizeFourArmyControllers(value?: FourArmyId | FourArmyControllers): FourArmyControllers {
  if (value === undefined) return fourArmyControllers();
  if (typeof value === 'string' && FOUR_ARMY_IDS.includes(value)) return fourArmyControllers([value]);
  if (isFourArmyControllers(value)) return structuredClone(value);
  throw Error('Invalid four-army controllers');
}
export const fourArmyHumanArmies = (controls: FourArmyControllers): FourArmyId[] => FOUR_ARMY_IDS.filter((a) => controls[a] === 'human');
