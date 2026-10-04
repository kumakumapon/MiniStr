import { expect, test, type Page } from '@playwright/test';

/** During a handoff nothing that carries match information may be in the page. */
async function expectConcealed(page: Page, side: string): Promise<void> {
  await expect(page.locator('#handoff-start')).toBeVisible();
  await expect(page.locator('#handoff-title')).toHaveText(`${side}の番です`);
  for (const selector of ['.tile', '.unit', '#command-panel', '.tile-inspector', '.unit-queue-card', '.mobile-action-bar', '.status-message']) {
    await expect(page.locator(selector), selector).toHaveCount(0);
  }
}

test('plays a two-player hotseat match without revealing either side across handoffs', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('input[name="match-mode"][value="hotseat"]').check();
  await expect(page.locator('.briefing-overlay')).toContainText('赤軍の勝利条件');
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  await expect(page.locator('.turn-indicator strong')).toHaveText('赤軍');

  // Red moves an infantry unit and ends the turn.
  await page.locator('.tile[data-x="0"][data-y="1"]').click();
  await page.locator('.tile[data-x="0"][data-y="2"]').click();
  await expect(page.locator('.status-message')).toContainText('移動しました');
  await page.locator('#end').click();
  await expectConcealed(page, '青軍');

  // Blue takes the device and sees its own side.
  await page.locator('#handoff-start').click();
  await expect(page.locator('.turn-indicator strong')).toHaveText('青軍');
  await expect(page.locator('.unit.blue').first()).toBeVisible();
  await expect(page.locator('#undo')).toBeDisabled();
  // Blue's own units carry the 自 marker, and red units in blue's fog are not drawn.
  await expect(page.locator('.unit.blue .unit-owner-marker').first()).toHaveText('自');
  await expect(page.locator('.tile.fog .unit.red')).toHaveCount(0);
  await expect(page.locator('.map-legend')).toContainText('自軍（青軍）');
  await page.locator('.tile[data-x="9"][data-y="6"]').click();
  await expect(page.locator('.status-message')).toContainText('選択しました');
  await page.locator('.tile[data-x="8"][data-y="5"]').click();
  await expect(page.locator('.status-message')).toContainText('移動しました');

  // A saved hotseat match resumes behind the handoff screen.
  await page.locator('#save').click();
  await expect(page.locator('.status-message')).toContainText('セーブしました');
  await page.reload();
  await page.locator('#title-continue').click();
  await expectConcealed(page, '青軍');
  await page.locator('#handoff-start').click();

  // Ending blue's turn hands the device back to red.
  await page.locator('#end').click();
  await expectConcealed(page, '赤軍');
  await page.locator('#handoff-start').click();
  await expect(page.locator('.turn-indicator strong')).toHaveText('赤軍');
});
