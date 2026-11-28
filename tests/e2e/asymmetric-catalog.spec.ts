import { expect, test } from '@playwright/test';

test('shows the siege and relief objectives before choosing the attacker', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-map-id="relief-corridor"]').click();
  await expect(page.locator('#briefing-title')).toHaveText('包囲された都市と救援回廊');
  await expect(page.locator('#briefing-copy')).toContainText('救援回廊の都市と補給所');
  await page.locator('[name="human-player"][value="blue"]').check();
  await expect(page.locator('#briefing-copy')).toContainText('赤司令部');
  await page.screenshot({ path: info.outputPath('systems-relief-corridor.png') });
  await page.locator('#begin-operation').click();
  await page.locator('#skip-cpu').click();
  await expect(page.locator('.turn-indicator.blue')).toBeVisible();
  await expect(page.locator('#end')).toBeEnabled();
});

test('restores oceanic and continental alliances by site after the assignment is swapped', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.addInitScript(() => localStorage.setItem('ministr.locale', 'en'));
  await page.goto('/');
  await page.locator('[data-map-id="multiplayer:ocean-alliance"]').click();
  await expect(page.locator('#briefing-title')).toHaveText('Oceanic and Continental Alliances');
  await expect(page.locator('.four-start-sites .army1 strong')).toContainText('Oceanic alliance');
  await page.locator('#four-site-marker-2').click();
  await expect(page.locator('.four-start-sites .army1 strong')).toContainText('Continental alliance');
  await expect(page.locator('.four-start-sites .army3 strong')).toContainText('Oceanic alliance');
  await page.screenshot({ path: info.outputPath('systems-ocean-alliance.png') });
  await page.locator('#four-start').click();
  await expect(page.locator('#four-board > .tile')).toHaveCount(252);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ministr.fourArmy.autosave') ?? 'null')?.archive.payload.map.match))
    .toMatchObject({
      sourceMapId: 'ocean-alliance',
      layoutVersion: 8,
      siteArmies: ['army3', 'army2', 'army1', 'army4'],
    });
  await page.reload();
  await page.locator('#title-continue').click();
  await expect(page.locator('#four-army-info > .army1')).toContainText('Continental alliance');
  await expect(page.locator('#four-board > .tile')).toHaveCount(252);
});
