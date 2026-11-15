import { expect, it } from 'vitest';
import { compareFourArmyContinuation } from './fourArmyContinuation';
import { fourCpuMap } from '../src/ai/fourArmyCpu.fixture';
import { createFourArmyState, type FourArmyState, type FourArmyCommand } from '../src/game/fourArmyEngine';
const initial = () => {
  const map = fourCpuMap();
  map.board.terrain[3]![4] = { kind: 'factory', owner: 'army1', capturePoints: 20 };
  map.units[1]!.position = { x: 4, y: 3 };
  const r = createFourArmyState(map);
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const end = (s: FourArmyState): FourArmyCommand => ({ actor: s.round.order[s.round.index]!, type: s.paused ? 'resume' : 'endTurn' });
it('compares all 64 accepted commands even when unseen occupancy rejects a planned production', () => {
  const state = initial();
  const r = compareFourArmyContinuation(state, structuredClone(state), (s) =>
    s.round.order[s.round.index] === 'army1' ? { actor: 'army1', type: 'produce', factory: { x: 4, y: 3 }, kind: 'infantry' } : end(s),
  );
  expect(r.commands).toHaveLength(64);
  expect(r.fallbacks).toBe(16);
  expect(r.original).toEqual(r.restored);
  expect(r.commands.every((c) => c.type === 'endTurn')).toBe(true);
});
it('detects an initial restored state mismatch before planning', () => {
  const state = initial(),
    restored = structuredClone(state);
  restored.rngSeed++;
  expect(() => compareFourArmyContinuation(state, restored, end)).toThrow('state drift');
});
it('detects a divergent planned choice', () => {
  const state = initial();
  let n = 0;
  expect(() => compareFourArmyContinuation(state, structuredClone(state), (s) => (n++ ? { actor: 'army1', type: 'wait', unitId: 'u1' } : end(s)))).toThrow('continuation drift');
});
it('fails a rejected fallback instead of reporting a shortened success', () => {
  const state = initial();
  expect(() => compareFourArmyContinuation(state, structuredClone(state), () => ({ actor: 'army1', type: 'wait', unitId: 'missing' }))).toThrow('fallback');
  expect(() => compareFourArmyContinuation(state, structuredClone(state), end, 0)).toThrow('budget');
});
it('ends a continuation only when the whole game has ended', () => {
  const state = initial();
  state.outcome = { type: 'victory', winner: 'army1' };
  expect(compareFourArmyContinuation(state, structuredClone(state), end).commands).toEqual([]);
});
