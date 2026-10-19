import { expect, test } from '@playwright/test';
import { finishedDefense, scanScenarioData } from '../operationsExpansion.fixture';
import { OPERATION_RECORDS_KEY } from '../../src/game/operationRecords';
import { MANUAL_SAVE_KEY } from '../../src/game/session';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`uses, cancels, undoes and resumes army scans at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await page.locator('#title-editor').click();
    await page.locator('#editor-json').fill(JSON.stringify(scanScenarioData()));
    await page.locator('#editor-import').click();
    await page.locator('#editor-start').click();
    await page.locator('#begin-operation').click();
    const enemy = page.locator('.tile[data-x="7"][data-y="2"] .unit');
    await expect(enemy).toHaveCount(0);
    await page.locator('#recon-target').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#recon-cancel')).toHaveCount(0);
    await expect(page.locator('#recon-target')).toBeFocused();
    await page.locator('#recon-target').click();
    await page.locator('.tile[data-x="6"][data-y="2"]').click();
    await expect(page.locator('#recon-target')).toContainText('残り1回');
    await expect(enemy).toBeVisible();
    await page.locator('.battlefield-stage').screenshot({ path: testInfo.outputPath('systems-v7-recon.png') });
    await page.locator('#undo').click();
    await expect(page.locator('#recon-target')).toContainText('残り2回');
    await expect(enemy).toHaveCount(0);
    await page.locator('#recon-target').click();
    await page.locator('.tile[data-x="6"][data-y="2"]').click();
    await page.locator('#save').click();
    await page.reload();
    await page.locator('.load-save-slot[data-save-slot="manual"]').click();
    await expect(page.locator('#recon-target')).toContainText('残り1回');
    await expect(enemy).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test(`shows public control objectives and persists human operation challenges at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await expect(page.locator('.title-map-card[data-map-id="control-coast"]')).toBeVisible();
    await page.locator('.title-map-card[data-map-id="control-crossroads"]').click();
    await expect(page.locator('.operation-challenges')).toContainText('追加チャレンジ');
    await page.locator('#begin-operation').click();
    await expect(page.locator('.control-score')).toContainText('赤 0 ／ 青 0');
    await page.locator('.control-score summary').click();
    await expect(page.locator('[data-control-x]')).toHaveCount(2);
    await expect(page.locator('.control-score')).toContainText('常駐は不要');
    await page.locator('.control-score').screenshot({ path: testInfo.outputPath('systems-v7-control.png') });
    const completed = finishedDefense();
    await page.evaluate(
      ({ key, serialized, recordsKey }) => {
        localStorage.setItem(key, serialized);
        localStorage.removeItem(recordsKey);
      },
      { key: MANUAL_SAVE_KEY, serialized: completed.serialized, recordsKey: OPERATION_RECORDS_KEY },
    );
    await page.reload();
    await page.locator('.load-save-slot[data-save-slot="manual"]').click();
    await expect(page.locator('.game-over .operation-challenges')).toContainText('✓ 達成');
    await page.locator('.game-over-card').screenshot({ path: testInfo.outputPath('systems-v7-result.png') });
    const record = await page.evaluate((key) => localStorage.getItem(key), OPERATION_RECORDS_KEY);
    expect(JSON.parse(record!).records).toHaveLength(1);
    await page.locator('#result-title-menu').click();
    await page.locator('#operation-records summary').first().click();
    await expect(page.locator('#operation-records')).toContainText('標準編成');
    await expect(page.locator('#operation-records')).toContainText('最短5ターン');
    await page.locator('#operation-records').screenshot({ path: testInfo.outputPath('systems-v7-records.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.reload();
    await page.locator('.load-save-slot[data-save-slot="manual"]').click();
    expect(await page.evaluate((key) => localStorage.getItem(key), OPERATION_RECORDS_KEY)).toBe(record);
    await page.locator('#result-title-menu').click();
    await page.locator('#operation-records summary').first().click();
    await page.locator('[data-record-delete="0"]').click();
    await expect(page.locator('#operation-records')).toContainText('まだありません');
  });
}
