import { expect, test } from '@playwright/test';

test('saves the reserve commander with no units or observation before entry', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-map-id="multiplayer:delayed-power"]').click();
  await expect(page.locator('#briefing-title')).toHaveText('遅れて来る列強');
  await expect(page.locator('.briefing-objectives')).toContainText('第8ラウンド');
  await page.locator('#four-human-army').selectOption('army4');
  await page.screenshot({ path: info.outputPath('systems-delayed-power.png') });
  await page.locator('#four-start').click();
  await expect(page.locator('#four-board > .tile')).toHaveCount(252);
  await expect(page.locator('#four-board .unit')).toHaveCount(0);
  await expect(page.locator('#four-view')).toBeDisabled();
  await expect(page.locator('#four-army-info > .army4')).toContainText('参入待ち');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const record = JSON.parse(localStorage.getItem('ministr.fourArmy.autosave') ?? 'null');
        return record && { version: record.schemaVersion, view: record.view, roster: record.archive.payload.state.alive };
      }),
    )
    .toEqual({ version: 7, view: 'army4', roster: ['army1', 'army2', 'army3'] });
  await page.reload();
  await page.locator('#title-continue').click();
  await expect(page.locator('#four-army-info > .army4')).toContainText('参入待ち');
  await expect(page.locator('#four-board .unit')).toHaveCount(0);
});
