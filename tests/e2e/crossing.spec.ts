import { expect, test } from '@playwright/test';
import { crossingScenarioData } from '../crossing.fixture';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`confirms, cancels, undoes and restores public bridges at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await expect(page.locator('[data-map-id="bridgehead"]')).toBeVisible();
    await expect(page.locator('[data-map-id="river-withdrawal"]')).toBeVisible();
    await page.locator('#title-editor').click();
    await page.locator('#editor-json').fill(JSON.stringify(crossingScenarioData()));
    await page.locator('#editor-import').click();
    await page.locator('#editor-start').click();
    await page.locator('#begin-operation').click();
    await page.locator('.tile[data-x="3"][data-y="2"]').click();
    await page.locator('#bridge-unit').click();
    await expect(page.locator('.tile.bridge-target')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#bridge-unit')).toBeFocused();
    await page.locator('#bridge-unit').click();
    await page.locator('.tile[data-x="4"][data-y="2"]').click();
    await expect(page.locator('#bridge-confirm')).toContainText('1000G');
    await expect(page.locator('#bridge-confirm')).toBeFocused();
    await page.locator('#bridge-cancel').click();
    await expect(page.locator('.bridge-marker')).toHaveCount(0);
    await page.locator('#bridge-unit').click();
    await page.locator('.tile[data-x="4"][data-y="2"]').click();
    await page.locator('.battlefield-stage').screenshot({ path: testInfo.outputPath('systems-v9-bridge-confirm.png') });
    await page.locator('#bridge-confirm').click();
    await expect(page.locator('.tile[data-x="4"][data-y="2"]')).toHaveAttribute('data-terrain', 'sea');
    await expect(page.locator('.bridge-marker')).toHaveText('橋');
    await expect(page.locator('#bridge-unit')).toBeDisabled();
    await expect(page.locator('.tile[data-x="8"][data-y="4"] .unit')).toHaveCount(0);
    await page.locator('.battlefield-stage').screenshot({ path: testInfo.outputPath('systems-v9-bridge-built.png') });
    await page.locator('#save').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
    expect(saved.commands).toEqual([{ type: 'bridge', unitId: 'r1', destination: { x: 4, y: 2 } }]);
    expect(saved.gameState.players.red.gold).toBe(saved.initialState.players.red.gold - 1000);
    await page.locator('#undo').click();
    await expect(page.locator('.bridge-marker')).toHaveCount(0);
    await page.reload();
    await page.locator('.load-save-slot[data-save-slot="manual"]').click();
    await expect(page.locator('.bridge-marker')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(
      await page.evaluate(() => document.querySelector('#board-viewport')!.getBoundingClientRect().top - document.querySelector('#unit-brief')!.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(12);
  });
  test(`generates, saves and reloads frontline settings at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#title-generator summary').click();
    await page.locator('#title-generator-size').selectOption('16');
    await page.locator('#title-generator-sea').selectOption('ocean');
    await page.locator('#title-generator-preset').selectOption('frontline');
    await page.locator('#title-generator-seed').fill('crossing-e2e');
    await page.locator('#title-generator').screenshot({ path: testInfo.outputPath('systems-v9-frontline-generator.png') });
    await page.locator('#title-generator-create').click();
    await expect(page.locator('#briefing-title')).toContainText('前線補給・工兵');
    await page.locator('#begin-operation').click();
    await page.locator('#save').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
    expect(saved.mapId).toBe('generated-v3-frontline-16-ocean-crossing-e2e');
    expect(saved.gameState.units.filter((unit: { kind: string }) => unit.kind === 'engineer')).toHaveLength(2);
    expect(saved.gameState.board.terrain.flat().filter((tile: { kind: string }) => tile.kind === 'supplyDepot')).toHaveLength(2);
    await page.reload();
    await expect(page.locator(`[data-map-id="${saved.mapId}"]`)).toBeVisible();
  });
}
