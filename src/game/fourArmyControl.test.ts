import { expect, it } from 'vitest';
import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { fourArmyControllers, isFourArmyControllers, normalizeFourArmyControllers } from './fourArmyControl';
import { createFourArmyMap32 } from './fourArmyMap32';
import { createFourArmyState } from './fourArmyEngine';
import { FourArmyCpuSession } from '../ui/fourArmyCpuSession';
import { fourArmySpectatorFixture } from './fourArmySpectator.fixture';
import { parseFourArmySpectatorSave, serializeFourArmySpectatorSave, savedFourArmyControllers, type FourArmySpectatorSave } from './fourArmySpectatorSave';

it('accepts all 16 human/CPU allocations and dispatches only the current controller', async () => {
  for (let mask = 0; mask < 16; mask++)
    for (const actor of FOUR_ARMY_IDS) {
      const human = FOUR_ARMY_IDS.filter((_, i) => mask & (1 << i));
      const controllers = fourArmyControllers(human);
      const map = createFourArmyMap32(42, [actor, ...FOUR_ARMY_IDS.filter((a) => a !== actor)]);
      if (!map.ok) throw Error(map.error);
      const state = createFourArmyState(map.value);
      if (!state.ok) throw Error(state.error);
      const session = new FourArmyCpuSession(
        state.value,
        () => {
          throw Error('no Worker');
        },
        undefined,
        undefined,
        controllers,
      );
      const unit = state.value.units.find((u) => u.owner === actor)!;
      session.resume();
      if (controllers[actor] === 'human') {
        expect(await session.step()).toBeUndefined();
        expect(session.submit({ actor, type: 'wait', unitId: unit.id })).toBe(true);
      } else {
        expect(session.submit({ actor, type: 'wait', unitId: unit.id })).toBe(false);
        expect(await session.step()).toBeDefined();
      }
      const wrong = FOUR_ARMY_IDS.find((a) => a !== actor)!;
      expect(session.submit({ actor: wrong, type: 'endTurn' })).toBe(false);
      expect(session.commandCount).toBe(1);
      session.stop();
    }
});
it('round-trips controller allocations and refuses all-board or forged controller data', () => {
  const old = fourArmySpectatorFixture(0);
  const save: FourArmySpectatorSave = { ...old, format: 'ministr-four-army-configurable', schemaVersion: 3, controllers: fourArmyControllers(['army1', 'army2']), view: 'army1' };
  const file = serializeFourArmySpectatorSave(save);
  expect(file.ok).toBe(true);
  if (!file.ok) throw Error(file.error);
  expect(parseFourArmySpectatorSave(file.value)).toEqual({ ok: true, value: save });
  for (const delta of [
    { view: 'all' },
    { controllers: { army1: 'human' } },
    { controllers: { ...save.controllers, army2: 'remote' } },
    { humanArmy: 'army1' },
    { schemaVersion: 2 },
  ]) {
    const raw = JSON.parse(file.value);
    expect(parseFourArmySpectatorSave(JSON.stringify({ ...raw, ...delta })).ok).toBe(false);
  }
  expect(savedFourArmyControllers(old)).toEqual(fourArmyControllers());
  expect(normalizeFourArmyControllers('army4')).toEqual(fourArmyControllers(['army4']));
  expect(isFourArmyControllers({ ...fourArmyControllers(), extra: 'cpu' })).toBe(false);
  expect(() => normalizeFourArmyControllers({} as never)).toThrow();
});
