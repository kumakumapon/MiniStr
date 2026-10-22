import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`shares title speed and plays at half-size on ${viewport.width}px screens`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#title-cpu-speed')).toHaveValue('1');
    await page.locator('#title-cpu-speed').focus();
    await page.locator('#title-cpu-speed').selectOption('4');
    await expect(page.locator('#title-cpu-speed')).toBeFocused();
    await page.locator('.title-menu').screenshot({ path: testInfo.outputPath('systems-title-cpu-speed.png') });
    await page.locator('.title-map-card[data-map-id="skirmish"]').click();
    await page.locator('#begin-operation').click();
    await expect(page.locator('#cpu-speed')).toHaveValue('4');
    await page.locator('#cpu-speed').selectOption('2');
    await page.locator('#open-title').click();
    await expect(page.locator('#title-cpu-speed')).toHaveValue('2');
    await page.locator('#title-cpu-speed').selectOption('0.5');
    await page.locator('#title-resume').click();
    await expect(page.locator('#cpu-speed')).toHaveValue('0.5');

    for (let step = 0; step < 6 && (await page.locator('#board-zoom-out').isEnabled()); step++) await page.locator('#board-zoom-out').click();
    await expect(page.locator('.board')).toHaveAttribute('data-zoom', '50');
    await expect(page.locator('#board-zoom-out')).toBeDisabled();
    const small = await page.locator('.tile').first().boundingBox();
    expect(small!.width).toBe(22);
    expect(small!.height).toBe(22);
    await page.locator('.tile[data-x="0"][data-y="1"]').click();
    await page.locator('.tile[data-x="0"][data-y="2"]').click();
    await expect(page.locator('.status-message')).toContainText('移動しました');
    await expect(page.locator('.tile[data-x="0"][data-y="2"] .unit.red')).toBeVisible();
    await page.locator('.battlefield-stage').screenshot({ path: testInfo.outputPath('systems-map-50-percent.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.setViewportSize({ width: viewport.width === 390 ? 430 : 1440, height: viewport.height });
    await expect(page.locator('.board')).toHaveAttribute('data-zoom', '50');
    await page.locator('#board-zoom-in').click();
    await page.locator('#board-zoom-in').click();
    await expect(page.locator('.board')).toHaveAttribute('data-zoom', '100');
    expect((await page.locator('.tile').first().boundingBox())!.width).toBe(44);
  });
}
