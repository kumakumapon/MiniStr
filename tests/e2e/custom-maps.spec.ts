import { expect, test } from '@playwright/test';
import { operationData } from '../../src/game/operations.fixture';

for (const width of [1280, 390]) {
  test(`deletes custom maps with confirmation and preserves saved matches at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const catalog = JSON.stringify({
      schemaVersion: 1,
      scenarios: [operationData({ id: 'custom-delete', name: '戦車' }), operationData({ id: 'custom-keep', name: '残す作戦' })],
      history: [],
    });
    await page.addInitScript((value) => {
      if (localStorage.getItem('custom-test-seeded')) return;
      localStorage.setItem('custom-test-seeded', 'true');
      localStorage.setItem('ministr.locale', 'en');
      localStorage.setItem('ministr.scenarios.custom', value);
    }, catalog);
    let accept = true;
    const confirmations: string[] = [];
    page.on('dialog', async (dialog) => {
      confirmations.push(dialog.message());
      if (accept) await dialog.accept();
      else await dialog.dismiss();
    });
    await page.goto('/');
    await expect(page.locator('[data-delete-custom-map]')).toHaveCount(2);
    await expect(page.locator('#title-delete-skirmish')).toHaveCount(0);
    await page.locator('.title-map-card[data-map-id="custom-delete"]').click();
    await page.locator('#begin-operation').click();
    await page.locator('#save').click();
    const saved = await page.evaluate(() => localStorage.getItem('ministr.save.manual'));
    expect(saved).not.toBeNull();
    await page.locator('#open-title').click();
    await page.locator('#title-delete-custom-delete').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`systems-custom-maps-${width}.png`) });
    accept = false;
    await page.locator('#title-delete-custom-delete').click();
    await expect(page.locator('#title-delete-custom-delete')).toBeFocused();
    await expect(page.locator('.title-map-card[data-map-id="custom-delete"]')).toHaveCount(1);
    expect(confirmations.at(-1)).toContain('Remove "戦車" from the map list');
    accept = true;
    await page.locator('#title-delete-custom-delete').click();
    await expect(page.locator('.title-map-card[data-map-id="custom-delete"]')).toHaveCount(0);
    await expect(page.locator('.title-map-card[data-map-id="custom-keep"]')).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('ministr.save.manual'))).toBe(saved);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.locator('#title-resume').click();
    await expect(page.locator('.battlefield-heading h2')).toHaveText('戦車');
    await page.reload();
    await expect(page.locator('.title-map-card[data-map-id="custom-delete"]')).toHaveCount(0);
    await page.locator('#title-continue').click();
    await expect(page.locator('.battlefield-heading h2')).toHaveText('戦車');
  });
}
