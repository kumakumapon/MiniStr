import { expect, test, type Page } from '@playwright/test';
import { operation, valueOf } from '../../src/game/operations.fixture';
import { createScenarioInitialState, applyGameCommand, saveGame, type GameCommand, type ScenarioDefinition, type SavedGame } from '../../src/game';
import { combinedTactics } from '../../src/game/tactics';

function savedOperation(scenario: ScenarioDefinition, commands: GameCommand[]): SavedGame {
  const initial = createScenarioInitialState(scenario);
  const state = commands.reduce((current, command) => valueOf(applyGameCommand(current, command)), initial);
  return valueOf(
    saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'fixture', {
      mapId: scenario.id,
      difficulty: 'normal',
      initialState: initial,
      gameState: state,
      commands,
    }),
  );
}
async function resume(page: Page, saved: SavedGame, locale: string) {
  await page.addInitScript(
    ({ saved, locale }) => {
      localStorage.setItem('ministr.locale', locale);
      if (localStorage.getItem('ministr.save.manual') === null) localStorage.setItem('ministr.save.manual', JSON.stringify(saved));
    },
    { saved, locale },
  );
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('#title-continue').click();
}
const tile = (page: Page, x: number, y: number) => page.locator(`.tile[data-x="${x}"][data-y="${y}"]`);

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`starts a localized combined-tactics map and saves its snapshot at ${width}/${locale}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
      page.on('dialog', (dialog) => dialog.accept());
      await page.goto('/');
      await page.locator('#title-tactical-preset').check();
      await page.locator('.title-map-card[data-map-id="skirmish"]').click();
      await expect(page.locator('#briefing-supply-mode option[value="unlimited"]')).toBeDisabled();
      await page.locator('#begin-operation').click();
      await expect(page.locator('.tactics-status')).toContainText(locale === 'en' ? 'Next round' : '次ラウンド');
      await page.locator('#save').click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
      expect(saved.gameState.ruleVersion).toBe(13);
      expect(saved.initialState.scenarioSnapshot.tacticalOptions).toEqual(combinedTactics);
      await page.reload();
      await page.locator('#title-continue').click();
      await expect(page.locator('.tactics-status')).toBeVisible();
      await page.locator('.tactics-status summary').click();
      if (locale === 'en') expect(await page.locator('.tactics-status').innerText()).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
      await page.screenshot({ path: info.outputPath(`tactics-${width}-${locale}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });

    for (const kind of ['apc', 'landingShip', 'transportHelicopter'] as const) {
      test(`unloads a moved ${kind} and resumes both spent actions at ${width}/${locale}`, async ({ page }) => {
        const scenario = operation({
          tacticalOptions: { ...combinedTactics },
          board: { width: 9, height: 6, cells: kind === 'landingShip' ? Array.from({ length: 9 }, (_, x) => [x, 2, 'sea']) : [] },
          initialUnits: [
            { kind: 'infantry', owner: 'red', x: 1, y: 1 },
            { kind, owner: 'red', x: 1, y: 2 },
            { kind: 'infantry', owner: 'blue', x: 8, y: 5 },
          ],
          victoryConditions: [{ type: 'eliminate' }],
          defeatConditions: [{ type: 'eliminate' }],
        });
        const commands: GameCommand[] = [
          { type: 'embark', unitId: 'r1', transportId: 'r2' },
          { type: 'endTurn' },
          { type: 'endTurn' },
          { type: 'move', unitId: 'r2', destination: { x: 3, y: 2 } },
        ];
        await page.setViewportSize({ width, height: 844 });
        await resume(page, savedOperation(scenario, commands), locale);
        await tile(page, 3, 2).click();
        await page.locator('.disembark[data-x="3"][data-y="1"]').click();
        await page.locator('#save').click();
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
        expect(saved.gameState.units.find((u: { id: string }) => u.id === 'r1')).toMatchObject({ position: { x: 3, y: 1 }, hasMoved: true, hasActed: true });
        expect(saved.gameState.units.find((u: { id: string }) => u.id === 'r2')).toMatchObject({ hasMoved: true, hasActed: true });
        await page.reload();
        await page.locator('#title-continue').click();
        await expect(tile(page, 3, 1).locator('.unit.red')).toHaveCount(1);
        await tile(page, 3, 2).click();
        await expect(page.locator('.disembark')).toHaveCount(0);
      });
    }

    test(`detects a submerged enemy with sonar and restores a dive action at ${width}/${locale}`, async ({ page }, info) => {
      const scenario = operation({
        tacticalOptions: { ...combinedTactics, weather: false },
        board: { width: 9, height: 6, cells: Array.from({ length: 54 }, (_, i) => [i % 9, Math.floor(i / 9), 'sea']) },
        initialUnits: [
          { kind: 'submarine', owner: 'red', x: 1, y: 2 },
          { kind: 'fighter', owner: 'red', x: 3, y: 1 },
          { kind: 'submarine', owner: 'blue', x: 4, y: 2 },
        ],
        victoryConditions: [{ type: 'eliminate' }],
        defeatConditions: [{ type: 'eliminate' }],
      });
      await page.setViewportSize({ width, height: 844 });
      await resume(page, savedOperation(scenario, [{ type: 'endTurn' }, { type: 'dive', unitId: 'b1' }, { type: 'endTurn' }]), locale);
      await expect(tile(page, 4, 2).locator('.unit.blue')).toHaveCount(0);
      await tile(page, 1, 2).click();
      await tile(page, 2, 2).click();
      await expect(tile(page, 4, 2).locator('.unit.blue')).toHaveCount(1);
      await expect(page.locator('#tactical-dive')).toBeDisabled();
      await page.locator('#save').click();
      await page.reload();
      await page.locator('#title-continue').click();
      await expect(tile(page, 4, 2).locator('.unit.blue')).toHaveCount(1);
      await page.screenshot({ path: info.outputPath(`sonar-${width}-${locale}.png`) });
    });
  }
