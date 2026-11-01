import { expect, it } from 'vitest';
import { maps, createScenarioInitialState } from '../src/game/maps';
import { isGameState } from '../src/game/session';
import { catalogTacticalScenario } from './tacticalScenarios';
it('rotates every catalog layout, initial force and positional objective without mutating the source', () => {
  for (const map of maps) {
    const before = JSON.stringify(map);
    expect(catalogTacticalScenario(map.id, false)).toBe(map);
    const next = catalogTacticalScenario(map.id, true);
    expect(next.board.terrain[0]![0]).toEqual(map.board.terrain.at(-1)!.at(-1));
    expect(next.initialUnits[0]!.x).toBe(map.board.width - 1 - map.initialUnits[0]!.x);
    expect(isGameState(createScenarioInitialState(next))).toBe(true);
    expect(JSON.stringify(map)).toBe(before);
  }
  expect(() => catalogTacticalScenario('missing', true)).toThrow('Unknown catalog map');
});
