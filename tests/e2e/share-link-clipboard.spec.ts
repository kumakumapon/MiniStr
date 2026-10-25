import { expect, test } from '@playwright/test';

// Real clipboard permissions are granted by Chromium only; share-link.spec.ts covers the stubbed copy in every browser.
test('a copied link opens the same operation in a fresh browser context', async ({ page, browser }) => {
  const context = page.context();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.locator('#title-generator summary').click();
  await page.locator('#title-generator-seed').fill('Round-1');
  await page.locator('#title-generator-copy-link').click();
  await expect(page.locator('#title-generator-link-status')).toHaveText('共有リンクをコピーしました。');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(link);
  await expect(second.locator('.share-link-facts')).toContainText('Round-1');
  await second.locator('#share-link-confirm').click();
  await expect(second.locator('#briefing-title')).toContainText('Round-1');
  await other.close();
});
