import { expect, test } from '@playwright/test';

for (const locale of ['ja', 'en'] as const) {
  test(`central power starting resources follow the selected site in ${locale}`, async ({ page }) => {
    await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
    await page.goto('/');
    await page.locator('[data-map-id="multiplayer:crown"]').click();
    await expect(page.locator('#briefing-title')).toHaveText(locale === 'ja' ? '中央の大国' : 'Central Power');
    await expect(page.locator('#four-variants input')).toHaveCount(1);
    const row = (army: number) => page.locator(`.four-start-sites li.army${army}`);
    await expect(row(1)).toContainText('8,000G');
    await expect(row(2)).toContainText('6,000G');
    await expect(row(1)).toContainText(locale === 'ja' ? '都市 ×5' : 'City ×5');
    await page.locator('#four-site-marker-2').click();
    await expect(page.locator('#four-site-army1')).toHaveValue('2');
    await expect(row(3)).toContainText('8,000G');
    await expect(row(1)).toContainText('6,000G');
    await expect(page.locator('.four-site-map .map-preview-unit')).toHaveCount(0);
    await page.locator('#four-start').click();
    await expect(page.locator('#four-board > button')).toHaveCount(252);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const data = JSON.parse(localStorage.getItem('ministr.fourArmy.autosave') ?? 'null');
          return data?.archive.payload.map.players.army3.gold;
        }),
      )
      .toBe(8000);
  });
}
