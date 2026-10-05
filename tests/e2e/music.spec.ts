import { expect, test } from '@playwright/test';

test('keeps background music controls independent and persistent', async ({ page }) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  const effectsMute = page.locator('#sound-muted');
  const musicMute = page.locator('#music-muted');
  await expect(effectsMute).toBeVisible();
  await expect(musicMute).toBeVisible();
  await expect(effectsMute).not.toBeChecked();

  await musicMute.check();
  await page.locator('#music-volume').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '35';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.music.settings') ?? 'null'));
  expect(settings).toEqual({ muted: true, volume: 0.35 });
  await expect(effectsMute).not.toBeChecked();
});
