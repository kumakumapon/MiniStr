import { expect, test } from '@playwright/test';

test('spectates a CPU-versus-CPU match with pause and resume (#129)', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await expect(page.locator('.briefing-overlay')).toContainText('赤軍の勝利条件');
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();

  // Red's CPU starts on its own; the viewer cannot issue commands or save.
  await expect(page.locator('.turn-indicator strong')).toHaveText('赤軍 CPU 行動中');
  await expect(page.locator('#end')).toBeDisabled();
  await expect(page.locator('#save')).toBeDisabled();

  // Turns alternate without any input until blue's CPU is playing.
  await expect(page.locator('.turn-indicator strong')).toHaveText('青軍 CPU 行動中', { timeout: 20_000 });

  // Pausing stops the loop and hands the menus back.
  await page.locator('#spectate-toggle').click();
  await expect(page.locator('#spectate-toggle')).toHaveText('観戦を再開');
  await expect(page.locator('.status-message')).toContainText('観戦を一時停止しました');
  await expect(page.locator('#skip-cpu')).toHaveCount(0);
  await expect(page.locator('#map')).toBeEnabled();
  const pausedTurn = await page.locator('.turn-indicator strong').textContent();
  await page.waitForTimeout(1_500);
  await expect(page.locator('.turn-indicator strong')).toHaveText(pausedTurn ?? '');
  await expect(page.locator('#end')).toBeDisabled();

  // Resuming continues from the same board and returns to red afterwards.
  await page.locator('#spectate-toggle').click();
  await expect(page.locator('#spectate-toggle')).toHaveText('観戦を一時停止');
  await expect(page.locator('.turn-indicator strong')).toHaveText('赤軍 CPU 行動中', { timeout: 20_000 });
});

test('spectating leaves the player’s saves untouched and keeps alternating after a skip (#129)', async ({ page }) => {
  const saveKeys = ['ministr.save.auto', 'ministr.save.manual'];
  await page.goto('/');
  await page.evaluate((keys) => keys.forEach((key) => localStorage.setItem(key, `sentinel:${key}`)), saveKeys);
  await page.reload();
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  await expect(page.locator('#save-new-slot')).toBeDisabled();

  // Skipping finishes red's turn at once; blue then plays on its own and hands back to red.
  await page.locator('#skip-cpu').click();
  await expect(page.locator('.turn-indicator strong')).toHaveText('青軍 CPU 行動中', { timeout: 20_000 });
  await expect(page.locator('.turn-indicator strong')).toHaveText('赤軍 CPU 行動中', { timeout: 20_000 });

  const stored = await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), saveKeys);
  expect(stored).toEqual(saveKeys.map((key) => `sentinel:${key}`));
});

test('sets each side’s CPU difficulty for spectating (#131)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#briefing-red-difficulty')).toHaveCount(0);
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  // A keyboard user changes a focused control; it keeps focus instead of jumping to the start button.
  await page.locator('#briefing-red-difficulty').focus();
  await page.locator('#briefing-red-difficulty').selectOption('easy');
  await expect(page.locator('#briefing-red-difficulty')).toBeFocused();
  await page.locator('#briefing-blue-difficulty').selectOption('hard');
  await expect(page.locator('.briefing-meta')).toContainText('観戦・赤軍易しい / 青軍難しい');
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();

  // The header shows both sides; changes are refused while a CPU turn runs.
  await expect(page.locator('#red-difficulty')).toHaveValue('easy');
  await expect(page.locator('#difficulty')).toHaveValue('hard');
  await expect(page.locator('#skip-cpu')).toBeVisible();
  await page.locator('#red-difficulty').selectOption('hard');
  await expect(page.locator('#red-difficulty')).toHaveValue('easy');

  // Red can be changed while paused.
  await page.locator('#spectate-toggle').click();
  await expect(page.locator('#spectate-toggle')).toHaveText('観戦を再開');
  await page.locator('#red-difficulty').selectOption('normal');
  await expect(page.locator('#red-difficulty')).toHaveValue('normal');
  await expect(page.locator('#difficulty')).toHaveValue('hard');
});
