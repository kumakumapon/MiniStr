import { expect, test } from '@playwright/test';
import { operation, valueOf } from '../../src/game/operations.fixture';
import { createScenarioInitialState, applyGameCommand, saveGame, type GameCommand } from '../../src/game';
import { createCampaignProgress, recordCampaignVictory } from '../../src/game/campaign';

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`selects and restores CPU policy at ${width}/${locale}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
      page.on('dialog', (dialog) => dialog.accept());
      await page.goto('/');
      await page.locator('.title-map-card[data-map-id="skirmish"]').click();
      await page.locator('[data-army-policy="blue"]').selectOption('defensive');
      await page.locator('#begin-operation').click();
      await page.locator('#save').click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
      expect(saved.cpuPolicies).toEqual({ red: 'balanced', blue: 'defensive' });
      expect(saved.gameState.ruleVersion).toBe(12);
      await expect(page.locator('.army-policy-summary')).toContainText(locale === 'en' ? 'Defensive' : '守勢');
      await page.reload();
      await page.locator('#title-continue').click();
      await page.locator('#save').click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!).cpuPolicies.blue)).toBe('defensive');
      await page.screenshot({ path: info.outputPath(`systems-policy-${width}-${locale}.png`) });
    });
    test(`demolishes and restores a bridge at ${width}/${locale}`, async ({ page }, info) => {
      const scenario = operation({
        startingGold: 5000,
        board: { width: 9, height: 9, cells: Array.from({ length: 9 }, (_, y) => [4, y, 'sea']) },
        initialUnits: [
          { kind: 'engineer', owner: 'red', x: 3, y: 4 },
          { kind: 'infantry', owner: 'blue', x: 8, y: 8 },
        ],
        victoryConditions: [{ type: 'eliminate' }],
        defeatConditions: [{ type: 'eliminate' }],
      });
      const initial = createScenarioInitialState(scenario);
      const commands: GameCommand[] = [{ type: 'bridge', unitId: 'r1', destination: { x: 4, y: 4 } }, { type: 'endTurn' }, { type: 'endTurn' }];
      const state = commands.reduce((state, command) => valueOf(applyGameCommand(state, command)), initial);
      const saved = valueOf(
        saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'x', {
          mapId: scenario.id,
          difficulty: 'normal',
          initialState: initial,
          gameState: state,
          commands,
        }),
      );
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(
        ({ locale, saved }) => {
          localStorage.setItem('ministr.locale', locale);
          if (localStorage.getItem('ministr.save.manual') === null) localStorage.setItem('ministr.save.manual', JSON.stringify(saved));
        },
        { locale, saved },
      );
      page.on('dialog', (dialog) => dialog.accept());
      await page.goto('/');
      await page.locator('#title-continue').click();
      await page.locator('.tile[data-x="3"][data-y="4"]').click();
      await page.locator('.bridge-destroy').click();
      await page.locator('#save').click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!).gameState.bridges)).toEqual([]);
      await page.reload();
      await page.locator('#title-continue').click();
      await expect(page.locator('.bridge-marker')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`systems-demolition-${width}-${locale}.png`) });
    });
    test(`opens branches and edits a survivor callsign at ${width}/${locale}`, async ({ page }, info) => {
      const progress = valueOf(recordCampaignVictory(createCampaignProgress(), 'skirmish', 'A'));
      progress.veteransByScenario = { skirmish: [{ kind: 'infantry', experience: 2, callsign: 'ALPHA-01' }] };
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(
        ({ locale, progress }) => {
          localStorage.setItem('ministr.locale', locale);
          localStorage.setItem('ministr.campaign.progress', JSON.stringify(progress));
        },
        { locale, progress },
      );
      await page.goto('/');
      await page.locator('#title-campaign').click();
      await expect(page.locator('.campaign-start[data-campaign-id="islands"]')).toBeEnabled();
      await expect(page.locator('.campaign-start[data-campaign-id="canyon"]')).toBeEnabled();
      await page.locator('.campaign-roster summary').first().click();
      await page.locator('input[data-veteran-stage="skirmish"]').fill('BRAVO-02');
      await page.locator('.campaign-veteran-rename[data-veteran-stage="skirmish"]').click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.campaign.progress')!).veteransByScenario.skirmish[0].callsign)).toBe('BRAVO-02');
      await page.screenshot({ path: info.outputPath(`systems-campaign-branch-${width}-${locale}.png`) });
    });
  }
