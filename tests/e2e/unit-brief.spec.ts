import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`keeps selected-unit information beside the map at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#title-training').click();
    await page.locator('#begin-operation').click();
    await page.locator('.tile[data-x="3"][data-y="1"]').click();
    const brief = page.locator('#unit-brief');
    await expect(brief).toContainText('戦車砲');
    await expect(brief).toContainText('6 / 6');
    const selected = await brief.getAttribute('data-unit-id');
    // Inspecting an empty destination must keep the selected unit's quick information.
    await page.locator('.tile[data-x="3"][data-y="2"]').focus();
    await expect(brief).toHaveAttribute('data-unit-id', selected!);
    if (viewport.width === 390) {
      await page.locator('#mobile-panel').click();
      await expect(page.locator('#command-panel')).toHaveAttribute('data-sheet', 'open');
      await expect(brief).toBeInViewport();
    } else {
      const layout = await page.evaluate(() => {
        const brief = document.querySelector('#unit-brief')!.getBoundingClientRect();
        const map = document.querySelector('#board-viewport')!.getBoundingClientRect();
        return { gap: brief.left - map.right, overlap: Math.min(map.bottom, brief.bottom) - Math.max(map.top, brief.top) };
      });
      expect(layout.gap).toBeGreaterThanOrEqual(0);
      expect(layout.gap).toBeLessThanOrEqual(32);
      expect(layout.overlap).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    await page.screenshot({ path: testInfo.outputPath('unit-information-near-map.png') });
  });
}
