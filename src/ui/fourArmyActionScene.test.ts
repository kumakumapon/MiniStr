// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { fourArmyCombatMap } from '../game/fourArmyCombat.fixture';
import { applyFourArmyCommand, createFourArmyState, isFourArmyState, type FourArmyCommand, type FourArmyState } from '../game/fourArmyEngine';
import { unitStats } from '../game/units';
import { fourArmyActionSceneForCommand, fourArmyActionSceneForViewer } from './fourArmyActionScene';
import { renderActionScene, type ActionScene } from './actionScene';
import { setLocale } from './locale';

function apply(before: FourArmyState, command: FourArmyCommand) {
  const original = structuredClone(before);
  const result = applyFourArmyCommand(before, command);
  if (!result.ok) throw Error(result.error);
  const after = structuredClone(result.value);
  const scene = fourArmyActionSceneForCommand(before, command, result.value);
  expect(before).toEqual(original);
  expect(result.value).toEqual(after);
  expect(JSON.stringify(after)).not.toContain('progressBefore');
  expect(isFourArmyState(after)).toBe(true);
  return { before, command, after, scene };
}
function capture() {
  const map = fourArmyCombatMap();
  map.order = ['army3', 'army1', 'army2', 'army4'];
  map.units[2] = { ...map.units[2]!, kind: 'infantry', hp: 100, fuel: unitStats.infantry.fuel, ammo: unitStats.infantry.ammo };
  map.board.terrain[6]![6] = { kind: 'city', owner: 'army4', capturePoints: 20 };
  const made = createFourArmyState(map);
  if (!made.ok) throw Error(made.error);
  return apply(made.value, { actor: 'army3', type: 'capture', unitId: 'a3' });
}
function service(supplier = false) {
  const map = fourArmyCombatMap(true);
  map.players.army2.gold = 10_000;
  map.units[1] = { ...map.units[1]!, position: supplier ? { x: 5, y: 1 } : { x: 7, y: 0 }, hp: 60, fuel: 5, ammo: 1, secondaryAmmo: 0 };
  if (supplier)
    map.units.push({
      id: 'supplier',
      owner: 'army2',
      kind: 'apc',
      position: { x: 6, y: 1 },
      hp: 100,
      fuel: unitStats.apc.fuel,
      ammo: unitStats.apc.ammo,
      supplyStock: 300,
      hasMoved: false,
      hasActed: false,
    });
  const made = createFourArmyState(map);
  if (!made.ok) throw Error(made.error);
  return apply(made.value, { actor: 'army1', type: 'endTurn' });
}
afterEach(() => setLocale('ja'));
describe('resolved four-army capture and logistics presentation', () => {
  it('shows real army ownership and both partial and completed capture progress without changing state', () => {
    const first = capture();
    expect(first.scene).toMatchObject({ kind: 'capture', owner: 'army3', unitId: 'a3', propertyOwner: 'army4', progressBefore: 0, progressAfter: 50, captured: false });
    let state = first.after;
    for (const actor of ['army3', 'army1', 'army2', 'army4'] as const) state = apply(state, { actor, type: 'endTurn' }).after;
    const second = apply(state, first.command);
    expect(second.scene).toMatchObject({ owner: 'army3', propertyOwner: 'army3', progressBefore: 50, progressAfter: 100, captured: true });
    expect(renderActionScene(second.scene!)).toContain('第3軍');
    setLocale('en');
    expect(renderActionScene(second.scene!)).toContain('Property captured');
    expect(renderActionScene(second.scene!)).toContain('Army 3');
  });
  it('reports the incoming army actual repair, fuel and both ammunition changes from a facility', () => {
    const r = service();
    expect(r.scene).toMatchObject({ kind: 'logistics', owner: 'army2', changes: [{ unitId: 'a2', owner: 'army2', source: { type: 'facility', terrain: 'capital' } }] });
    if (r.scene?.kind !== 'logistics') throw Error('No logistics');
    const unit = r.after.units.find((u) => u.id === 'a2')!;
    expect(r.scene.changes[0]!.resources).toEqual([
      { resource: 'hp', before: 60, after: unit.hp },
      { resource: 'fuel', before: 5, after: unit.fuel },
      { resource: 'ammo', before: 1, after: unit.ammo },
      { resource: 'secondaryAmmo', before: 0, after: unit.secondaryAmmo },
    ]);
    expect(unit.hp).toBeGreaterThan(60);
    expect(fourArmyActionSceneForViewer(r.scene, r.before, r.after, 'army2')).toEqual(r.scene);
    expect(fourArmyActionSceneForViewer(r.scene, r.before, r.after, 'army1')).toBeUndefined();
    expect(fourArmyActionSceneForViewer(r.scene, r.before, r.after, 'all')).toEqual(r.scene);
  });
  it('attributes adjacent APC supplies and preserves their identities only when known', () => {
    const r = service(true);
    expect(r.scene).toMatchObject({ kind: 'logistics', changes: [{ source: { type: 'supply', kind: 'apc', unitId: 'supplier' } }] });
    if (r.scene?.kind !== 'logistics') throw Error('No supplies');
    expect(r.scene.changes[0]!.resources.some((x) => x.resource === 'fuel')).toBe(true);
    const hiddenSource: ActionScene = {
      ...r.scene,
      changes: r.scene.changes.map((c) => ({ ...c, source: { type: 'supply', kind: 'apc', position: { x: 6, y: 1 }, unitId: 'unknown' } })),
    };
    expect(fourArmyActionSceneForViewer(hiddenSource, r.before, r.after, 'army2')).toMatchObject({ changes: [{ source: { type: 'field' } }] });
    const unknownUnits = { ...r.scene, changes: r.scene.changes.map((c) => ({ ...c, unitId: 'unknown' })) };
    expect(fourArmyActionSceneForViewer(unknownUnits, r.before, r.after, 'army2')).toBeUndefined();
  });
  it('withholds a hidden capture and unknown capturer even on a visible tile', () => {
    const r = capture();
    expect(fourArmyActionSceneForViewer(r.scene!, r.before, r.after, 'army1')).toBeUndefined();
    expect(fourArmyActionSceneForViewer(r.scene!, r.before, r.after, 'army3')).toEqual(r.scene);
    if (r.scene?.kind !== 'capture') throw Error('No capture');
    expect(fourArmyActionSceneForViewer({ ...r.scene, unitId: 'unknown' }, r.before, r.after, 'army3')).toBeUndefined();
  });
  it('ignores normal commands, unchanged resources and a paused round boundary', () => {
    const map = fourArmyCombatMap(),
      made = createFourArmyState(map);
    if (!made.ok) throw Error(made.error);
    expect(apply(made.value, { actor: 'army1', type: 'wait', unitId: 'a1' }).scene).toBeUndefined();
    const r = service();
    expect(fourArmyActionSceneForCommand(r.before, r.command, { ...r.after, paused: true })).toBeUndefined();
    expect(fourArmyActionSceneForCommand(r.after, { actor: 'army2', type: 'wait', unitId: 'a2' }, r.after)).toBeUndefined();
  });
  it('recognizes real upkeep on resume without replaying an old capture', () => {
    const r = service();
    const before = { ...r.before, paused: true };
    expect(fourArmyActionSceneForCommand(before, { actor: 'army1', type: 'resume' }, r.after)).toEqual(r.scene);
  });
});
