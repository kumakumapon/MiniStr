import { expect, it } from 'vitest';
import { fourArmyPlanningView } from '../ai/fourArmyObservation';
import { createExpandedBattleMap } from '../game/expandedBattleMap';
import { createFourArmyState, observeFourArmy } from '../game/fourArmyEngine';
import type { GameResult } from '../game/types';
import { fourArmyDisplay } from './fourArmyBoard';
import { fourArmyMovementKind, fourArmyThreats, renderFourArmyTileInfo } from './fourArmyIntel';

function value<T>(result: GameResult<T>): T {
  if (!result.ok) throw Error(result.error);
  return result.value;
}

it('computes combined threat from observed enemies, ignores allies and never uses hidden occupancy or logistics', () => {
  const map = value(
    createExpandedBattleMap({
      teams: { army1: 'army1', army2: 'army1', army3: 'army3', army4: 'army4' },
      rules: { version: 1, tactics: true },
    }),
  );
  const state = value(createFourArmyState(map));
  const ally = state.units.find((u) => u.owner === 'army2' && u.kind === 'tank')!;
  const enemy = state.units.find((u) => u.owner === 'army3' && u.kind === 'tank')!;
  const hidden = state.units.find((u) => u.owner === 'army4' && u.kind === 'tank')!;
  const friendly = state.units.find((u) => u.owner === 'army1' && u.kind === 'infantry')!;
  state.units = [friendly, ally, { ...enemy, position: { x: friendly.position!.x + 1, y: friendly.position!.y } }, hidden];
  const before = value(observeFourArmy(state, 'army1'));
  expect(before.units.map((u) => u.id)).toEqual([friendly.id, ally.id, enemy.id]);
  const projected = fourArmyPlanningView(before);
  const range = fourArmyThreats(before, projected);
  expect(range.attack.has(`${friendly.position!.x},${friendly.position!.y}`)).toBe(true);
  expect(fourArmyThreats(before, projected, ally.id).attack.size).toBe(0);
  expect(fourArmyThreats(before, projected, enemy.id).movement.size).toBeGreaterThan(0);
  const altered = structuredClone(state);
  const secret = altered.units.find((u) => u.id === enemy.id)!;
  secret.fuel = 0;
  secret.ammo = 0;
  const distant = altered.units.find((u) => u.id === hidden.id)!;
  distant.position = { x: distant.position!.x + 1, y: distant.position!.y };
  const after = value(observeFourArmy(altered, 'army1'));
  expect(after).toEqual(before);
  expect(fourArmyThreats(after, fourArmyPlanningView(after))).toEqual(range);
  const display = fourArmyDisplay(state, 'army1');
  const kind = fourArmyMovementKind(before, friendly.position!);
  expect(kind).toBe('infantry');
  expect(renderFourArmyTileInfo(display, friendly.position!, projected, kind)).toMatch(/移動コスト|Move cost/);
  const unseen = renderFourArmyTileInfo(display, hidden.position!, projected);
  expect(unseen).toMatch(/未索敵|Unseen/);
  expect(unseen).not.toMatch(/HP |占領残値|Capture remaining/);
});
