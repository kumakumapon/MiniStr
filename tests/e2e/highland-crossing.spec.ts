import { expect, test } from '@playwright/test';
import { createScenarioInitialState, replayCommands, MANUAL_SAVE_KEY, saveGame, scenarioById, type GameCommand } from '../../src/game';

test('a blue commander sees blue forces, plays after red CPU and continues the same seat', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="highland-crossing"]').click();
  await expect(page.locator('#briefing-copy')).toContainText('北岸');
  await expect(page.locator('#briefing-copy')).toContainText('南岸');
  await page.locator('[name="human-player"][value="blue"]').check();
  const bluePreview = page.locator('.briefing-map-surface svg g circle');
  await expect(bluePreview.first()).toBeAttached();
  const dotRows = await bluePreview.evaluateAll((dots) => dots.map((dot) => Number(dot.getAttribute('cy'))));
  expect(dotRows.every((y) => y > 5)).toBe(true);
  await page.locator('#begin-operation').click();
  await expect(page.locator('.board .unit.blue').first()).toBeAttached();
  await expect(page.locator('.board .unit.red')).toHaveCount(0);
  await page.locator('#skip-cpu').click();
  await expect(page.locator('#end')).toBeEnabled();
  await expect(page.locator('.turn-indicator.blue')).toContainText('プレイヤー');
  await page.locator('[data-hud-menu]').click();
  await page.locator('#save').click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), MANUAL_SAVE_KEY);
  expect(saved).toMatchObject({ schemaVersion: 5, humanPlayer: 'blue', gameState: { activePlayer: 'blue' } });
  expect(saved.commands.length).toBeGreaterThan(0);
  await expect(page.locator('.resource-row').filter({ hasText: '自軍資金' }).locator('strong')).toHaveText(`${saved.gameState.players.blue.gold}G`);
  await expect(page.locator('.resource-row.enemy strong')).toHaveText('不明G');
  await page.reload();
  await page.locator('#title-continue').click();
  await expect(page.locator('.turn-indicator.blue')).toContainText('プレイヤー');
  await expect(page.locator('#end')).toBeEnabled();
  await page.locator('[data-hud-page="units"]').click();
  await page.locator('.unit-queue-item').first().click();
  await expect(page.locator('.tile.selected .unit.blue')).toHaveCount(1);
});

test('a completed blue match opens its replay from blue and keeps blue on rematch', async ({ page }) => {
  const scenario = scenarioById('highland-crossing')!;
  const initialState = createScenarioInitialState(scenario);
  // Record a short, legal capture so loading and seeking exercise the real replay validator.
  const flank = initialState.units.find((unit) => unit.owner === 'red' && unit.kind === 'infantry' && unit.position?.x === 14)!;
  const commands: GameCommand[] = [];
  for (const destination of [
    { x: 15, y: 4 },
    { x: 15, y: 7 },
    { x: 13, y: 8 },
    { x: 11, y: 9 },
  ]) {
    commands.push({ type: 'move', unitId: flank.id, destination }, { type: 'endTurn' }, { type: 'endTurn' });
  }
  commands.push(
    { type: 'move', unitId: flank.id, destination: { x: 10, y: 10 } },
    { type: 'capture', unitId: flank.id },
    { type: 'endTurn' },
    { type: 'endTurn' },
    { type: 'capture', unitId: flank.id },
  );
  const replayed = replayCommands(initialState, commands);
  if (!replayed.ok) throw new Error(replayed.error);
  const gameState = replayed.value;
  expect(gameState.winner).toBe('red');
  let raw = '';
  const result = saveGame(
    {
      getItem: () => null,
      setItem: (_, value) => {
        raw = value;
      },
      removeItem: () => {},
    },
    MANUAL_SAVE_KEY,
    {
      mapId: scenario.id,
      initialState,
      gameState,
      commands,
      difficulty: 'normal',
      mode: 'cpu',
      humanPlayer: 'blue',
    },
  );
  expect(result.ok).toBe(true);
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem('ministr.locale', 'en');
      localStorage.setItem(key, value);
    },
    { key: MANUAL_SAVE_KEY, value: raw },
  );
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('#title-continue').click();
  await page.locator('#view-replay').click();
  await expect(page.locator('#replay-viewpoint')).toHaveValue('blue');
  await expect(page.locator('.board .unit.blue').first()).toBeAttached();
  await expect(page.locator('.board .unit.red')).toHaveCount(0);
  await page.locator('#replay-exit').click();
  await page.locator('#restart').click();
  await expect(page.locator('[name="human-player"][value="blue"]')).toBeChecked();
  await expect(page.locator('#briefing-title')).toHaveText('Highland Crossing');
  await expect(page.locator('#briefing-copy')).toContainText('northern highlands');
});
