import { expect, test } from '@playwright/test';

test('picks a map on the title screen, goes back from the briefing, and starts (#143)', async ({ page }) => {
  await page.goto('/');
  const title = page.locator('.title-overlay');
  await expect(title).toBeVisible();
  await expect(page.locator('.briefing-overlay')).toHaveCount(0);
  expect(await page.locator('.title-map-card').count()).toBeGreaterThanOrEqual(11);
  await expect(page.locator('#title-continue')).toBeDisabled();

  const landing = page.locator('.title-map-card[data-map-id="landing"]');
  await expect(landing).toContainText('海峡上陸作戦');
  await expect(landing).toContainText('18ターン制限');
  await landing.click();
  await expect(page.locator('#briefing-title')).toHaveText('海峡上陸作戦');

  // The briefing leads back to the map list, which now marks the last choice.
  await page.locator('#briefing-back-to-title').click();
  await expect(title).toBeVisible();
  await expect(page.locator('.title-map-card[aria-current="true"]')).toHaveAttribute('data-map-id', 'landing');

  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  await expect(page.locator('.battlefield-heading h2')).toHaveText('緑の国境');
});

test('opens the title during a match and returns to the same match (#143)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  await page.locator('.tile[data-x="0"][data-y="1"]').click();
  await page.locator('.tile[data-x="0"][data-y="2"]').click();
  await expect(page.locator('.status-message')).toContainText('移動しました');

  await page.locator('#open-title').click();
  await expect(page.locator('#title-resume')).toBeFocused();
  await page.locator('#title-resume').click();
  await expect(page.locator('.title-overlay')).toHaveCount(0);
  // The moved infantry is still where it went.
  await expect(page.locator('.tile[data-x="0"][data-y="2"] .unit.red')).toBeVisible();
});

test('returns to the title from the campaign menu and the editor (#143)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#title-campaign').click();
  await expect(page.locator('.campaign-overlay')).toBeVisible();
  await page.locator('#campaign-close').click();
  await expect(page.locator('.title-overlay')).toBeVisible();

  await page.locator('#title-editor').click();
  await expect(page.locator('.editor-overlay')).toBeVisible();
  await page.locator('#editor-close').click();
  await expect(page.locator('.title-overlay')).toBeVisible();
});

test('works from the keyboard alone (#143)', async ({ page }) => {
  await page.goto('/');
  // Focus starts on the last chosen map, the first one at start.
  await expect(page.locator('.title-map-card[data-map-id="skirmish"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.title-map-card[data-map-id="islands"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#briefing-title')).toHaveText('群島補給線');
});

test('fits a phone screen without horizontal scrolling (#143)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.title-overlay')).toBeVisible();
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    screen: document.querySelector('.title-screen')!.scrollWidth,
    screenBox: document.querySelector('.title-screen')!.clientWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  expect(widths.screen).toBeLessThanOrEqual(widths.screenBox);
  const [first, second] = await page.locator('.title-map-card').evaluateAll((cards) => cards.slice(0, 2).map((card) => card.getBoundingClientRect().left));
  // One column: the cards line up vertically.
  expect(first).toBe(second);
});
