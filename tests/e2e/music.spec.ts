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
  expect(settings).toEqual({ muted: true, volume: 0.35, fieldTrack: 'march' });
  await expect(effectsEnabled).toBeChecked();
});

test('lets the player choose a field track and keeps it after reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  const track = page.locator('#music-track');
  await expect(track).toHaveValue('march');
  await expect(track.locator('option')).toHaveCount(3);

  await track.selectOption('drive');
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.music.settings') ?? 'null'));
  expect(settings.fieldTrack).toBe('drive');

  await page.reload();
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  await expect(page.locator('#music-track')).toHaveValue('drive');
});
