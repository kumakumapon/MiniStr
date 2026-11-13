/** Synthetic capacity fixtures, not a second public map or recorded match history. */
import { createFourArmyMap32, rotateFourArmy32 } from '../../../src/game/fourArmyMap32';
import { createFourArmyState, type FourArmyState, type FourArmyMap } from '../../../src/game/fourArmyEngine';
import { FOUR_ARMY_IDS, type FourArmyId } from '../../../src/game/fourArmyFoundation';
import { unitStats } from '../../../src/game/units';

export function fourArmyCapacityFixture(cap: number, crowded = false, actor: FourArmyId = 'army1'): { map: FourArmyMap; state: FourArmyState } {
  const made = createFourArmyMap32(1512, [actor, ...FOUR_ARMY_IDS.filter((a) => a !== actor)]);
  if (!made.ok) throw Error(made.error);
  const map = made.value;
  map.id = `four-map-capacity-${cap}`;
  map.setup!.unitLimitPerArmy = cap;
  let id = 33;
  FOUR_ARMY_IDS.forEach((army, rotation) => {
    for (let i = 8; i < cap; i++)
      map.units.push({
        id: `u${id++}`,
        owner: army,
        kind: 'infantry',
        position: rotateFourArmy32({ x: 1 + ((i - 8) % 9), y: 1 + Math.floor((i - 8) / 9) }, rotation),
        hp: 100,
        fuel: unitStats.infantry.fuel,
        ammo: unitStats.infantry.ammo,
        hasActed: false,
        hasMoved: false,
      });
  });
  const madeState = createFourArmyState(map);
  if (!madeState.ok) throw Error(madeState.error);
  const state = madeState.value;
  if (crowded)
    FOUR_ARMY_IDS.forEach((army, rotation) =>
      state.units
        .filter((u) => u.owner === army)
        .forEach((u, i) => {
          u.position = rotateFourArmy32({ x: 15 - (i % 4), y: 15 - Math.floor(i / 4) }, rotation);
        }),
    );
  return { map, state };
}
