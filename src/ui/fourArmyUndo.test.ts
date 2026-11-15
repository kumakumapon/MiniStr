import { expect, it } from 'vitest';
import { canUndoFourArmyCommand, FourArmyUndoHistory } from './fourArmyUndo';
import { fourCpuMap } from '../ai/fourArmyCpu.fixture';
import { fourArmyControllers } from '../game/fourArmyControl';
import { applyFourArmyCommand, createFourArmyState, type FourArmyCommand } from '../game/fourArmyEngine';
import { initialFourArmyExperience } from '../game/fourArmyExperience';
import type { GameResult } from '../game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
it('rewinds own-turn reversible actions but excludes CPU, multiplayer, turn changes and discoveries', () => {
  const before = value(createFourArmyState(fourCpuMap())),
    controllers = fourArmyControllers(['army1']);
  const wait: FourArmyCommand = { actor: 'army1', type: 'wait', unitId: 'u1' },
    after = value(applyFourArmyCommand(before, wait));
  expect(canUndoFourArmyCommand(before, wait, after, controllers)).toBe(true);
  expect(canUndoFourArmyCommand(before, wait, after, fourArmyControllers())).toBe(false);
  expect(canUndoFourArmyCommand(before, wait, after, fourArmyControllers(['army1', 'army2']))).toBe(false);
  const end: FourArmyCommand = { actor: 'army1', type: 'endTurn' };
  expect(canUndoFourArmyCommand(before, end, value(applyFourArmyCommand(before, end)), controllers)).toBe(false);
  const move: FourArmyCommand = { actor: 'army1', type: 'move', unitId: 'u1', destination: { x: 2, y: 1 } };
  expect(canUndoFourArmyCommand(before, move, value(applyFourArmyCommand(before, move)), controllers)).toBe(false);
  const changed = structuredClone(after);
  changed.rngSeed++;
  expect(canUndoFourArmyCommand(before, wait, changed, controllers)).toBe(false);
  changed.rngSeed--;
  changed.units[0]!.hp--;
  expect(canUndoFourArmyCommand(before, wait, changed, controllers)).toBe(false);
});
it('keeps at most eight independent board snapshots and restores the command offset and observed history together', () => {
  const history = new FourArmyUndoHistory(),
    state = value(createFourArmyState(fourCpuMap())),
    experience = initialFourArmyExperience(state, 0);
  for (let i = 0; i < 20; i++) history.push({ state, experience, position: i });
  expect(history.length).toBe(8);
  const last = history.pop()!;
  expect(last.position).toBe(19);
  expect(last.state).toEqual(state);
  expect(last.experience).toEqual(experience);
  last.state.units[0]!.hp = 1;
  expect(state.units[0]!.hp).toBe(100);
  history.clear();
  expect(history.length).toBe(0);
  expect(history.pop()).toBeUndefined();
});
