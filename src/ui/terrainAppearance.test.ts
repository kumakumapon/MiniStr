import { afterEach, expect, it } from 'vitest';
import { createBoard } from '../game';
import { renderTerrainArt, renderTerrainPattern, terrainFilter } from './terrainAppearance';
import { renderMapPreview } from './mapPreview';
import { renderTerrainLegend } from './terrainLegend';
import { setLocale } from './locale';

afterEach(() => setLocale('ja'));

it.each(['temperate', 'desert', 'snow', 'urban', 'coastal'] as const)('shares artwork and filters in board, preview and key for %s', (theme) => {
  const kinds = ['plain', 'forest', 'mountain', 'road', 'swamp', 'sea', 'city', 'factory', 'airport', 'port', 'capital', 'supplyDepot'] as const;
  const board = createBoard(kinds.length, 1);
  kinds.forEach((kind, index) => {
    board.terrain[0]![index] = { kind };
  });
  const miniature = renderMapPreview(board, [], theme);
  const legend = renderTerrainLegend(theme);
  for (const kind of kinds) {
    const art = renderTerrainArt(kind, theme);
    expect(art).toContain(`filter:${terrainFilter(kind, theme)}`);
    expect(miniature).toContain(`data-terrain-art="${kind}"`);
    expect(miniature).toContain(`filter:${terrainFilter(kind, theme)}`);
    expect(renderTerrainPattern(kind, theme, 'fixed-id')).toContain('id="fixed-id"');
    expect(legend).toContain(art);
  }
  expect(miniature.match(/class="map-preview-terrain"/g)).toHaveLength(kinds.length);
});

it('uses safe fixed fallbacks for invalid kinds and themes', () => {
  expect(renderTerrainArt('constructor' as never, 'constructor' as never)).toBe(renderTerrainArt('plain', 'temperate'));
  expect(renderTerrainPattern('__proto__' as never, '<script>' as never, 'fixed-id')).toBe(renderTerrainPattern('plain', 'temperate', 'fixed-id'));
  expect(terrainFilter('sea', 'desert')).toBe('none');
  expect(terrainFilter('plain', 'desert')).not.toBe(terrainFilter('plain', 'temperate'));
  expect(terrainFilter('plain', 'snow')).not.toBe(terrainFilter('plain', 'temperate'));
});

it('uses the forest, mountain and road cells actually present in the atlas', () => {
  expect(renderTerrainPattern('forest', 'temperate', 'forest-key')).toContain('viewBox="1 0 1 1"');
  expect(renderTerrainPattern('mountain', 'temperate', 'mountain-key')).toContain('viewBox="2 0 1 1"');
  expect(renderTerrainPattern('road', 'temperate', 'road-key')).toContain('viewBox="3 0 1 1"');
  expect(renderTerrainArt('forest', 'temperate')).toContain('background-position:33.333333333333336% 0%');
});

it.each(['ja', 'en'] as const)('offers a collapsed static terrain key with supply and bridge explanations in %s', (locale) => {
  setLocale(locale);
  const html = renderTerrainLegend('desert');
  expect(html).not.toMatch(/<details[^>]*\sopen/);
  expect(html).toContain(locale === 'en' ? 'Terrain and facility key' : '地形・施設の凡例');
  expect(html).toContain(locale === 'en' ? 'Temporary bridge' : '仮設橋');
  expect(html).toContain(locale === 'en' ? 'does not repair HP' : 'HPは修理しません');
  expect(renderTerrainLegend('desert', true)).toMatch(/<details[^>]*\sopen/);
});
