import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { createFourArmyState, type FourArmyMap } from './fourArmyEngine';
import { unitStats } from './units';
/** Close, legal combat for presentation tests; no injected runtime state or hidden game hooks. */
export function fourArmyCombatMap(tactics = false): FourArmyMap {
  const capitals = { army1: { x: 0, y: 0 }, army2: { x: 7, y: 0 }, army3: { x: 7, y: 7 }, army4: { x: 0, y: 7 } };
  const board: FourArmyMap['board'] = { width: 8, height: 8, terrain: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ kind: 'plain' }))) };
  for (const army of FOUR_ARMY_IDS) {
    const p = capitals[army];
    board.terrain[p.y]![p.x] = { kind: 'capital', owner: army, capturePoints: 20 };
  }
  const positions = [
    { x: 3, y: 2 },
    { x: 4, y: 2 },
    { x: 6, y: 6 },
    { x: 1, y: 6 },
  ];
  return {
    id: 'four-combat-scene',
    board,
    capitals,
    order: [...FOUR_ARMY_IDS],
    seed: 42,
    ...(tactics
      ? {
          rules: { version: 1 as const, tactics: true },
          setup: {
            version: 1 as const,
            unitLimitPerArmy: 8,
            startZones: {
              army1: { x: 0, y: 0, width: 4, height: 4 },
              army2: { x: 4, y: 0, width: 4, height: 4 },
              army3: { x: 4, y: 4, width: 4, height: 4 },
              army4: { x: 0, y: 4, width: 4, height: 4 },
            },
          },
        }
      : {}),
    units: FOUR_ARMY_IDS.map((owner, i) => ({
      id: `a${i + 1}`,
      owner,
      kind: 'tank' as const,
      position: positions[i]!,
      hp: 100,
      fuel: unitStats.tank.fuel,
      ammo: unitStats.tank.ammo,
      hasMoved: false,
      hasActed: false,
    })),
    players: Object.fromEntries(FOUR_ARMY_IDS.map((a) => [a, { gold: 0, income: 0 }])) as FourArmyMap['players'],
  };
}
export function fourArmyCombatState(tactics = false) {
  const result = createFourArmyState(fourArmyCombatMap(tactics));
  if (!result.ok) throw Error(result.error);
  return result.value;
}
