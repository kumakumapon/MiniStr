import { expect, test } from '@playwright/test';

test('starts Canal Crossing and restores the public four-round objective', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('[data-map-id="multiplayer:canal-crossroads"]').click();
  await expect(page.locator('#briefing-title')).toHaveText('運河の要衝');
  await expect(page.locator('.briefing-objectives')).toContainText('4回連続');
  await page.screenshot({ path: info.outputPath('systems-canal-objective.png') });
  await page.locator('#four-start').click();
  await expect(page.locator('#four-board > .tile')).toHaveCount(252);
  await page.locator('.four-objectives summary').click();
  await expect(page.locator('#four-hold-progress')).toHaveText('中立 · 0/4');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ministr.fourArmy.autosave') ?? 'null')?.archive.payload.map.match))
    .toMatchObject({ sourceMapId: 'canal-crossroads', layoutVersion: 9, ending: 'unlimited', objective: { rounds: 4 } });
  await page.reload();
  await page.locator('#title-continue').click();
  await expect(page.locator('#four-board > .tile')).toHaveCount(252);
  await expect(page.locator('#four-hold-progress')).toHaveText('中立 · 0/4');
});
