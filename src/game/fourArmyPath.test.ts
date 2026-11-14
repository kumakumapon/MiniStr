import { describe, expect, it } from 'vitest';
import { createFourArmyMap32, rotateFourArmy32 } from './fourArmyMap32';
import { createFourArmyState, applyFourArmyCommand, isFourArmyState, type FourArmyState } from './fourArmyEngine';
import { FOUR_ARMY_IDS } from './fourArmyFoundation';
import { serializeFourArmyArchive, parseFourArmyArchive } from './fourArmyArchive';
import { chooseFourArmyCpuCommand } from '../ai/fourArmyCpu';
import { observeFourArmy } from './fourArmyEngine';
import type { GameResult } from './types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
function contact(rotation: number, modern: boolean): FourArmyState {
  const order = FOUR_ARMY_IDS.map((_, i) => FOUR_ARMY_IDS[(i + rotation) % 4]!);
  const s = value(createFourArmyState(value(createFourArmyMap32(42, order, modern ? 1 : undefined))));
  const templates = [s.units[4]!, s.units[12]!, s.units[13]!, s.units[20]!, s.units[28]!];
  const owners = [0, 1, 1, 2, 3],
    points = [
      { x: 17, y: 21 },
      { x: 20, y: 19 },
      { x: 20, y: 20 },
      { x: 28, y: 28 },
      { x: 3, y: 28 },
    ];
  s.units = templates.map((u, i) => ({
    ...u,
    owner: FOUR_ARMY_IDS[(owners[i]! + rotation) % 4]!,
    position: rotateFourArmy32(points[i]!, rotation),
    hasActed: false,
    hasMoved: false,
  }));
  return s;
}
describe('versioned four-army movement paths', () => {
  it('preserves legacy unequal contact stops but matches position/fuel for all four new orientations', () => {
    const outputs = (modern: boolean) =>
      [0, 1, 2, 3].map((r) => {
        const s = contact(r, modern);
        expect(isFourArmyState(s)).toBe(true);
        const next = value(applyFourArmyCommand(s, { actor: s.round.order[0]!, type: 'move', unitId: s.units[0]!.id, destination: rotateFourArmy32({ x: 20, y: 19 }, r) }));
        const u = next.units[0]!;
        return { position: rotateFourArmy32(u.position!, (4 - r) % 4), fuel: u.fuel };
      });
    const legacy = outputs(false),
      modern = outputs(true);
    expect(legacy[0]).not.toEqual(legacy[2]);
    expect(new Set(modern.map((x) => JSON.stringify(x))).size).toBe(1);
    expect(modern[0]!.position).not.toEqual({ x: 20, y: 19 });
  });
  it('round-trips the new flag, rejects unsupported/tampered flags, and leaves legacy maps unversioned', () => {
    const map = value(createFourArmyMap32(42, undefined, 1));
    let s = value(createFourArmyState(map));
    const c = chooseFourArmyCpuCommand(value(observeFourArmy(s, s.round.order[0]!)), { difficulty: 'normal', policy: 'balanced' })!;
    s = value(applyFourArmyCommand(s, c));
    const raw = value(serializeFourArmyArchive(map, [c], s));
    expect(value(parseFourArmyArchive(raw)).payload.state).toEqual(s);
    const corrupt = JSON.parse(raw);
    delete corrupt.payload.map.pathVersion;
    expect(parseFourArmyArchive(JSON.stringify(corrupt)).ok).toBe(false);
    expect(isFourArmyState({ ...s, pathVersion: 2 })).toBe(false);
    expect(isFourArmyState({ ...s, pathVersion: undefined })).toBe(false);
    expect(value(createFourArmyState(value(createFourArmyMap32(42))))).not.toHaveProperty('pathVersion');
  });
});
