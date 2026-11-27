import { expect } from '@playwright/test';
import { test } from './helpers/engineTest';
import { parseFourArmySpectatorSave } from '../../src/game/fourArmySpectatorSave';
test.describe.configure({ mode: 'parallel' });
for (const source of ['canyon', 'marsh']) {
  test(`starts standard ${source} in two clicks`, async ({ page }) => {
    await page.goto('/');
    await page.locator(`.title-map-card[data-map-id="${source}"]`).click();
    await expect(page.locator('#briefing-match-variants')).toHaveValue('standard');
    await expect(page.locator('#briefing-match-variants option')).toHaveCount(3);
    await page.getByRole('button', { name: /単体作戦を開始/ }).click();
    await expect(page.locator('.battlefield-heading h2')).toContainText(source === 'canyon' ? '峡谷の関門' : '湿地の突破');
  });
  test(`assigns ${source} sites independently of initiative and restores the record`, async ({ page }, info) => {
    const count = source === 'canyon' ? 3 : 4,
      width = count === 3 ? 390 : 1280;
    await page.setViewportSize({ width, height: 844 });
    page.on('dialog', (d) => d.accept());
    await page.goto('/');
    await page.locator(`.title-map-card[data-map-id="${source}"]`).click();
    await page.locator('#briefing-match-variants').selectOption(String(count));
    await page.locator('#four-site-army1').selectOption(String(count - 1));
    await expect(page.locator(`#four-site-army${count}`)).toHaveValue('0');
    await expect(page.locator('.four-start-sites .map-preview-unit')).toHaveCount(0);
    await expect(page.locator('#four-site-army1 option:checked')).toContainText(count === 3 ? '東' : '南');
    await page.locator('.four-start-card').screenshot({ path: info.outputPath(`systems-asymmetric-${source}-${width}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.locator('#four-start').click();
    await expect(page.locator('#four-board > button')).toHaveCount(252);
    await page.locator('[data-four-unit]').first().click();
    await page.locator('[data-human-action="wait"]').click();
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '1');
    await page.locator('.four-tools').evaluate((e) => {
      (e as HTMLDetailsElement).open = true;
    });
    await page.locator('[data-save-slot="0"]').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).not.toBeNull();
    const stored = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
    const save = parseFourArmySpectatorSave(stored);
    expect(save.ok).toBe(true);
    if (!save.ok) throw Error(save.error);
    const map = save.value.archive.payload.map;
    expect(map.match).toMatchObject({
      sourceMapId: source,
      layoutVersion: 4,
      siteArmies: Array.from({ length: count }, (_, i) => 'army' + (i === 0 ? count : i === count - 1 ? 1 : i + 1)),
      initialOrder: Array.from({ length: count }, (_, i) => 'army' + (i + 1)),
    });
    await page.reload();
    await page.locator(`.title-map-card[data-map-id="${source}"]`).click();
    await page.locator('#briefing-match-variants').selectOption(String(count));
    await page.locator('.four-tools').evaluate((e) => {
      (e as HTMLDetailsElement).open = true;
    });
    await page.locator('[data-load-slot="0"]').click();
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '1');
    const h = map.capitals.army1;
    await expect(page.locator(`#four-board [data-x="${h.x}"][data-y="${h.y}"] .facility-capital.army1`)).toHaveCount(1);
    await page.locator('.four-playback-options').evaluate((e) => {
      (e as HTMLDetailsElement).open = true;
    });
    await page.locator('#four-replay').click();
    await expect(page.locator('#four-replay-count')).toHaveText('0/1');
    await page.locator('#four-replay-end').click();
    await expect(page.locator('#four-replay-count')).toHaveText('1/1');
    expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe(stored);
  });
}
