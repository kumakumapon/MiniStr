import { expect, type Page } from '@playwright/test';
import { test } from './helpers/engineTest';
import { fourArmyActionFixture } from './helpers/fourArmyActionFixture';
import { operation, valueOf } from '../../src/game/operations.fixture';
import { applyGameCommand, createScenarioInitialState, saveGame, type GameCommand } from '../../src/game';

test.describe.configure({ mode: 'parallel' });
async function open(page: Page, text: string, locale = 'en', hotseat = false) {
  await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('#briefing-match-variants').selectOption('4');
  await page.locator('.four-tools').evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator('#four-file').setInputFiles({ name: 'four.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  if (hotseat) await expect(page.locator('#four-handoff-start')).toBeVisible();
  else await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '停止状態で読み込みました。' : 'Loaded and paused.');
}
async function count(page: Page) {
  return Number((await page.locator('#four-turn').textContent())?.match(/(\d+) (?:commands|命令)/)?.[1]);
}
async function freeze(page: Page) {
  const now = new Date('2026-11-19T00:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
}
for (const { width, locale } of [
  { width: 1280, locale: 'ja' },
  { width: 390, locale: 'en' },
]) {
  test(`four-army capture, independent preferences and cached replay ${width}/${locale}`, async ({ page }, info) => {
    const fixture = fourArmyActionFixture('capture');
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem('ministr.battleScene.settings', '{"twoArmy":false,"multiArmy":true}'));
    await open(page, fixture.text, locale);
    await freeze(page);
    const unit = fixture.before.units.find((u) => fixture.command.type === 'capture' && u.id === fixture.command.unitId)!;
    await page.locator(`#four-board > [data-x="${unit.position!.x}"][data-y="${unit.position!.y}"]`).click();
    await page.locator('[data-human-action="capture"]').click();
    await expect(page.locator('.four-action-scene .action-scene-capture')).toBeVisible();
    await expect(page.locator('.action-capture-progress')).toHaveAttribute('aria-valuenow', '100');
    await expect(page.locator('.action-scene')).toContainText(locale === 'ja' ? '第3軍' : 'Army 3');
    await expect(page.locator('#four-army-screen')).toHaveAttribute('inert', '');
    await page.screenshot({ path: info.outputPath(`systems-four-action-${width}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.locator('#action-scenes-multiArmy-overlay').press('Space');
    await expect(page.locator('.action-scene')).toHaveCount(0);
    await expect(page.locator('#four-army-screen')).not.toHaveAttribute('inert', '');
    expect(await count(page)).toBe(fixture.count + 1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.battleScene.settings')!))).toEqual({ twoArmy: false, multiArmy: true });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.actionScene.settings')!))).toEqual({ twoArmy: true, multiArmy: false });
    await page.locator('.four-playback-options').evaluate((e) => ((e as HTMLDetailsElement).open = true));
    await page.locator('#four-replay').click();
    await page.locator('.four-playback-options').evaluate((e) => ((e as HTMLDetailsElement).open = true));
    const seek = async () => {
      await page.locator('#four-position').evaluate((e, n) => {
        (e as HTMLInputElement).value = String(n);
        e.dispatchEvent(new Event('change', { bubbles: true }));
      }, fixture.count);
      await expect.poll(() => count(page)).toBe(fixture.count);
    };
    await seek();
    await page.locator('#four-step').click();
    await expect.poll(() => count(page)).toBe(fixture.count + 1);
    await expect(page.locator('.action-scene')).toHaveCount(0);
    await page.locator('#action-scenes-multiArmy').check();
    await seek();
    await page.locator('#four-step').click();
    await expect(page.locator('.action-scene-capture')).toBeVisible();
    await page.locator('#tactical-scene-skip').press('Escape');
    await expect(page.locator('.action-scene')).toHaveCount(0);
  });
}
test('four-army CPU supply blocks progress, resumes when disabled and cancels on pause/menu/background', async ({ page }) => {
  const fixture = fourArmyActionFixture('logistics', 'spectator');
  await open(page, fixture.text);
  await freeze(page);
  const show = async () => {
    await page.locator('#four-toggle').click();
    await page.clock.runFor(150);
    await expect(page.locator('.four-action-scene .action-scene-logistics')).toBeVisible();
    await expect(page.locator('.action-logistics-card')).toContainText('63 → 70');
  };
  const reload = async () => {
    await page.locator('.four-tools').evaluate((e) => ((e as HTMLDetailsElement).open = true));
    await page.locator('#four-file').setInputFiles({ name: 'four.json', mimeType: 'application/json', buffer: Buffer.from(fixture.text) });
    await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  };
  await show();
  const first = await count(page);
  await page.clock.runFor(1000);
  expect(await count(page)).toBe(first);
  await page.locator('#action-scenes-multiArmy-overlay').press('Space');
  await page.clock.runFor(500);
  await expect.poll(() => count(page)).toBeGreaterThan(first);
  await page.locator('#four-toggle').click();
  await page.locator('#action-scenes-multiArmy').check();
  await reload();
  await show();
  const at = await count(page);
  await page.locator('#spectate-scene-pause').press('Enter');
  await page.clock.runFor(5000);
  await expect(page.locator('.action-scene')).toHaveCount(0);
  expect(await count(page)).toBe(at);
  await reload();
  await show();
  await page.locator('#spectate-scene-menu').press('Enter');
  await page.clock.runFor(5000);
  await expect(page.locator('#four-start')).toBeVisible();
  await expect(page.locator('.action-scene')).toHaveCount(0);
  await reload();
  await show();
  const last = await count(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.clock.runFor(5000);
  await expect(page.locator('.action-scene')).toHaveCount(0);
  expect(await count(page)).toBe(last);
});
test('four-army hotseat supply remains concealed until the next human starts', async ({ page }, info) => {
  const fixture = fourArmyActionFixture('logistics', 'hotseat');
  await open(page, fixture.text, 'en', true);
  await freeze(page);
  await page.locator('#four-handoff-start').click();
  await page.locator('[data-human-action="endTurn"]').click();
  await expect(page.locator('#four-handoff-start')).toBeVisible();
  await expect(page.locator('#four-board')).toHaveCount(0);
  await expect(page.locator('.action-scene')).toHaveCount(0);
  await page.locator('#four-handoff-start').click();
  await expect(page.locator('.action-scene-logistics')).toBeVisible();
  await expect(page.locator('.action-scene')).toContainText('Army 3');
  await page.screenshot({ path: info.outputPath('systems-four-supply.png'), animations: 'disabled' });
  await page.locator('#tactical-scene-skip').press('Enter');
  expect(await count(page)).toBe(fixture.count + 1);
});
for (const { width, locale } of [
  { width: 1280, locale: 'en' },
  { width: 390, locale: 'ja' },
]) {
  test(`two-army capture preference preserves results and other settings ${width}/${locale}`, async ({ page }, info) => {
    const scenario = operation({ board: { width: 8, height: 4, cells: [[0, 1, 'city']] } });
    const initial = createScenarioInitialState(scenario);
    const saved = valueOf(
      saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'fixture', {
        mapId: scenario.id,
        difficulty: 'normal',
        initialState: initial,
        gameState: initial,
        commands: [],
      }),
    );
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(
      ({ saved, locale }) => {
        localStorage.setItem('ministr.locale', locale);
        if (!localStorage.getItem('ministr.save.manual')) localStorage.setItem('ministr.save.manual', JSON.stringify(saved));
      },
      { saved, locale },
    );
    page.on('dialog', (d) => d.accept());
    await page.goto('/');
    await page.locator('#title-continue').click();
    await page.locator('#action-scenes-twoArmy').uncheck();
    const capture = async () => {
      await page.locator('.tile[data-x="0"][data-y="1"]').click();
      await page.locator('#capture').click();
    };
    await capture();
    await expect(page.locator('.action-scene')).toHaveCount(0);
    await page.locator('#save').click();
    const off = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
    expect(off.gameState).toEqual(valueOf(applyGameCommand(initial, { type: 'capture', unitId: 'r1' })));
    await page.evaluate((saved) => localStorage.setItem('ministr.save.manual', JSON.stringify(saved)), saved);
    await page.reload();
    await expect(page.locator('#action-scenes-twoArmy-title')).not.toBeChecked();
    await expect(page.locator('#battle-scenes-twoArmy-title')).toBeChecked();
    await page.locator('#action-scenes-twoArmy-title').check();
    await page.locator('#title-continue').click();
    await freeze(page);
    await capture();
    await expect(page.locator('.action-scene-capture')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`systems-two-action-${width}.png`), animations: 'disabled' });
    await page.locator('#action-scenes-twoArmy-overlay').press('Space');
    await expect(page.locator('.action-scene')).toHaveCount(0);
    await page.locator('#save').click();
    const on = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
    expect(on.gameState).toEqual(off.gameState);
    expect(on.commands).toEqual(off.commands);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.actionScene.settings')!))).toEqual({ twoArmy: false, multiArmy: true });
  });
}
test('two-army hotseat supply uses the same independent action setting', async ({ page }) => {
  const scenario = operation();
  const initial = createScenarioInitialState(scenario);
  const commands: GameCommand[] = [{ type: 'move', unitId: 'r2', destination: { x: 0, y: 3 } }, { type: 'endTurn' }];
  const state = commands.reduce((s, c) => valueOf(applyGameCommand(s, c)), initial);
  const saved = valueOf(
    saveGame({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, 'fixture', {
      mapId: scenario.id,
      difficulty: 'normal',
      mode: 'hotseat',
      initialState: initial,
      gameState: state,
      commands,
    }),
  );
  await page.addInitScript((saved) => {
    localStorage.setItem('ministr.locale', 'en');
    localStorage.setItem('ministr.save.manual', JSON.stringify(saved));
  }, saved);
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.locator('#title-continue').click();
  await freeze(page);
  await page.locator('#handoff-start').click();
  await page.locator('#end').click();
  await expect(page.locator('.action-scene')).toHaveCount(0);
  await page.locator('#handoff-start').click();
  await expect(page.locator('.action-scene-logistics')).toBeVisible();
  await page.locator('#action-scenes-twoArmy-overlay').press('Space');
  await expect(page.locator('.action-scene')).toHaveCount(0);
  await expect(page.locator('#battle-scenes-twoArmy')).toBeChecked();
});
