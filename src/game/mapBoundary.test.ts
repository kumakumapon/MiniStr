import { expect, it } from 'vitest';
import { loadScenarioDefinitions, maps, scenarioDefinitionToData } from './maps';
it('rejects prototype keys, numeric strings and objects as terrain coordinates', () => {
  const original = Object.getOwnPropertyNames(Object.prototype);
  for (const index of ['__proto__', 'constructor', 'prototype', '0', {}, [], null, Infinity, -1, 0.5, 9999]) {
    for (const axis of [0, 1]) {
      const data = scenarioDefinitionToData(maps[0]!);
      const cells: unknown[][] = data.board.cells.map((cell) => [...cell]);
      cells[0]![axis] = index;
      expect(loadScenarioDefinitions([{ ...data, board: { ...data.board, cells } }]).ok).toBe(false);
      expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(original);
    }
  }
});
