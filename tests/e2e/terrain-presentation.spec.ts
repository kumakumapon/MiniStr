import { expect, test } from '@playwright/test';
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
      const preview = await card.locator('.map-preview').evaluate((element) => element.outerHTML);
      const cells = await card.locator('.map-preview-terrain').evaluateAll((elements) => elements.reduce((total, element) => total + Number(element.getAttribute('width')), 0));
      expect(cells).toBe(6 * 4);
      await card.screenshot({ path: testInfo.outputPath(`systems-terrain-${theme}-${width}-title.png`) });
      await card.click();
      await page.locator('#begin-operation').click();
      await page.locator('#end').focus();
      await page.locator('#terrain-legend > summary').click();
      await expect(page.locator('#terrain-legend')).toContainText('Supply depot');
      await expect(page.locator('#terrain-legend')).toContainText('Temporary bridge');
      await page.locator('.battlefield-wrap').screenshot({ path: testInfo.outputPath(`systems-terrain-${theme}-${width}-board.png`) });
      await page.locator('#end').focus();
      await page.mouse.move(0, 0);
      // Compare rendered pixels at the same scale, without miniature owner/unit
      // markers. The first row contains only terrain; no facility overlays.
      for (let x = 0; x < 6; x++) {
        const art = page.locator(`.tile[data-x="${x}"][data-y="0"] .terrain-art`);
        await expect(art).toBeVisible();
        const bounds = (await art.boundingBox())!;
        const actual = await art.screenshot();
        await page.evaluate(
          ({ html, width, height, x }) => {
            const container = document.createElement('div');
            container.id = 'preview-color-probe';
            container.style.cssText = `position:fixed;left:0;top:0;z-index:9999;width:${width}px;height:${height}px;`;
            container.innerHTML = html;
            const svg = container.querySelector('svg')!;
            svg.setAttribute('viewBox', `${x} 0 1 1`);
            svg.setAttribute('style', `width:${width}px;height:${height}px;max-width:none;margin:0;border-radius:0`);
            svg.setAttribute('x', '0');
            svg.setAttribute('y', '0');
            svg.setAttribute('width', String(width));
            svg.setAttribute('height', String(height));
            document.body.append(container);
          },
          { html: preview, width: bounds.width, height: bounds.height, x },
        );
        const miniature = await page.locator('#preview-color-probe').screenshot();
        const delta = await page.evaluate(
          async (sources) => {
            const means = await Promise.all(
              sources.map(async (source) => {
                const image = new Image();
                image.src = `data:image/png;base64,${source}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext('2d')!;
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(0, 0, image.width, image.height).data;
                const totals = [0, 0, 0];
                for (let i = 0; i < pixels.length; i += 4) for (let channel = 0; channel < 3; channel++) totals[channel]! += pixels[i + channel]!;
                return totals.map((total) => total / (pixels.length / 4));
              }),
            );
            document.querySelector('#preview-color-probe')?.remove();
            return Math.max(...means[0]!.map((value, channel) => Math.abs(value - means[1]![channel]!)));
          },
          [actual.toString('base64'), miniature.toString('base64')],
        );
        expect(delta, `${theme}/${kinds[x]} mean RGB difference`).toBeLessThan(8);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }
