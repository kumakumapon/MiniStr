import { expect, test } from '@playwright/test';

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`plays and observes a wide front in ${locale} at ${width}`, async ({ page }, testInfo) => {
      page.on('dialog', (dialog) => dialog.accept());
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.goto('/');
      await expect(page.locator('.board .tile')).toHaveCount(0);
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
      const scroll = await page.locator('#board-viewport').evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
      await page.locator('#open-title').click();
      await expect(page.locator('.board .tile')).toHaveCount(0);
      await page.locator('#title-resume').click();
      expect(await page.locator('#board-viewport').evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }))).toEqual(scroll);
      await page.locator('#open-title').click();
      await page.locator('#title-generator summary').click();
      await page.locator('#title-generator-size').selectOption('32');
      await page.locator('#title-generator-seed').fill('Wide-UI');
      await page.locator('#title-generator-create').click();
      await expect(page.locator('#begin-operation')).toBeVisible();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.scenarios.custom')!).scenarios);
      expect(saved.some((map: { board: { width: number; height: number } }) => map.board.width === 32 && map.board.height === 32)).toBe(true);
      await page.reload();
      await page.locator('.title-map-card[data-map-id="generated-v2-32-coast-Wide-UI"]').click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      await page.locator('#begin-operation').click();
      await expect(page.locator('.board .tile')).toHaveCount(1024);
    });
  }
