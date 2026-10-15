import { expect, test, type Page } from '@playwright/test';
import { playCampaignStage } from '../../scripts/campaignHarness';
import { CAMPAIGN_STORAGE_KEY, campaignStages, createCampaignProgress, endTurn, replayCommands, saveGameToSlot, type CampaignProgress, type StorageLike } from '../../src/game';

const runs: { before: CampaignProgress; result: ReturnType<typeof playCampaignStage> }[] = [];
test.beforeEach(({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
});
test.beforeAll(() => {
  let progress = createCampaignProgress();
  for (const stage of campaignStages) {
    const result = playCampaignStage(progress, stage, 'normal');
    if (result.finalState.winner !== 'red') throw new Error(`${stage.scenarioId}: reference playthrough lost`);
    runs.push({ before: progress, result });
    progress = result.progress;
  }
});

async function preload(page: Page, data: Record<string, string>) {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, data);
}
function memory() {
  const data: Record<string, string> = {};
  const storage: StorageLike = {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
  return { data, storage };
}

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`campaign orders and nearby turn controls at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#title-campaign').click();
    await page.locator('.campaign-start[data-campaign-id="skirmish"]').click();
    await expect(page.locator('.briefing-overlay')).toContainText('地上部隊');
    await page.locator('#begin-operation').click();
    await expect(page.locator('.map-turn-status')).toContainText('ターン終了');
    await expect(page.locator('#board-end-turn')).toBeEnabled();
    await page.locator('.map-turn-status').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('campaign-turn-controls.png'), fullPage: true });
  });
}

test('resumes a saved blue campaign turn automatically and returns control to red', async ({ page }, info) => {
  const { before, result } = runs[0]!;
  const { data, storage } = memory();
  const saved = saveGameToSlot(storage, 'cpu-resume', 'CPU resume', {
    mapId: 'skirmish',
    difficulty: 'normal',
    campaignScenarioId: 'skirmish',
    initialState: result.initialState,
    gameState: endTurn(result.initialState),
    commands: [{ type: 'endTurn' }],
  });
  if (!saved.ok) throw new Error(saved.error);
  data[CAMPAIGN_STORAGE_KEY] = JSON.stringify(before);
  await preload(page, data);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('.load-save-slot[data-save-slot="cpu-resume"]').click();
  await expect(page.locator('#skip-cpu')).toBeVisible();
  await expect(page.locator('#end')).toBeDisabled();
  await expect(page.locator('#board-end-turn')).toHaveCount(0);
  await page.locator('#skip-cpu').click();
  await expect(page.locator('#board-end-turn')).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('.turn-indicator')).toContainText('プレイヤー');
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('campaign-cpu-resumed.png'), fullPage: true });
});

for (const [index, stage] of campaignStages.entries()) {
  test(`finishes ${stage.scenarioId}, records progression, and imports its complete winning replay`, async ({ page }, info) => {
    const { before, result } = runs[index]!;
    const commands = result.commands.slice(0, -1);
    const prefix = replayCommands(result.initialState, commands);
    if (!prefix.ok) throw new Error(prefix.error);
    expect(prefix.value.winner).toBeUndefined();
    const { data, storage } = memory();
    const saved = saveGameToSlot(storage, 'finish', stage.scenarioId, {
      mapId: stage.scenarioId,
      difficulty: 'normal',
      campaignScenarioId: stage.scenarioId,
      initialState: result.initialState,
      gameState: prefix.value,
      commands,
    });
    if (!saved.ok) throw new Error(saved.error);
    data[CAMPAIGN_STORAGE_KEY] = JSON.stringify(before);
    await preload(page, data);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.locator('.load-save-slot[data-save-slot="finish"]').click();
    const last = result.commands.at(-1)!;
    if (prefix.value.activePlayer === 'red') {
      if (last.type === 'endTurn') await page.locator('#board-end-turn').click();
      else if (last.type === 'capture') {
        const capturer = prefix.value.units.find((unit) => unit.id === last.unitId)!;
        await page.locator(`.tile[data-x="${capturer.position!.x}"][data-y="${capturer.position!.y}"]`).click();
        await page.locator('#capture').click();
        if (await page.locator('#tactical-scene-skip').isVisible()) await page.locator('#tactical-scene-skip').click();
      } else throw new Error(`Unsupported final player action: ${last.type}`);
    }
    await expect(page.locator('.campaign-result .campaign-grade')).toHaveText(result.summary.grade!, { timeout: 15_000 });
    const progress = (await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), CAMPAIGN_STORAGE_KEY)) as CampaignProgress;
    expect(Object.keys(progress.bestGrades)).toHaveLength(index + 1);
    expect(progress.bestGrades[stage.scenarioId]).toBe(result.summary.grade);
    expect(progress.veteransByScenario?.[stage.scenarioId]).toHaveLength(result.progress.veteransByScenario![stage.scenarioId]!.length);
    if (index < 9) expect(progress.unlockedScenarioIds).toContain(campaignStages[index + 1]!.scenarioId);
    else await expect(page.locator('#campaign-next')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${stage.scenarioId}-victory.png`), fullPage: true });

    await page.goto('/');
    await page.locator('#title-replay-file').setInputFiles({ name: `${stage.scenarioId}.json`, mimeType: 'application/json', buffer: Buffer.from(result.replay) });
    await expect(page.locator('.replay-toolbar')).toBeVisible();
    await page.locator('#replay-seek').evaluate((input, length) => {
      (input as HTMLInputElement).value = String(length);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, result.commands.length);
    await expect(page.locator('.replay-toolbar')).toContainText(`${result.commands.length} / ${result.commands.length}`);
    expect(errors).toEqual([]);
  });
}
