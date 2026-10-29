import { describe, expect, it } from 'vitest';
import { createBoard, createGameState, incomePropertyCount, playerOwnedProperties } from './state';
import type { GameState, Terrain } from './types';
const reference = (state: GameState, player: 'red' | 'blue') =>
  state.board.terrain.flat().filter((tile) => tile.owner === player && ['city', 'factory', 'airport', 'port', 'capital', 'supplyDepot'].includes(tile.kind));
describe('allocation-light property scans', () => {
  it('preserves row order, tile references and depot income exclusion', () => {
    const state = createGameState(createBoard(32, 32));
    const kinds = ['plain', 'forest', 'city', 'factory', 'capital', 'airport', 'port', 'supplyDepot'] as const;
    state.board.terrain.forEach((row, y) =>
      row.forEach((_, x) => {
        row[x] = { kind: kinds[(x + y) % kinds.length]!, owner: (x + y) % 3 ? 'red' : 'blue' };
      }),
    );
    for (const player of ['red', 'blue'] as const) {
      const expected = reference(state, player),
        actual = playerOwnedProperties(state, player);
      expect(actual).toEqual(expected);
      actual.forEach((tile, i) => expect(tile).toBe(expected[i]));
      expect(incomePropertyCount(state, player)).toBe(expected.filter((tile) => tile.kind !== 'supplyDepot').length);
    }
  });
  it('reads live captures, ownership and terrain replacements without stale caches', () => {
    const state = createGameState(createBoard(2, 1));
    const city: Terrain = { kind: 'city', owner: 'red' };
    state.board.terrain[0]![0] = city;
    expect(incomePropertyCount(state, 'red')).toBe(1);
    city.owner = 'blue';
    expect(playerOwnedProperties(state, 'red')).toEqual([]);
    expect(incomePropertyCount(state, 'blue')).toBe(1);
    state.board.terrain[0]![0] = { kind: 'supplyDepot', owner: 'blue' };
    expect(playerOwnedProperties(state, 'blue')).toHaveLength(1);
    expect(incomePropertyCount(state, 'blue')).toBe(0);
  });
});
