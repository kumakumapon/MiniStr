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
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!).initialState.ruleVersion)).toBe(mode === 'finite' ? 12 : 9);
      await page.reload();
      await page.locator('#title-continue').click();
      await page.locator('.tile[data-x="1"][data-y="1"]').click();
      await expect(stock).toHaveCount(mode === 'finite' ? 1 : 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }

for (const width of [390, 1280])
  for (const locale of ['ja', 'en']) {
    test(`configures logistics, filters and resumes at ${width}/${locale}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
      await page.goto('/');
      await page.locator('.title-map-card[data-map-id="tactics-logistics"]').click();
      await page.locator('#begin-operation').click();
      await page.locator('#logistics-roster summary').click();
      const roster = page.locator('#logistics-roster');
      await expect(roster.locator('[data-logistics-row]')).toHaveCount(5);
      await roster.locator('[data-unit="r3"][data-logistics-field="priority"]').selectOption('true');
      await expect(roster).toHaveAttribute('open', '');
      await roster.locator('[data-unit="r2"][data-logistics-field="resource"]').selectOption('fuel');
      await roster.locator('[data-unit="r2"][data-logistics-field="repair"]').selectOption('false');
      await page.locator('#repair-reserve').fill('1000');
      await page.locator('#repair-reserve').press('Tab');
      await roster.locator('[data-logistics-select="r3"]').click();
      await expect(page.locator('.tile.selected')).toHaveAttribute('data-x', '2');
      if (locale === 'en') expect(await roster.innerText()).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
      await page.locator('#save').click();
      await page.screenshot({ path: info.outputPath(`systems-logistics-${width}-${locale}.png`) });
      await page.reload();
      await page.locator('#title-continue').click();
      if (!(await roster.getAttribute('open'))) await roster.locator('summary').click();
      await expect(roster.locator('[data-unit="r3"][data-logistics-field="priority"]')).toHaveValue('true');
      await expect(roster.locator('[data-unit="r2"][data-logistics-field="resource"]')).toHaveValue('fuel');
      await expect(roster.locator('[data-unit="r2"][data-logistics-field="repair"]')).toHaveValue('false');
      await expect(page.locator('#repair-reserve')).toHaveValue('1000');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
