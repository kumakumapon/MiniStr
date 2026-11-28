import { expect } from '@playwright/test';
import { test } from './helpers/engineTest';

for (const [locale, width] of [
  ['ja', 390],
  ['en', 1280],
] as const) {
  test(`matches headquarters, units and public status in restricted and spectator views ${width}/${locale}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.addInitScript((language) => localStorage.setItem('ministr.locale', language), locale);
    await page.goto('/');
    await page.locator('[data-map-id="canyon"]').click();
    await page.locator('#briefing-match-variants label:has([value="4"])').click();
    const shapes = ['■', '●', '◆', '▲'];
    await expect(page.locator('.four-site-marker .army-emblem')).toHaveText(shapes);
    const colors = await page.locator('.four-site-marker .army-emblem').evaluateAll((markers) => markers.map((marker) => getComputedStyle(marker).color));
    expect(new Set(colors).size).toBe(4);
    await expect(page.locator('.four-start-sites li .army-emblem')).toHaveText(shapes);
    await page.locator('#four-mode').selectOption('spectator');
    await page.locator('#four-start').click();

    const status = page.locator('#four-army-info');
    await expect(status).toBeVisible();
    await expect(status.locator('.army-emblem')).toHaveText(shapes);
    const controls = page.locator('.four-map-heading .four-display-controls');
    const threats = controls.locator('#four-show-threats');
    const supply = controls.locator('#four-show-supply');
    await expect(controls.locator('#four-terrain-legend > summary')).toBeVisible();
    await expect(threats).toBeDisabled();
    await expect(supply).toBeDisabled();
    for (const [i, shape] of shapes.entries()) {
      await expect(page.locator(`#four-board .unit.army${i + 1} .army-emblem`).first()).toHaveText(shape);
      await expect(page.locator(`#four-board .unit.army${i + 1} .army-emblem`).first()).toHaveCSS('color', colors[i]!);
      await expect(status.locator(`.army-emblem.army${i + 1}`)).toHaveCSS('color', colors[i]!);
      await expect(page.locator(`#four-board .facility.army${i + 1} .army-emblem`).first()).toHaveText(shape);
    }
    await page.locator('#four-view').selectOption('army1');
    await expect(status.locator('.four-army-label.army2')).toContainText(locale === 'ja' ? '資金非公開' : 'Funds hidden');
    const visibleFacilities = await page.locator('#four-board .tile:not(.fog) .facility.army2').count();
    await expect(status.locator('.four-army-label.army2')).toContainText(`${locale === 'ja' ? '視認施設' : 'Visible facilities'} ${visibleFacilities}`);
    await expect(page.locator('#four-board .tile.fog .unit')).toHaveCount(0);
    await expect(threats).toBeEnabled();
    await threats.check();
    await expect(page.locator('#four-threat-hint')).toBeVisible();
    await expect(page.locator('#four-board .supply-coverage').first()).toBeAttached();
    await supply.uncheck();
    await expect(page.locator('#four-board .supply-coverage')).toHaveCount(0);
    await expect(page.locator('#four-board .tile.fog .unit')).toHaveCount(0);
    await page.locator('#four-view').selectOption('all');
    await expect(status).not.toContainText(locale === 'ja' ? '資金非公開' : 'Funds hidden');
    await expect(threats).toBeDisabled();
  });
}
