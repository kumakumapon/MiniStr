import { expect, test } from '@playwright/test';
import { compareTerrainCaptures } from './helpers/terrainPixels';
import type { ScenarioData } from '../../src/game/maps';

const kinds = ['plain', 'forest', 'mountain', 'road', 'swamp', 'sea', 'city', 'factory', 'airport', 'port', 'capital', 'supplyDepot'] as const;
for (const width of [1280, 390])
  for (const theme of ['temperate', 'desert', 'snow', 'urban', 'coastal'] as const) {
    test(`matches title and board terrain artwork for ${theme} at ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const scenario: ScenarioData = {
        id: 'terrain-colors',
        name: 'Terrain colors',
        briefing: 'Compare terrain',
        theme,
        startingGold: 0,
        board: { width: 6, height: 4, cells: kinds.map((kind, index) => [index % 6, Math.floor(index / 6), kind]) },
        initialUnits: [
          { kind: 'recon', owner: 'red', x: 2, y: 2 },
          { kind: 'infantry', owner: 'blue', x: 5, y: 3 },
        ],
        victoryConditions: [{ type: 'eliminate' }],
        defeatConditions: [{ type: 'eliminate' }],
      };
      await page.addInitScript((value) => {
        localStorage.setItem('ministr.locale', 'en');
        localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [value], history: [] }));
      }, scenario);
      await page.goto('/');
      const card = page.locator('.title-map-card[data-map-id="terrain-colors"]');
      await card.scrollIntoViewIfNeeded();
      const preview = await card.locator('.map-preview').evaluate((element) => ({
        html: element.outerHTML,
        cells: [...element.querySelectorAll('.map-preview-terrain')].reduce((total, cell) => total + Number(cell.getAttribute('width')), 0),
      }));
      expect(preview.cells).toBe(6 * 4);
      await test.step('Capture title preview', () => card.screenshot({ path: testInfo.outputPath(`systems-terrain-${theme}-${width}-title.png`) }));
      await card.click();
      await page.locator('#begin-operation').click();
      await page.locator('#end').focus();
      await page.locator('#terrain-legend > summary').click();
      await expect(page.locator('#terrain-legend')).toContainText(/Supply depot[\s\S]*Temporary bridge/);
      await page.locator('#end').focus();
      await page.mouse.move(0, 0);
      // Capture each live surface once. Repeated element screenshots exhausted
      // the shared 30s WebKit budget before the last terrain comparisons.
      const board = page.locator('.board');
      // One browser round trip per poll, retaining visibility checks for all
      // six cells. Opacity is deliberately ignored, as in toBeVisible().
      await expect
        .poll(() =>
          board.locator('.tile[data-y="0"] .terrain-art').evaluateAll((elements) =>
            elements.map((element) => {
              const bounds = element.getBoundingClientRect();
              return { kind: element.getAttribute('data-terrain-art'), visible: getComputedStyle(element).visibility === 'visible' && bounds.width > 0 && bounds.height > 0 };
            }),
          ),
        )
        .toEqual(kinds.slice(0, 6).map((kind) => ({ kind, visible: true })));
      const geometry = await board.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const regions = [...element.querySelectorAll<HTMLElement>('.tile[data-y="0"] .terrain-art')].map((art) => {
          const rect = art.getBoundingClientRect();
          return { kind: art.dataset.terrainArt, x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height };
        });
        return { width: bounds.width, height: bounds.height, regions };
      });
      expect(geometry.regions.map((region) => region.kind)).toEqual(kinds.slice(0, 6));
      const cell = geometry.regions[0]!;
      for (const region of geometry.regions) {
        expect(region.width).toBe(cell.width);
        expect(region.height).toBe(cell.height);
      }
      // Reuse the comparison capture as the board diagnostic, instead of a
      // second, much larger screenshot of the entire HUD and legend.
      const actual = await test.step('Capture live board pixels', () => board.screenshot({ path: testInfo.outputPath(`systems-terrain-${theme}-${width}-board.png`) }));
      await page.evaluate(
        ({ html, width, height }) => {
          const container = document.createElement('div');
          container.id = 'preview-color-probe';
          container.style.cssText = `position:fixed;left:0;top:0;z-index:9999;width:${width}px;height:${height}px;`;
          container.innerHTML = html;
          const svg = container.querySelector('svg')!;
          svg.setAttribute('viewBox', '0 0 6 1');
          svg.setAttribute('style', `width:${width}px;height:${height}px;max-width:none;margin:0;border-radius:0`);
          svg.setAttribute('x', '0');
          svg.setAttribute('y', '0');
          svg.setAttribute('width', String(width));
          svg.setAttribute('height', String(height));
          document.body.append(container);
        },
        { html: preview.html, width: cell.width * 6, height: cell.height },
      );
      const miniature = await test.step('Capture preview row pixels', () =>
        page.locator('#preview-color-probe').screenshot({ path: testInfo.outputPath(`systems-terrain-${theme}-${width}-pixels-preview.png`) }));
      const comparisons = await test.step('Compare all six terrain regions', () =>
        page.evaluate(compareTerrainCaptures, [
          { source: actual.toString('base64'), width: geometry.width, height: geometry.height, regions: geometry.regions },
          {
            source: miniature.toString('base64'),
            width: cell.width * 6,
            height: cell.height,
            regions: geometry.regions.map((_, x) => ({ x: x * cell.width, y: 0, width: cell.width, height: cell.height })),
          },
        ]));
      await page.evaluate(() => document.querySelector('#preview-color-probe')?.remove());
      expect(comparisons).toHaveLength(6);
      if (comparisons.some((comparison) => comparison.delta >= 8)) {
        await testInfo.attach('board-terrain-row', { body: actual, contentType: 'image/png' });
        await testInfo.attach('preview-terrain-row', { body: miniature, contentType: 'image/png' });
        await testInfo.attach('terrain-pixel-regions', { body: JSON.stringify({ geometry, comparisons }), contentType: 'application/json' });
      }
      for (const [x, comparison] of comparisons.entries()) {
        expect(comparison.delta, `${theme}/${kinds[x]} mean RGB difference: ${JSON.stringify(comparison)}`).toBeLessThan(8);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }

test('detects rendered terrain color mismatches at the eight-point boundary', async ({ page }) => {
  await page.setContent('<!doctype html><title>Terrain pixel comparison</title>');
  const captures = await page.evaluate(() =>
    [20, 28].map((red) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext('2d')!;
      context.fillStyle = `rgb(${red}, 40, 60)`;
      context.fillRect(0, 0, 2, 2);
      return { source: canvas.toDataURL('image/png').split(',')[1]!, width: 2, height: 2, regions: [{ x: 0, y: 0, width: 2, height: 2 }] };
    }),
  );
  const comparisons = await page.evaluate(compareTerrainCaptures, [captures[0]!, captures[1]!]);
  expect(comparisons).toEqual([{ board: [20, 40, 60], preview: [28, 40, 60], delta: 8 }]);
  expect(comparisons[0]!.delta < 8).toBe(false);
});
