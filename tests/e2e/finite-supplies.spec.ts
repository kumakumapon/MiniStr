import { expect, test } from '@playwright/test';

for (const width of [1280, 390])
  for (const mode of ['finite', 'unlimited']) {
    test(`starts and resumes ${mode} APC supplies at ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => localStorage.setItem('ministr.locale', 'en'));
      await page.goto('/');
      await page.locator('#title-training').click();
      await page.locator('#briefing-supply-mode').selectOption(mode);
      await expect(page.locator('#briefing-supply-mode')).toBeFocused();
      await page.locator('#begin-operation').click();
      await page.locator('.tile[data-x="1"][data-y="1"]').click();
      const stock = page.locator('#unit-brief dt', { hasText: 'Supply stock' });
      await expect(stock).toHaveCount(mode === 'finite' ? 1 : 0);
      if (mode === 'finite') await expect(page.locator('#unit-brief')).toContainText('300 / 300');
      await page.screenshot({ path: testInfo.outputPath(`systems-supplies-${mode}-${width}.png`) });
      await page.locator('#save').click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!).initialState.ruleVersion)).toBe(mode === 'finite' ? 11 : 9);
      await page.reload();
      await page.locator('#title-continue').click();
      await page.locator('.tile[data-x="1"][data-y="1"]').click();
      await expect(stock).toHaveCount(mode === 'finite' ? 1 : 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }
