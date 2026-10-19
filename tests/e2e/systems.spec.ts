import { expect, test } from '@playwright/test';
import { operationData } from '../../src/game/operations.fixture';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`generates and reuses a deployment preset at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await page.locator('#title-generator summary').click();
    await page.locator('#title-generator-size').selectOption('16');
    await page.locator('#title-generator-sea').selectOption('ocean');
    await page.locator('#title-generator-seed').fill('bad seed');
    await page.locator('#title-generator-create').click();
    await expect(page.locator('#title-generator [role=alert]')).toContainText('seed');
    await expect(page.locator('#title-generator-seed')).toBeFocused();
    await page.locator('#title-generator-seed').fill(`browser-${viewport.width}`);
    await page.locator('#title-generator').screenshot({ path: testInfo.outputPath('systems-generator.png') });
    await page.locator('#title-generator-create').click();
    await expect(page.locator('#briefing-title')).toContainText(`browser-${viewport.width}`);
    await page.locator('#briefing-deployment summary').click();
    await page.locator('#briefing-deployment-red-2').selectOption('infantry');
    await page.locator('#briefing-preset-red-0-name').fill('機動部隊');
    await page.locator('#briefing-preset-red-0-save').click();
    await expect(page.locator('.deployment-presets [role=status]')).toContainText('保存しました');
    await page.locator('#briefing-deployment-reset').click();
    await expect(page.locator('#briefing-deployment-red-2')).toHaveValue('tank');
    await page.locator('#briefing-preset-red-0-apply').click();
    await expect(page.locator('#briefing-deployment-red-2')).toHaveValue('infantry');
    await page.locator('#briefing-preset-red-0-name').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('systems-presets.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('#begin-operation').click();
    await page.locator('#save').click();
    const state = await page.evaluate(
      () => JSON.parse(localStorage.getItem('ministr.save.manual')!) as { initialState: { units: { id: string; kind: string }[]; board: { width: number } } },
    );
    expect(state.initialState.units.find((unit) => unit.id === 'r3')?.kind).toBe('infantry');
    expect(state.initialState.board.width).toBe(16);
    await page.reload();
    await page.locator(`.title-map-card[data-map-id="generated-v1-16-ocean-browser-${viewport.width}"]`).click();
    await page.locator('#briefing-deployment summary').click();
    await expect(page.locator('#briefing-preset-red-0-name')).toHaveValue('機動部隊');
    await page.locator('#briefing-preset-red-0-apply').click();
    await expect(page.locator('#briefing-deployment-red-2')).toHaveValue('infantry');
    await page.locator('#briefing-preset-red-0-delete').click();
    await expect(page.locator('#briefing-preset-red-0-apply')).toBeDisabled();
  });

  test(`rebuilds recon and respects spectator analysis boundaries at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await page.locator('#title-editor').click();
    await page.locator('#editor-json').fill(
      JSON.stringify(
        operationData({
          id: 'browser-recon',
          name: '索敵記録の操作確認',
          initialUnits: [
            { kind: 'infantry', owner: 'red', x: 0, y: 1 },
            { kind: 'tank', owner: 'blue', x: 2, y: 1 },
          ],
          victoryConditions: [{ type: 'survive', untilTurn: 100 }],
          defeatConditions: [{ type: 'survive', untilTurn: 101 }],
        }),
      ),
    );
    await page.locator('#editor-import').click();
    await page.locator('#editor-start').click();
    await page.locator('#begin-operation').click();
    const moveObserver = async () => {
      await page.locator('.tile[data-x="0"][data-y="1"]').click();
      await page.locator('.tile[data-x="0"][data-y="3"]').click();
    };
    await moveObserver();
    const marker = page.locator('.tile[data-x="2"][data-y="1"] .recon-contact');
    await expect(marker).toContainText('最終 T1');
    await expect(page.locator('#battle-analysis')).toHaveCount(0);
    await page.locator('#recon-history summary').click();
    await page.locator('#recon-markers').uncheck();
    await expect(marker).toHaveCount(0);
    await page.locator('#recon-markers').check();
    await expect(marker).toBeVisible();
    await expect(page.locator('[data-recon-x]')).toContainText('現在位置は不明');
    await page.locator('#recon-history').screenshot({ path: testInfo.outputPath('systems-recon.png') });
    await page.locator('#undo').click();
    await expect(marker).toHaveCount(0);
    await moveObserver();
    await page.locator('#save').click();
    await page.locator('#open-title').click();
    await page.locator('.load-save-slot[data-save-slot="manual"]').click();
    await expect(marker).toBeVisible();
    await page.locator('#open-title').click();
    for (const id of ['harbor-seizure', 'frontier-defense', 'encirclement-breakout']) await expect(page.locator(`.title-map-card[data-map-id="${id}"]`)).toBeVisible();
    await page.locator('.title-map-card[data-map-id="frontier-defense"]').click();
    await page.locator('input[name="match-mode"][value="spectate"]').check();
    await page.locator('#begin-operation').click();
    await page.locator('#spectate-toggle').click();
    await expect(page.locator('#battle-analysis')).toHaveCount(0);
    await page.locator('#spectate-whole-board').click();
    await page.locator('#battle-analysis summary').click();
    await page.locator('#analysis-metric').selectOption('income');
    await expect(page.locator('.analysis-chart')).toHaveAttribute('data-analysis-metric', 'income');
    await expect(page.locator('#battle-analysis tbody tr').first()).toBeVisible();
    await page.locator('#battle-analysis').screenshot({ path: testInfo.outputPath('systems-analysis.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('#spectate-whole-board').click();
    await expect(page.locator('#battle-analysis')).toHaveCount(0);
  });
}
