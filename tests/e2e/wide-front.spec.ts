import { expect, test, type Page } from '@playwright/test';

async function openTitle(page: Page, width: number, locale: string): Promise<void> {
  page.on('dialog', (dialog) => dialog.accept());
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
  const now = new Date('2026-11-01T00:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await page.goto('/');
  await expect(page.locator('.board .tile')).toHaveCount(0);
}

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`plays and observes a wide front in ${locale} at ${width}`, async ({ page }, testInfo) => {
      await openTitle(page, width, locale);
      await test.step('start a 32×32 spectator map and preserve its board when zooming', async () => {
        await page.locator('.title-map-card[data-map-id="wide-front"]').click();
        await page.locator('input[name="match-mode"][value="spectate"]').check();
        await page.locator('#begin-operation').click();
        await expect(page.locator('.board .tile')).toHaveCount(1024);
        // Worker completion is independent of Playwright's paused timer clock.
        // Isolate zoom identity from legitimate CPU state updates.
        await page.locator('#spectate-toggle').click();
        await expect(page.locator('#spectate-toggle')).toHaveAttribute('aria-pressed', 'true');
        const board = await page.locator('.board').elementHandle();
        await page.locator('#board-zoom-in').click();
        expect(await board!.evaluate((node) => node === document.querySelector('.board'))).toBe(true);
      });
      await test.step('advance the CPU and locate a distant unit within the map viewport', async () => {
        await page.locator('#spectate-toggle').click();
        await expect(page.locator('#spectate-toggle')).toHaveAttribute('aria-pressed', 'false');
        await page.clock.runFor(400);
        await expect(page.locator('.spectate-current')).toHaveCount(1);
        await page.locator('#spectate-toggle').click();
        await page.locator('#spectate-whole-board').click();
        await page.locator('#spectate-locate-unit').selectOption('b1');
        await expect(page.locator('#spectate-follow')).toHaveAttribute('aria-pressed', 'false');
        const contained = await page.locator('.tile[data-x="21"][data-y="17"]').evaluate((tile) => {
          const viewport = document.querySelector<HTMLElement>('#board-viewport')!;
          const frame = viewport.getBoundingClientRect(),
            rect = tile.getBoundingClientRect();
          return rect.left >= frame.left && rect.top >= frame.top && rect.right <= frame.right && rect.bottom <= frame.bottom;
        });
        expect(contained).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        await page.locator('#board-viewport').scrollIntoViewIfNeeded();
        await page.locator('.battlefield-wrap').screenshot({ path: testInfo.outputPath('systems-wide-front.png') });
      });
      await test.step('return from the title with the same map scroll position', async () => {
        const scroll = await page.locator('#board-viewport').evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
        await page.locator('#open-title').click();
        await expect(page.locator('.board .tile')).toHaveCount(1024);
        await expect(page.locator('main')).toHaveAttribute('inert', '');
        await page.locator('#title-resume').click();
        expect(await page.locator('#board-viewport').evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }))).toEqual(scroll);
      });
    });

    test(`generates, persists and plays a 32×32 map in ${locale} at ${width}`, async ({ page }) => {
      await openTitle(page, width, locale);
      await test.step('generate and save a 32×32 custom map', async () => {
        await page.locator('#title-generator summary').click();
        await page.locator('#title-generator-size').selectOption('32');
        await page.locator('#title-generator-seed').fill('Wide-UI');
        await page.locator('#title-generator-create').click();
        await expect(page.locator('#begin-operation')).toBeVisible();
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.scenarios.custom')!).scenarios);
        expect(saved.some((map: { board: { width: number; height: number } }) => map.board.width === 32 && map.board.height === 32)).toBe(true);
      });
      await test.step('reload and start the persisted map in hotseat mode', async () => {
        await page.reload();
        await page.locator('.title-map-card[data-map-id="generated-v2-32-coast-Wide-UI"]').click();
        await page.locator('input[name="match-mode"][value="hotseat"]').check();
        await page.locator('#begin-operation').click();
        await expect(page.locator('.board .tile')).toHaveCount(1024);
      });
    });
  }
