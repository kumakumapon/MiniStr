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
