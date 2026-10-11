import { expect, test } from '@playwright/test';

test('opens production at a facility and keeps the menu open across consecutive builds', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('#begin-operation').click();
  const factory = page.locator('.tile[data-x="1"][data-y="0"]');
  await factory.click();
  const menu = page.getByRole('dialog', { name: 'ユニット生産' });
  await expect(menu).toBeVisible();
  await expect(page.locator('#production-facility')).toHaveValue('1,0');
  await expect(menu.locator('.produce-fighter')).toHaveCount(0);
  await menu.locator('.produce-infantry').click();
  await expect(menu).toBeVisible();
  await expect(page.locator('#production-facility')).toHaveValue('0,2');
  await expect(menu.getByRole('status')).toContainText('歩兵を生産しました');
  await page.screenshot({ path: testInfo.outputPath('desktop-production.png') });
  await menu.locator('.produce-infantry').click();
  await expect(page.locator('#production-facility')).toHaveValue('3,0');
  await expect(menu.locator('.produce-infantry')).toHaveCount(0);
  await expect(page.locator('.tile[data-x="1"][data-y="0"] .unit-infantry')).toHaveCount(1);
  await expect(page.locator('.tile[data-x="0"][data-y="2"] .unit-infantry')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(factory).toBeFocused();
});

test('switches facility rosters and disables unaffordable production', async ({ page }) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('#begin-operation').click();
  await page.locator('#open-production').click();
  await page.locator('#production-facility').selectOption('3,0');
  const menu = page.locator('#production-menu');
  await expect(menu.locator('.produce-infantry')).toHaveCount(0);
  await expect(menu.locator('.produce-bomber')).toBeDisabled();
  await expect(menu.locator('.produce-bomber')).toContainText('資金不足');
  await page.keyboard.press('Tab');
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await page.locator('#production-menu-close').click();
  await expect(page.locator('#open-production')).toBeFocused();
});

test('mobile consecutive production preserves page and both board scroll axes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('#begin-operation').click();
  for (let i = 0; i < 3; i++) {
    const zoom = page.locator('#board-zoom-in');
    if (await zoom.isEnabled()) await zoom.click();
  }
  await page.locator('#board-viewport').evaluate((element) => {
    element.scrollLeft = 180;
    element.scrollTop = 80;
  });
  await page.evaluate(() => window.scrollTo(0, 300));
  const position = await page.evaluate(() => {
    const board = document.querySelector('#board-viewport')!;
    return { left: board.scrollLeft, top: board.scrollTop, page: window.scrollY };
  });
  expect(position.left).toBeGreaterThan(0);
  expect(position.top).toBeGreaterThan(0);
  await page.locator('#mobile-production').click();
  const menu = page.locator('#production-menu');
  await menu.locator('.produce-infantry').click();
  await menu.locator('.produce-infantry').click();
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: testInfo.outputPath('mobile-production.png') });
  await page.locator('#production-menu-close').click();
  await expect(page.locator('#mobile-production')).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const board = document.querySelector('#board-viewport')!;
        return { left: board.scrollLeft, top: board.scrollTop, page: window.scrollY };
      }),
    )
    .toEqual(position);
  await page.screenshot({ path: testInfo.outputPath('mobile-return-to-board.png') });
});
