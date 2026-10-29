import { expect, test } from '@playwright/test';
import type { ScenarioData } from '../../src/game/maps';

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`large board keeps input, focus and geometry at ${width} in ${locale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const scenario: ScenarioData = {
        id: 'response-board',
        name: 'Response board',
        briefing: '',
        startingGold: 0,
        board: { width: 32, height: 32, cells: [] },
        initialUnits: [
          { kind: 'infantry', owner: 'red', x: 1, y: 0 },
          { kind: 'infantry', owner: 'red', x: 1, y: 1 },
          { kind: 'infantry', owner: 'blue', x: 31, y: 31 },
        ],
        victoryConditions: [{ type: 'eliminate' }],
        defeatConditions: [{ type: 'eliminate' }],
      };
      await page.addInitScript(
        ({ scenario, locale }) => {
          localStorage.setItem('ministr.locale', locale);
          localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
        },
        { scenario, locale },
      );
      await page.goto('/');
      await page.locator('.title-map-card[data-map-id="response-board"]').click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      await page.locator('#begin-operation').click();
      const first = page.locator('.tile[data-x="1"][data-y="0"]');
      await first.click();
      await expect(first).toBeFocused();
      await expect(first.locator('.selected-marker')).toHaveCount(1);
      // Observe the app root: choosing another unit should rebuild it once.
      const writes = await page.evaluate(() => {
        const app = document.querySelector('#app')!;
        const observer = new MutationObserver(() => {});
        observer.observe(app, { childList: true });
        document.querySelector<HTMLButtonElement>('.tile[data-x="1"][data-y="1"]')!.click();
        const count = observer.takeRecords().filter((record) => [...record.addedNodes].some((node) => node instanceof HTMLElement && node.matches('main'))).length;
        observer.disconnect();
        return count;
      });
      expect(writes).toBe(1);
      const retained = await page.evaluate(() => {
        const board = document.querySelector<HTMLElement>('.board')!,
          viewport = document.querySelector('#board-viewport'),
          tile = document.querySelector('.tile[data-x="1"][data-y="1"]');
        document.querySelector<HTMLButtonElement>('#board-zoom-in')!.click();
        const same =
          board === document.querySelector('.board') && viewport === document.querySelector('#board-viewport') && tile === document.querySelector('.tile[data-x="1"][data-y="1"]');
        for (let i = 0; i < 8; i++) document.querySelector<HTMLButtonElement>('#board-zoom-in')!.click();
        const maximum = board.dataset.zoom === '200' && document.querySelector<HTMLButtonElement>('#board-zoom-in')!.disabled;
        for (let i = 0; i < 8; i++) document.querySelector<HTMLButtonElement>('#board-zoom-out')!.click();
        return { same, maximum, minimum: board.dataset.zoom === '50' && document.querySelector<HTMLButtonElement>('#board-zoom-out')!.disabled };
      });
      expect(retained).toEqual({ same: true, maximum: true, minimum: true });
      const second = page.locator('.tile[data-x="1"][data-y="1"]');
      await expect(second).toBeFocused();
      await expect(second.locator('.selected-marker')).toHaveCount(1);
      await second.press('Escape');
      await expect(page.locator('.selected-marker')).toHaveCount(0);
      await expect(second).toBeFocused();
      await second.press('Enter');
      await second.press('ArrowDown');
      const target = page.locator('.tile[data-x="1"][data-y="2"]');
      await expect(target).toBeFocused();
      await target.press('Enter');
      await expect(target.locator('.unit.red')).toHaveCount(1);
      await expect(second.locator('.unit.red')).toHaveCount(0);
      await expect(page.locator('.board')).toHaveAttribute('data-zoom', '50');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath('systems-board-response.png') });
    });
  }
