import { expect, it } from 'vitest';
import { decodeCpuResponse } from './cpuResponse';
import { createScenarioInitialState, maps } from '../game/maps';
import { chooseCpuAction } from '../ai';
const state = () => createScenarioInitialState(maps[0]!);
it('rebuilds valid commands without retaining worker objects or extra fields', () => {
  const game = state();
  const commands = [
    { type: 'endTurn' },
    { type: 'recon', center: { x: 1, y: 1 } },
    ...['move', 'bridge', 'destroyBridge'].map((type) => ({ type, unitId: 'r1', destination: { x: 1, y: 1 } })),
    ...['fortify', 'wait', 'evacuate', 'capture'].map((type) => ({ type, unitId: 'r1' })),
    { type: 'attack', unitId: 'r1', targetId: 'b1' },
    { type: 'attack', unitId: 'r1', targetId: 'b1', weaponSlot: 0 },
    { type: 'attack', unitId: 'r1', targetId: 'b1', weaponSlot: 1 },
    { type: 'merge', unitId: 'r1', targetId: 'r2' },
    { type: 'embark', unitId: 'r1', transportId: 'r2' },
    { type: 'disembark', transportId: 'r2', destination: { x: 1, y: 1 } },
    { type: 'produce', factory: { x: 1, y: 1 }, kind: 'infantry' },
  ];
  for (const command of commands) {
    const result = decodeCpuResponse(command, game);
    expect(result).toEqual(command);
    expect(result).not.toBe(command);
  }
  expect(decodeCpuResponse({ type: 'endTurn', html: '<img src=x>' }, game)).toEqual({ type: 'endTurn' });
});
it('rejects invalid IDs, injection strings, non-numeric coordinates and unsupported fields', () => {
  for (const value of [
    null,
    {},
    { type: 'unknown' },
    { type: 'wait', unitId: '<img src=x>' },
    { type: 'attack', unitId: 'r1', targetId: 'b1', weaponSlot: 2 },
    ...['__proto__', 'constructor', '0', '<img src=x>', Infinity, -1, 999, 1.5].flatMap((x) => [
      { type: 'move', unitId: 'r1', destination: { x, y: 1 } },
      { type: 'produce', kind: 'infantry', factory: { x: 1, y: x } },
    ]),
    { type: 'produce', factory: { x: 1, y: 1 }, kind: '__proto__' },
  ]) {
    expect(() => decodeCpuResponse(value, state())).toThrow('Invalid CPU worker response');
  }
});
it('preserves actual synchronous CPU decisions for all difficulties and policies', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as const)
    for (const policy of ['balanced', 'offensive', 'defensive'] as const) {
      const game = state();
      const action = chooseCpuAction(game, difficulty, 'red', policy);
      expect(decodeCpuResponse(action, game)).toEqual(action);
    }
});
