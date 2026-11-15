import { expect, type Page } from '@playwright/test';
import { test } from './helpers/engineTest';
import { fourArmyHumanFinishedFixture } from '../../src/game/fourArmyHuman.fixture';
import { encodeFourArmySpectatorSave, parseFourArmySpectatorSave } from '../../src/game/fourArmySpectatorSave';

test.describe.configure({ mode: 'parallel' });
async function open(page: Page, locale = 'en') {
  await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('#title-four-army').click();
}
async function tools(page: Page) {
  await page.locator('.four-tools').evaluate((e) => ((e as HTMLDetailsElement).open = true));
}
const auto = (page: Page) => page.evaluate(() => localStorage.getItem('ministr.fourArmy.autosave'));
for (const width of [1280, 390]) {
  test(`turn-start autosave, undo branch, private history and paused restore ${width}`, async ({ page }, info) => {
    const locale = width === 390 ? 'en' : 'ja';
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('ministr.fourArmy.save.2', 'manual original'));
    await open(page, locale);
    await page.locator('#four-start').click();
    await expect.poll(() => auto(page)).not.toBeNull();
    const original = (await auto(page))!;
    const initial = parseFourArmySpectatorSave(original);
    expect(initial.ok && initial.value.archive.payload.commands).toEqual([]);
    await page.locator('#four-board > [data-x="4"][data-y="4"]').click();
    await page.locator(width === 390 ? '[data-quick-action="wait"]' : '[data-human-action="wait"]').click();
    await expect(page.locator('#four-undo')).toBeEnabled();
    await expect(page.locator('#four-events')).toContainText(locale === 'ja' ? '行動終了' : 'waited');
    expect(await auto(page)).toBe(original);
    await tools(page);
    await page.locator('[data-save-slot="0"]').click();
    await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '4軍専用枠へ保存しました。' : 'Saved to the four-army slot.');
    await page.locator('#four-undo').click();
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '0');
    await expect(page.locator('#four-undo')).toBeDisabled();
    await expect(page.locator('#four-events')).not.toContainText(locale === 'ja' ? '行動終了' : 'waited');
    await page.keyboard.press('Escape');
    await page.locator('#four-board > [data-x="5"][data-y="4"]').click();
    await page.locator(width === 390 ? '[data-quick-action="wait"]' : '[data-human-action="wait"]').click();
    await tools(page);
    await page.locator('[data-save-slot="0"]').click();
    await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '4軍専用枠へ保存しました。' : 'Saved to the four-army slot.');
    const raw = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
    const checked = parseFourArmySpectatorSave(raw);
    expect(checked.ok).toBe(true);
    if (!checked.ok || checked.value.format !== 'ministr-four-army-configurable' || checked.value.schemaVersion !== 4) throw Error('Expected schema4');
    expect(checked.value.archive.payload.commands).toEqual([{ actor: 'army1', type: 'wait', unitId: 'u2' }]);
    expect(checked.value.experience.events.army1).toEqual([1]);
    await page.locator('#four-recon').click();
    await page.locator('#four-board > [data-x="16"][data-y="16"]').click();
    await expect(page.locator('#four-undo')).toBeDisabled();
    await page
      .locator('.four-history')
      .last()
      .evaluate((e) => ((e as HTMLDetailsElement).open = true));
    await page.screenshot({ path: info.outputPath(`v1520-support-${locale}-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await tools(page);
    await page.locator('#four-auto-load').click();
    await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '停止状態で読み込みました。' : 'Loaded and paused.');
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '0');
    await expect(page.locator('#four-undo')).toBeDisabled();
    await expect(page.locator('#four-toggle')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.2'))).toBe('manual original');
    expect(await auto(page)).toBe(original);
  });
}

test('an unknown autosave is preserved, exported as its original, and deleted separately from manual slots', async ({ page }) => {
  const original = '{"format":"ministr-four-army-configurable","schemaVersion":999}';
  await page.addInitScript((original) => {
    localStorage.setItem('ministr.fourArmy.autosave', original);
    localStorage.setItem('ministr.fourArmy.save.1', 'manual original');
  }, original);
  await open(page);
  await page.locator('#four-start').click();
  await tools(page);
  await expect(page.locator('#four-auto-status')).toContainText('Existing autosave could not be verified');
  expect(await auto(page)).toBe(original);
  const downloaded = page.waitForEvent('download');
  await page.locator('#four-auto-export').click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('ministr-four-army-autosave-original.json');
  const { readFile } = await import('node:fs/promises');
  expect(await readFile((await file.path())!, 'utf8')).toBe(original);
  await page.locator('#four-auto-delete').click();
  expect(await auto(page)).toBeNull();
  await expect(page.locator('#four-auto-status')).toHaveText('No autosave yet.');
  expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe('manual original');
});

test('terminal summary and rematch preserve actual record conditions; a personal loss exposes no full summary', async ({ page }) => {
  const loss = encodeFourArmySpectatorSave(fourArmyHumanFinishedFixture());
  const complete = encodeFourArmySpectatorSave(fourArmyHumanFinishedFixture('army1', true));
  if (!loss.ok || !complete.ok) throw Error('Invalid result fixture');
  await open(page);
  await page.locator('#four-mode').selectOption('spectator');
  await page.locator('#four-start').click();
  for (const [raw, terminal] of [
    [loss.value, false],
    [complete.value, true],
  ] as const) {
    await tools(page);
    await page.locator('#four-import').click();
    await page.locator('#four-file').setInputFiles({ name: 'result.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
    await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
    await expect(page.locator('#four-result-title')).toHaveCount(terminal ? 1 : 0);
  }
  await expect(page.locator('#four-result-title')).toHaveText('Army 4 wins');
  await expect(page.locator('.four-result tbody tr')).toHaveCount(4);
  await page.locator('#four-rematch').click();
  await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '0');
  await expect(page.locator('#four-result-title')).toHaveCount(0);
  await expect(page.locator('#four-view')).toHaveValue('army1');
  await expect(page.locator('#four-toggle')).toBeHidden();
  await tools(page);
  await page.locator('[data-save-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.');
  const saved = parseFourArmySpectatorSave(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!));
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw Error(saved.error);
  const source = parseFourArmySpectatorSave(complete.value);
  if (!source.ok) throw Error(source.error);
  expect(saved.value.cpuVersion).toBe(source.value.cpuVersion);
  expect(saved.value.settings).toEqual(source.value.settings);
  expect(saved.value.archive.payload.map).toEqual(source.value.archive.payload.map);
});
