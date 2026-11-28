import { expect } from '@playwright/test';
import { test } from './helpers/engineTest';

for (const armies of [2, 4] as const) {
  for (const width of [1280, 390]) {
    test(`shows the board, commands and information for ${armies} armies at ${width}px`, async ({ page }, info) => {
      const locale = width === 390 ? 'ja' : 'en';
      await page.addInitScript((language) => localStorage.setItem('ministr.locale', language), locale);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.goto('/');
      await page.locator('.title-map-card[data-map-id="canyon"]').click();
      if (armies === 4) await page.locator('#briefing-match-variants label:has(input[value="4"])').click();
      await page.locator(armies === 2 ? '#begin-operation' : '#four-start').click();

      const match = page.locator(armies === 2 ? '.game-shell' : '#four-army-screen');
      const board = match.locator('.board-viewport');
      const position = await board.boundingBox();
      expect(position!.y).toBeLessThan(400);
      expect(position!.height).toBeGreaterThan(240);
      const status = match.locator('.hud-status');
      await expect(status.locator('.end-turn')).toBeEnabled();
      await expect(status).toBeInViewport();
      await expect(match.locator('.hud-panel .end-turn[data-human-action="endTurn"], #board-end-turn')).toHaveCount(0);
      const help = match.locator('.hud-help');
      await help.locator('summary').press('Enter');
      await expect(help.locator('p')).toBeVisible();
      await help.locator('summary').press('Enter');
      await page.screenshot({ path: info.outputPath(`systems-match-hud-${armies}-${width}-${locale}.png`) });

      const panel = match.locator('.hud-panel');
      if (width === 390) {
        await match.locator(armies === 2 ? '#mobile-panel' : '#four-mobile-panel').click();
        await expect(panel).toHaveAttribute('data-sheet', 'open');
      }
      for (const key of ['units', 'production', 'info', 'objectives']) {
        await panel.locator(`[data-hud-page="${key}"]`).click();
        await expect(panel.locator(`[data-hud-section="${key}"]`)).toHaveAttribute('aria-current', 'true');
      }
      await status.locator('[data-hud-menu]').click();
      await expect(panel.locator('[data-hud-section="menu"]')).toHaveAttribute('aria-current', 'true');
      await expect(panel.locator(armies === 2 ? '#diagnostics-export' : '#four-diagnostics')).toHaveCount(1);
      if (width === 390) {
        await panel.locator('[data-hud-close]').press('Enter');
        await expect(panel).toHaveAttribute('data-sheet', 'closed');
        await expect(match.locator(armies === 2 ? '#mobile-panel' : '#four-mobile-panel')).toBeFocused();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}
