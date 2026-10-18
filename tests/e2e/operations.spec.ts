import { expect, test } from '@playwright/test';
import { operationData } from '../../src/game/operations.fixture';
import { unitStats } from '../../src/game/units';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`deploys, evacuates, undoes, saves and resumes at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await page.locator('#title-editor').click();
    await page.locator('#editor-json').fill(JSON.stringify(operationData({ id: 'browser-withdrawal', name: '撤退の操作確認' })));
    await page.locator('#editor-import').click();
    await expect(page.locator('#editor-notice')).toContainText('JSONを反映しました');
    await page.locator('#editor-start').click();
    await expect(page.locator('#briefing-title')).toHaveText('撤退の操作確認');
    await page.locator('#briefing-deployment summary').click();
    const slot = page.locator('#briefing-deployment-red-1');
    await slot.focus();
    await slot.selectOption('heavyTank');
    await expect(slot).toBeFocused();
    await expect(page.locator('#begin-operation')).toBeDisabled();
    await expect(page.locator('.deployment-error').first()).toContainText('予算');
    await page.locator('#briefing-deployment-reset').click();
    await expect(slot).toHaveValue('tank');
    await slot.selectOption('infantry');
    await expect(page.locator('#begin-operation')).toBeEnabled();
    const briefingWidth = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(briefingWidth.scroll).toBeLessThanOrEqual(briefingWidth.width + 1);
    await page.screenshot({ path: testInfo.outputPath('deployment.png'), fullPage: true });
    await page.locator('#begin-operation').click();
    await expect(page.locator('.tile[data-x="1"][data-y="2"]')).toContainText('歩');
    await page.locator('#save').click();
    const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!) as { initialState: { players: { red: { gold: number } } } });
    expect(initial.initialState.players.red.gold).toBe(unitStats.tank.cost - unitStats.infantry.cost);

    await page.locator('.tile[data-x="0"][data-y="1"]').click();
    await expect(page.locator('#evacuate-unit')).toBeDisabled();
    await page.locator('.tile[data-x="3"][data-y="1"]').click();
    await expect(page.locator('#evacuate-unit')).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('evacuation-control.png'), fullPage: true });
    await page.locator('#evacuate-unit').click();
    await expect(page.locator('.tile[data-x="3"][data-y="1"]')).not.toContainText('歩');
    await page.locator('#undo').click();
    await expect(page.locator('.tile[data-x="3"][data-y="1"]')).toContainText('歩');
    await page.locator('.tile[data-x="3"][data-y="1"]').click();
    await page.locator('#evacuate-unit').click();
    await page.locator('#save').click();
    await page.locator('#open-title').click();
    await page.locator('.load-save-slot[data-save-slot="manual"]').click();
    await expect(page.locator('.title-overlay')).toHaveCount(0);
    await expect(page.locator('.tile[data-x="3"][data-y="1"]')).not.toContainText('歩');
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!) as { gameState: { evacuatedUnits: { id: string }[] } });
    expect(restored.gameState.evacuatedUnits.map((unit) => unit.id)).toEqual(['r1']);
    await page.locator('.tile[data-x="1"][data-y="2"]').click();
    await page.locator('.tile[data-x="3"][data-y="1"]').click();
    await page.locator('#evacuate-unit').click();
    await expect(page.locator('.game-over')).toBeVisible();
    await expect(page.locator('#result-title')).toContainText('勝利');
    await page.screenshot({ path: testInfo.outputPath('withdrawal-result.png'), fullPage: true });
    const pageWidth = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.width + 1);
  });
}

test('offers both authored operations and protects the escort loadout', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title-map-card[data-map-id="fighting-withdrawal"]')).toContainText('撤退路を開け');
  await page.locator('.title-map-card[data-map-id="convoy-escort"]').click();
  await page.locator('#briefing-deployment summary').click();
  await expect(page.locator('#briefing-deployment-red-0')).toBeDisabled();
  await expect(page.locator('#briefing-deployment-red-0')).toHaveValue('apc');
  await page.locator('input[name="match-mode"][value="hotseat"]').check();
  await page.locator('#briefing-deployment-blue-0').selectOption('heavyTank');
  await expect(page.locator('#begin-operation')).toBeDisabled();
  await page.locator('input[name="match-mode"][value="cpu"]').check();
  await expect(page.locator('#briefing-deployment-blue-0')).toHaveCount(0);
  await expect(page.locator('#begin-operation')).toBeEnabled();
  await page.locator('#begin-operation').click();
  await page.locator('.tile[data-x="1"][data-y="5"]').click();
  await expect(page.locator('#evacuate-unit')).toBeDisabled();
  await expect(page.locator('.tile[data-x="1"][data-y="5"] .mission-unit-marker')).toHaveText('任');
});
