import { expect, it } from 'vitest';
import { setLocale } from './locale';
import { defaultCatalogFilters, renderTitleCatalog } from './titleCatalog';
import type { TitleMapCard } from './overlays';

it('matches all constraints against the same playable format and distinguishes recorded wins from untracked custom maps', () => {
  setLocale('en');
  const shared: TitleMapCard = {
    id: 'shared',
    name: 'Pass',
    width: 32,
    height: 32,
    theme: 'Temperate',
    startingGold: 6000,
    victory: 'Capture headquarters',
    custom: false,
    selected: false,
    preview: '',
    category: 'battle',
    clear: 'cleared',
    formats: [
      { armies: [2], width: 32, height: 32, terrain: 'water' },
      { armies: [3, 4], width: 18, height: 14, terrain: 'land', multiplayer: true, victory: 'Hold the pass', preview: (count) => `<svg data-count="${count}"></svg>` },
    ],
  };
  const custom: TitleMapCard = { ...shared, id: 'custom-pass', name: '<authored>', custom: true, category: 'custom', formats: undefined, clear: 'untracked' };
  const list = (filters: Partial<ReturnType<typeof defaultCatalogFilters>>) => renderTitleCatalog([shared, custom], { ...defaultCatalogFilters(), ...filters });
  expect(list({ armies: '3', size: 'wide' })).toContain('No matching battlefields.');
  expect(list({ armies: '3', terrain: 'land' })).toContain('data-count="3"');
  expect(list({ armies: '3', terrain: 'land' })).toContain('Hold the pass');
  expect(list({ clear: 'cleared' })).not.toContain('data-map-id="custom-pass"');
  expect(list({ category: 'custom', clear: 'untracked' })).toContain('&lt;authored&gt;');
  setLocale('ja');
});
