import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`plays and resumes an expanded battlefield at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('.title-map-card[data-map-id="siege"]').click();
    await page.locator('input[name="match-mode"][value="hotseat"]').check();
    await page.locator('#begin-operation').click();
    await expect(page.locator('.board .tile')).toHaveCount(22 * 16);
    await page.locator('.tile[data-x="0"][data-y="1"]').click();
    await page.locator('.tile[data-x="0"][data-y="2"]').click();
    await expect(page.locator('.status-message')).toContainText('移動しました');
    await page.locator('#save').click();
    await page.reload();
    await page.locator('#title-continue').click();
    await page.locator('#handoff-start').click();
    await expect(page.locator('.tile[data-x="0"][data-y="2"] .unit.red')).toBeVisible();
    await page.locator('#end').click();
    await page.locator('#handoff-start').click();
    const blueInfantry = page.locator('.tile[data-x="21"][data-y="14"]');
    await blueInfantry.click();
    await expect(page.locator('.status-message')).toContainText('選択しました');
    const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
    await page.screenshot({ path: testInfo.outputPath('expanded-blue-turn.png') });
    await page.locator('.tile[data-x="20"][data-y="13"]').click();
    await expect(page.locator('.status-message')).toContainText('移動しました');
  });
}
