import { expect, test, type Page } from '@playwright/test';
import { chooseCpuAction } from '../../src/ai/rules';
import { dailyScenario } from '../../src/game/dailyChallenge';
import { applyGameCommand, createScenarioInitialState, saveGame, type GameCommand, type StorageLike } from '../../src/game';

/** A frontline day whose battlefield is 16 wide; the red hard CPU beats the easy CPU on it (verified in the unit tests). */
const DATE = '2026-02-03';
const CODE = 'D1-20260203-v3';
const NOW = new Date(`${DATE}T12:00:00Z`);

function finishedSave(): string {
  const scenario = dailyScenario(DATE);
  if (!scenario.ok) throw Error(scenario.error);
  const initialState = createScenarioInitialState(scenario.value);
  let state = initialState;
  const commands: GameCommand[] = [];
  while (!state.winner && state.turn <= 40) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy');
    const next = applyGameCommand(state, command);
    if (!next.ok) throw Error(next.error);
    commands.push(command);
    state = next.value;
  }
  const data = new Map<string, string>();
  const storage: StorageLike = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
  const saved = saveGame(storage, 'ministr.save.manual', { mapId: scenario.value.id, difficulty: 'normal', initialState, commands, gameState: state });
  if (!saved.ok) throw Error(saved.error);
  return data.get('ministr.save.manual')!;
}
const records = (...dates: string[]) =>
  JSON.stringify({
    schemaVersion: 1,
    records: dates.map((date, index) => ({ date, generation: 'd1', ruleVersion: 10, bestTurns: 10 + index, bestLosses: index, updatedAt: `${date}T00:00:00.000Z` })),
  });
async function open(page: Page, storage: Record<string, string> = {}) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((entries) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, storage);
  await page.goto('/');
}

test('starts today from the title with one action and the keyboard alone, with fixed conditions', async ({ page }) => {
  await open(page);
  const card = page.locator('.daily-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-daily-date', DATE);
  await expect(card).toContainText(CODE);
  await expect(card).toContainText('UTC基準');
  await expect(card).toContainText('日本時間では9時');
  await expect(page.locator('.daily-card .title-map-card')).toHaveCount(0);

  await page.locator('#daily-start').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#briefing-title')).toBeVisible();
  await expect(page.locator('.daily-briefing')).toContainText(CODE);
  await expect(page.locator('#begin-operation')).toBeFocused();
  await expect(page.locator('#briefing-supply-mode')).toBeDisabled();
  await expect(page.locator('input[name="match-mode"]').first()).toBeDisabled();
  await expect(page.locator('#difficulty')).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(page.locator('.board')).toBeVisible();
  await expect(page.locator('#difficulty')).toBeDisabled();
  await expect(page.locator('#map')).toHaveValue(/generated-v3-frontline-16-coast-D20260203/);
});

test('fits a phone screen and keeps every control reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { 'ministr.daily.records': records(DATE, '2026-02-02') });
  await expect(page.locator('.daily-card')).toBeVisible();
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    screen: document.querySelector('.title-screen')!.scrollWidth,
    box: document.querySelector('.title-screen')!.clientWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  expect(widths.screen).toBeLessThanOrEqual(widths.box);
  await page.locator('#title-daily-records-heading').click();
  const box = await page.locator('[data-daily-delete]').first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.locator('#daily-start').click();
  await expect(page.locator('#briefing-title')).toBeVisible();
});

test('shows records by date, deletes one, and resets all without touching operation records', async ({ page }) => {
  await open(page, { 'ministr.daily.records': records(DATE, '2026-02-02', '2026-02-01'), 'ministr.operations.records': JSON.stringify({ schemaVersion: 1, records: [] }) });
  await expect(page.locator('.daily-best')).toHaveText('最短10ターン・損失0');
  await page.locator('#title-daily-records-heading').click();
  await expect(page.locator('.daily-record-list li')).toHaveCount(3);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(`[data-daily-delete="2026-02-02"]`).click();
  await expect(page.locator('.daily-record-list li')).toHaveCount(2);
  await expect(page.locator('#title-daily-records-heading')).toBeFocused();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#daily-records-reset').click();
  await expect(page.locator('.daily-record-list')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ministr.daily.records'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('ministr.operations.records'))).not.toBeNull();
});

test('records a red victory, copies the ID and retries the same battlefield', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, { 'ministr.save.manual': finishedSave() });
  await page.locator('#title-continue').click();
  await expect(page.locator('.daily-result')).toContainText(CODE);
  await expect(page.locator('.daily-result')).toContainText('最良記録を更新しました');
  await page.locator('#daily-copy-id').click();
  await expect(page.locator('.daily-result')).toContainText('識別子をコピーしました');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CODE);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.daily.records')!));
  expect(stored.records).toHaveLength(1);
  expect(stored.records[0].date).toBe(DATE);

  const heading = await page.locator('.battlefield-heading h2').textContent();
  await page.locator('#restart').click();
  await expect(page.locator('#briefing-title')).toHaveText(heading!);
  await page.locator('#begin-operation').click();
  await expect(page.locator('.battlefield-heading h2')).toHaveText(heading!);
  await expect(page.locator('.game-over')).toHaveCount(0);
});

test('restores records from a backup and reloads them in the title', async ({ page }) => {
  await open(page, { 'ministr.daily.records': records(DATE) });
  await page.locator('#title-daily-records-heading').click();
  await expect(page.locator('.daily-record-list li')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.locator('#backup-export').click();
  const backup = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of backup) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text).toContain('ministr.daily.records');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(`[data-daily-delete="${DATE}"]`).click();
  await expect(page.locator('.daily-record-list')).toHaveCount(0);

  page.on('dialog', (dialog) => {
    expect(dialog.message()).toContain('日替わりチャレンジ記録あり');
    void dialog.accept();
  });
  await page.locator('#backup-import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('.daily-best')).toHaveText('最短10ターン・損失0');
});

test('is available in English', async ({ page }) => {
  await open(page, { 'ministr.locale': 'en' });
  await expect(page.locator('.daily-card h3')).toHaveText("Today's battlefield");
  await expect(page.locator('#daily-start')).toContainText("Start today's battlefield");
  await expect(page.locator('.daily-card')).toContainText('09:00 in Japan');
  await expect(page.locator('.daily-card')).not.toContainText(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
});
