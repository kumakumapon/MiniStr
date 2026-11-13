import { FOUR_ARMY_IDS, type FourArmyId } from './fourArmyFoundation';
import type { Position } from './types';

export interface FourArmyStartZone extends Position {
  width: number;
  height: number;
}
export interface FourArmySetup {
  version: 1;
  unitLimitPerArmy: number;
  startZones: Record<FourArmyId, FourArmyStartZone>;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k));
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
export const inFourArmyStartZone = (p: Position, z: FourArmyStartZone): boolean => p.x >= z.x && p.y >= z.y && p.x < z.x + z.width && p.y < z.y + z.height;

/** Public immutable setup for engine v2. Cargo counts as a unit, never as a spare slot. */
export function isFourArmySetup(v: unknown, board: { width: number; height: number }, capitals: Record<FourArmyId, Position>): v is FourArmySetup {
  if (!record(v) || !keys(v, ['version', 'unitLimitPerArmy', 'startZones']) || v.version !== 1 || !integer(v.unitLimitPerArmy, 4, 32)) return false;
  const zones = v.startZones;
  if (!record(zones) || !keys(zones, FOUR_ARMY_IDS)) return false;
  if (
    !FOUR_ARMY_IDS.every((a) => {
      const z = zones[a];
      return (
        record(z) &&
        keys(z, ['x', 'y', 'width', 'height']) &&
        integer(z.x, 0, 31) &&
        integer(z.y, 0, 31) &&
        integer(z.width, 1, 32) &&
        integer(z.height, 1, 32) &&
        z.x + z.width <= board.width &&
        z.y + z.height <= board.height &&
        inFourArmyStartZone(capitals[a], z as unknown as FourArmyStartZone)
      );
    })
  )
    return false;
  const rectangles = FOUR_ARMY_IDS.map((a) => zones[a] as unknown as FourArmyStartZone);
  return rectangles.every((a, i) => rectangles.slice(i + 1).every((b) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y));
}
