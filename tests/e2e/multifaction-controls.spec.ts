import { expect, type Page } from '@playwright/test';
import { test } from './helpers/engineTest';
import { fourArmyBattleFixture } from './helpers/fourArmyBattleFixture';
import { freezeSceneClock } from './helpers/sceneClock';

test.describe.configure({ mode: 'parallel' });
async function title(page: Page, locale: 'ja' | 'en') {
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript((language) => localStorage.setItem('ministr.locale', language), locale);
  await page.goto('/');
}
async function disclosures(page: Page, selector: string) {
  await page.locator(selector).evaluate((details) => ((details as HTMLDetailsElement).open = true));
}
for (const { width, locale } of [
  { width: 390, locale: 'ja' },
  { width: 1280, locale: 'en' },
] as const) {
  test(`multi-army preferences, tile inspection and turn controls ${width}/${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const original = { muted: true, volume: 0.44, fieldTrack: 'dawn', armyTracks: true, blueFieldTrack: 'rock-blue' };
    await page.addInitScript((value) => localStorage.setItem('ministr.music.settings', JSON.stringify(value)), original);
    await title(page, locale);
    await page.locator('#title-cpu-speed').selectOption('4');
    await page.locator('#title-board-zoom').selectOption('150');
    await page.locator('#title-four-army').click();
    await disclosures(page, '#four-music-settings');
    await expect(page.locator('#four-music-on')).not.toBeChecked();
    await expect(page.locator('#four-music-army4')).toBeDisabled();
    await page.locator('#four-music-by-army').check();
    await page.locator('#four-music-army4').selectOption('mist');
    await page.locator('#four-music-shared').selectOption('drive');
    await page.locator('#four-music-volume').evaluate((e) => {
      (e as HTMLInputElement).value = '30';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#four-map').selectOption(width === 390 ? 'compact' : 'strait');
    await page.locator('#four-start').click();
    await expect(page.locator('#four-speed')).toHaveValue('4');
    await expect(page.locator('#four-zoom-label')).toHaveText('150%');
    await expect(page.locator('#four-board > button').first()).toHaveCSS('width', '66px');
    await disclosures(page, '#four-terrain-legend');
    await expect(page.locator('#four-terrain-legend')).toContainText(locale === 'ja' ? '森林' : 'Forest');
    await page.locator('#four-board .unit.army1').first().locator('..').click();
    await disclosures(page, '#four-tile-info');
    await expect(page.locator('#four-tile-rows')).toContainText(locale === 'ja' ? '移動コスト' : 'Move cost');
    await expect(page.locator('#four-tile-rows')).toContainText(locale === 'ja' ? '地形防御' : 'Terrain defense');
    await disclosures(page, '#four-music-settings');
    await expect(page.locator('#four-music-army4')).toHaveValue('mist');
    await expect(page.locator('#four-music-volume')).toHaveValue('30');
    await page.locator('#four-music-settings').screenshot({ path: info.outputPath(`systems-v161-music-${width}.png`), animations: 'disabled' });
    await page.locator('#four-tile-info').screenshot({ path: info.outputPath(`systems-v161-tile-${width}.png`), animations: 'disabled' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`systems-v161-controls-${width}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    if (width === 390) {
      const end = page.locator('#four-mobile-host [data-quick-action="endTurn"]');
      await expect(end).toHaveCSS('background-color', 'rgb(201, 68, 55)');
      await freezeSceneClock(page);
      await end.click();
      await expect(page.locator('#four-mobile-toggle')).toHaveClass(/mobile-action-primary/);
      await expect(end).toHaveCount(0);
      await expect(page.locator('#four-mobile-host .mobile-action-primary')).toHaveCount(1);
    }
    await page.reload();
    await page.locator('#title-four-army').click();
    await disclosures(page, '#four-music-settings');
    await expect(page.locator('#four-music-by-army')).toBeChecked();
    await expect(page.locator('#four-music-army4')).toHaveValue('mist');
    await expect(page.locator('#four-music-shared')).toHaveValue('drive');
    await expect(page.locator('#four-music-volume')).toHaveValue('30');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.music.settings')!))).toEqual(original);
  });
}

test('visible enemy danger and tile information stay scoped to the viewed army and saved CPU speed', async ({ page }, info) => {
  const fixture = fourArmyBattleFixture('army1');
  await page.setViewportSize({ width: 1280, height: 844 });
  await title(page, 'en');
  await page.locator('#title-cpu-speed').selectOption('0.5');
  await page.locator('#title-four-army').click();
  await disclosures(page, '.four-tools');
  await page.locator('#four-file').setInputFiles({ name: 'front.json', mimeType: 'application/json', buffer: Buffer.from(fixture.text) });
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  await expect(page.locator('#four-speed')).toHaveValue('4');
  await page.locator('#four-show-threats').check();
  await expect(page.locator('#four-threat-hint')).toBeVisible();
  await expect(page.locator('#four-board .enemy-attack-zone').first()).toBeAttached();
  await expect(page.locator('#four-board .tile.fog .unit')).toHaveCount(0);
  const unseen = page.locator('#four-board .tile.fog').first();
  await unseen.click();
  await disclosures(page, '#four-tile-info');
  await expect(page.locator('#four-tile-rows')).toContainText('Unseen.');
  await expect(page.locator('#four-tile-rows')).not.toContainText('Visible unit');
  await expect(page.locator('#four-tile-rows')).not.toContainText('Capture remaining');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('systems-v161-visible-threat.png'), animations: 'disabled' });
  await page.locator('#four-show-threats').uncheck();
  await expect(page.locator('#four-board .enemy-attack-zone')).toHaveCount(0);
});
