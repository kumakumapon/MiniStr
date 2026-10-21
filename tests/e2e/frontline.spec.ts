import { expect, test } from '@playwright/test';
import { frontlineScenarioData } from '../frontline.fixture';
import { MANUAL_SAVE_KEY } from '../../src/game/session';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`supplies, confirms, cancels, undoes and restores engineering at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await expect(page.locator('.title-map-card[data-map-id="supply-contest"]')).toBeVisible();
    await expect(page.locator('.title-map-card[data-map-id="supply-ridge"]')).toBeVisible();
    await page.locator('#title-editor').click();
    await page.locator('#editor-json').fill(JSON.stringify(frontlineScenarioData()));
    await page.locator('#editor-import').click();
    await page.locator('#editor-start').click();
    await page.locator('#begin-operation').click();
    await expect(page.locator('.tile[data-x="3"][data-y="1"]')).toContainText('補');
    await page.locator('.tile[data-x="2"][data-y="1"]').click();
    await expect(page.locator('#unit-brief')).toContainText('補給予定');
    await expect(page.locator('#unit-brief')).toContainText('HP修理なし');
    await expect(page.locator('#unit-brief + #board-viewport')).toHaveCount(1);
    await page.locator('#supply-range').click();
    await expect(page.locator('.tile.supply-coverage')).toHaveCount(6);
    await expect(page.locator('.tile[data-x="8"][data-y="4"] .unit')).toHaveCount(0);
    await page.locator('.battlefield-stage').screenshot({ path: testInfo.outputPath('systems-v8-supply.png') });
    await page.locator('#fortify-unit').click();
    await page.locator('#fortify-cancel').click();
    await expect(page.locator('.fortification-marker')).toHaveCount(0);
    await page.locator('#fortify-unit').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#fortify-unit')).toBeFocused();
    await page.locator('#fortify-unit').click();
    await page.locator('#fortify-confirm').click();
    await expect(page.locator('.tile[data-x="2"][data-y="1"] .fortification-marker')).toHaveText('陣');
    await expect(page.locator('#frontline-controls')).toContainText('1 / 4');
    await page.locator('.battlefield-stage').screenshot({ path: testInfo.outputPath('systems-v8-fortification.png') });
    await page.locator('#save').click();
    const saved = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), MANUAL_SAVE_KEY))!);
    expect(saved.gameState.players.red.gold).toBe(saved.initialState.players.red.gold - 500);
    expect(saved.commands).toEqual([{ type: 'fortify', unitId: 'r1' }]);
    await page.locator('#undo').click();
    await expect(page.locator('.fortification-marker')).toHaveCount(0);
    await page.reload();
    await page.locator('.load-save-slot[data-save-slot="manual"]').click();
    await expect(page.locator('.fortification-marker')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const gap = await page.evaluate(
      () => document.querySelector('#board-viewport')!.getBoundingClientRect().top - document.querySelector('#unit-brief')!.getBoundingClientRect().bottom,
    );
    expect(gap).toBeLessThanOrEqual(12);
  });
}
