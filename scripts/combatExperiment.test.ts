import { expect, it } from 'vitest';
import { forecastCombat } from '../src/game/combat';
import { createScenarioInitialState } from '../src/game';
import { force, operation } from '../src/game/operations.fixture';
import { combatProfiles, experimentalForecast } from './combatExperiment';
const state = () => createScenarioInitialState(operation({ victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] }));
it('preserves the classic result exactly, including invalid orders', () => {
  const s = state(),
    a = force('a', 'tank', 2, 1),
    d = force('d', 'tank', 3, 1, { owner: 'blue' });
  const base = forecastCombat(s, a, d);
  expect(experimentalForecast(s, a, d, base, 'classic')).toBe(base);
  for (const profile of combatProfiles) {
    const bad = forecastCombat(s, { ...a, ammo: 0, secondaryAmmo: 0 }, d);
    expect(bad.ok).toBe(false);
    expect(experimentalForecast(s, a, d, bad, profile)).toBe(bad);
  }
});
it('uses start-of-combat strength for adjacent simultaneous fire, even on a lethal hit', () => {
  const s = state(),
    a = force('a', 'tank', 2, 1),
    d = force('d', 'tank', 3, 1, { owner: 'blue', hp: 10 });
  s.units = [a, d];
  const base = forecastCombat(s, a, d),
    next = experimentalForecast(s, a, d, base, 'simultaneous');
  expect(base.ok && base.value.canCounter).toBe(false);
  expect(next.ok && next.value.canCounter).toBe(true);
  expect(next.ok && next.value.damageToAttacker).toBeGreaterThan(0);
  expect(next.ok && next.value.damageToDefender).toBeGreaterThanOrEqual(base.ok ? base.value.damageToDefender : 0);
});
it('keeps range and indirect counter restrictions and does not invent ammunition', () => {
  const s = state(),
    a = force('a', 'artillery', 1, 1),
    d = force('d', 'tank', 3, 1, { owner: 'blue' });
  s.units = [a, d];
  const r = experimentalForecast(s, a, d, forecastCombat(s, a, d), 'combined');
  expect(r.ok && r.value.counterWeapon).toBeUndefined();
  const empty = { ...d, ammo: 0, secondaryAmmo: 0 };
  const near = { ...a, kind: 'tank' as const, position: { x: 2, y: 1 } };
  const r2 = experimentalForecast(s, near, empty, forecastCombat(s, near, empty), 'simultaneous');
  expect(r2.ok && r2.value.canCounter).toBe(false);
});
it.each(['plain', 'mountain', 'road'] as const)('compares extra cover on %s without mutating input', (kind) => {
  const s = state(),
    a = force('a', 'infantry', 2, 1),
    d = force('d', 'infantry', 3, 1, { owner: 'blue' });
  s.units = [a, d];
  s.board.terrain[1]![3] = { kind };
  const snapshot = structuredClone(s),
    base = forecastCombat(s, a, d),
    next = experimentalForecast(s, a, d, base, 'terrain');
  expect(base.ok && next.ok).toBe(true);
  if (base.ok && next.ok) {
    if (kind === 'road') expect(next.value.damageToDefender).toBe(base.value.damageToDefender);
    else expect(next.value.damageToDefender).toBeLessThan(base.value.damageToDefender);
  }
  expect(s).toEqual(snapshot);
});
it('does not grant surprise when adjacent opponents see each other', () => {
  const s = state(),
    a = force('a', 'tank', 2, 1),
    d = force('d', 'tank', 3, 1, { owner: 'blue' });
  s.units = [a, d];
  const b = forecastCombat(s, a, d),
    n = experimentalForecast(s, a, d, b, 'ambush');
  expect(n).toEqual(b);
});
