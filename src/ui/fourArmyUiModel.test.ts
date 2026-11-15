import { expect, it } from 'vitest';
import { createFourArmyMap32 } from '../game/fourArmyMap32';
import { createFourArmyState, observeFourArmy } from '../game/fourArmyEngine';
import { fourArmyProductionFacilities, fourArmyProductionOptions, fourArmyReadyUnits } from './fourArmyUiModel';
const observation = () => {
  const map = createFourArmyMap32();
  if (!map.ok) throw Error(map.error);
  const state = createFourArmyState(map.value);
  if (!state.ok) throw Error(state.error);
  const o = observeFourArmy(state.value, 'army1');
  if (!o.ok) throw Error(o.error);
  return o.value;
};
it('offers only idle owned facilities and explains funds and the cargo-inclusive cap', () => {
  const o = observation();
  const facilities = fourArmyProductionFacilities(o);
  expect(facilities).toContainEqual({ x: 5, y: 3 });
  expect(facilities).not.toContainEqual({ x: 26, y: 28 });
  const factory = facilities[0]!;
  expect(fourArmyProductionOptions({ ...o, player: { gold: 0, income: 0 } }, factory).every((v) => v.reason === 'funds')).toBe(true);
  expect(fourArmyProductionOptions({ ...o, unitLimitPerArmy: 8 }, factory).every((v) => v.reason === 'limit')).toBe(true);
  const occupied = { ...o, units: [...o.units, { ...o.units[0]!, id: 'test', position: factory }] };
  expect(fourArmyProductionFacilities(occupied)).not.toContainEqual(factory);
});
it('counts deployed ready units consistently without warning for cargo alone', () => {
  const o = observation();
  const units = o.units.map((u) => ({ ...u, hasActed: true }));
  const carrier = units.find((u) => u.kind === 'apc')!;
  const cargo = { ...units[0]!, id: 'cargo', position: undefined, embarkedIn: carrier.id, hasActed: false };
  expect(fourArmyReadyUnits({ ...o, units: [...units, cargo] })).toEqual([]);
  carrier.hasActed = false;
  expect(fourArmyReadyUnits({ ...o, units: [...units, cargo] }).map((u) => u.id)).toEqual([carrier.id]);
});
