import { expect, it } from 'vitest';
import { fourCpuMap } from './fourArmyCpu.fixture';
import { createFourArmyState, observeFourArmy } from '../game/fourArmyEngine';
import { chooseFourArmyCpuCommand } from './fourArmyCpu';
import type { GameResult } from '../game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
it('starts a reachable refuelling return before the last movement budget, without changing CPU v2', () => {
  const m = fourCpuMap();
  const s = value(createFourArmyState(m));
  s.units[0] = { ...s.units[0]!, kind: 'tank', position: { x: 4, y: 3 }, fuel: 14, ammo: 5 };
  const o = value(observeFourArmy(s, 'army1')),
    options = { difficulty: 'normal', policy: 'balanced' } as const;
  const old = chooseFourArmyCpuCommand(o, options, 'four-army-cpu-v2')!,
    modern = chooseFourArmyCpuCommand(o, options, 'four-army-cpu-v3')!;
  expect(old.type).toBe('move');
  expect(modern.type).toBe('move');
  if (modern.type !== 'move' || old.type !== 'move') throw Error('Expected moves');
  const d = (p: { x: number; y: number }) => p.x + p.y;
  expect(d(modern.destination)).toBeLessThan(d(old.destination));
  const full = structuredClone(o);
  full.units[0]!.fuel = 70;
  expect(chooseFourArmyCpuCommand(full, options, 'four-army-cpu-v3')).toEqual(chooseFourArmyCpuCommand(full, options, 'four-army-cpu-v2'));
});
