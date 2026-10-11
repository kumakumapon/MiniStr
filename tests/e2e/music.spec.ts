import { expect, test } from '@playwright/test';

test('keeps background music controls independent and persistent', async ({ page }) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  const effectsEnabled = page.locator('#sound-muted');
  const musicEnabled = page.locator('#music-muted');
  await expect(effectsEnabled).toBeVisible();
  await expect(musicEnabled).toBeVisible();
  await expect(effectsEnabled).toBeChecked();

  await musicEnabled.uncheck();
  await page.locator('#music-volume').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '35';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.music.settings') ?? 'null'));
  expect(settings).toEqual({ muted: true, volume: 0.35 });
  await expect(effectsEnabled).toBeChecked();
});
