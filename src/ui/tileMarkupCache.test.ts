import { expect, it, vi } from 'vitest';
import { TileMarkupCache } from './tileMarkupCache';

it('reuses stable cells and replaces selection variants instead of retaining them', () => {
  const cache = new TileMarkupCache<object>(),
    state = {},
    compute = vi.fn(() => 'plain');
  expect(cache.get(state, 'red:ja', 0, 0, compute)).toBe('plain');
  expect(cache.get(state, 'red:ja', 0, 0, compute)).toBe('plain');
  expect(compute).toHaveBeenCalledTimes(1);
  cache.get(state, 'red:ja', 0, 1, () => 'selected');
  expect(cache.get(state, 'red:ja', 0, 0, compute)).toBe('plain');
  expect(compute).toHaveBeenCalledTimes(2);
  expect(cache.get(state, 'red:ja', 1, 0, () => 'fog')).toBe('fog');
});

it('invalidates state, viewer, locale, mode and covered boards', () => {
  const cache = new TileMarkupCache<object>(),
    state = {};
  cache.get(state, 'red:ja:normal', 0, 0, () => 'enemy');
  for (const identity of ['blue:ja:normal', 'blue:en:normal', 'blue:en:replay']) {
    expect(cache.get(state, identity, 0, 0, () => identity)).toBe(identity);
  }
  expect(cache.get({}, 'blue:en:replay', 0, 0, () => 'new state')).toBe('new state');
  cache.clear();
  expect(cache.get(state, 'red:ja:normal', 0, 0, () => 'covered')).toBe('covered');
  const history = {};
  expect(cache.get(state, 'red:ja:normal', 0, 0, () => 'history one', history)).toBe('history one');
  expect(cache.get(state, 'red:ja:normal', 0, 0, () => 'history two', {})).toBe('history two');
});
