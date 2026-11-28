import { expect, test } from '@playwright/test';

for (const locale of ['ja', 'en'] as const) {
  test(`browse and combine battlefield filters with the keyboard in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((language) => localStorage.setItem('ministr.locale', language), locale);
    await page.goto('/');
    const catalog = page.locator('#title-catalog');
    await catalog.getByRole('tab', { selected: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#title-category-battle')).toBeFocused();
    await expect(page.locator('#title-category-battle')).toHaveAttribute('aria-selected', 'true');
    await catalog.locator('summary').click();
    await page.locator('#title-filter-armies').selectOption('4');
    await page.locator('#title-filter-size').selectOption('wide');
    const result = catalog.locator('.title-map-card');
    await expect(result).toHaveCount(2);
    await expect(result.first()).toContainText('32×32');
    await expect(result.first().locator('.map-preview-property').first()).toBeVisible();
    await expect(result.first().locator('.map-preview-terrain, .map-preview-unit')).toHaveCount(0);
    await page.locator('#title-filter-terrain').selectOption('water');
    await expect(result).toHaveCount(0);
    await expect(catalog.getByRole('status')).toHaveText(locale === 'ja' ? '該当する戦域がありません。' : 'No matching battlefields.');
    await page.locator('#title-filter-reset').click();
    await expect(page.locator('#title-category-battle')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#title-filter-armies').selectOption('3');
    await catalog.locator('[data-map-id="skirmish"]').click();
    await expect(page.locator('#four-variants input:checked')).toHaveValue('3');
    await page.locator('#four-close').click();
    await expect(catalog.locator('[data-map-id="skirmish"]')).toBeFocused();
    await expect(page.locator('#title-filter-armies')).toHaveValue('3');
    await page.locator('#title-filter-reset').click();
    await page.locator('#title-category-exercise').click();
    await expect(catalog.locator('[data-map-id="tactics-logistics"]')).toBeVisible();
    await page.locator('#title-filter-clear').selectOption('cleared');
    await expect(result).toHaveCount(0);
    await page.locator('#title-filter-clear').selectOption('uncleared');
    await expect(catalog.locator('[data-map-id="tactics-logistics"]')).toBeVisible();
  });
}
