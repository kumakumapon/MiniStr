import { expect, type Page } from '@playwright/test';
import { test } from './helpers/engineTest';
import { freezeSceneClock } from './helpers/sceneClock';
import { createExpandedBattleMap } from '../../src/game/expandedBattleMap';
import { createFourArmyState } from '../../src/game/fourArmyEngine';
import { defaultFourArmyCpuSettings } from '../../src/ai/fourArmyCpu';
import { fourArmyControllers } from '../../src/game/fourArmyControl';
import { initialFourArmyExperience, fourArmyExperienceManifest } from '../../src/game/fourArmyExperience';
import { encodeFourArmySpectatorSave, parseFourArmySpectatorSave, type FourArmySpectatorSave } from '../../src/game/fourArmySpectatorSave';
import type { GameResult } from '../../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
test.describe.configure({ mode: 'parallel' });
async function open(page: Page, locale = 'en') {
  await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.locator('#title-four-army').click();
}
async function tools(page: Page) {
  await page.locator('.four-tools').evaluate((e) => ((e as HTMLDetailsElement).open = true));
}
async function saved(page: Page) {
  return value(parseFourArmySpectatorSave(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!)));
}
for (const { width, locale } of [
  { width: 1280, locale: 'ja' },
  { width: 390, locale: 'en' },
]) {
  test(`new three-army layout and CPU persist through capture, restore and replay ${width}/${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, locale);
    await page.locator('#four-map').selectOption('compact');
    await page.locator('#four-count').selectOption('3');
    await page.locator('#four-seed').fill('42');
    await page.locator('#four-start').click();
    await expect(page.locator('#four-board > button')).toHaveCount(252);
    await expect(page.locator('#four-upgrade-cpu')).toHaveCount(0);
    await freezeSceneClock(page);
    await page.locator('#four-board > [data-x="8"][data-y="4"]').click();
    await expect(page.locator('#four-selection')).toContainText(locale === 'ja' ? '工場' : 'Factory');
    await page.locator('#four-board > [data-x="7"][data-y="2"]').click();
    await page.locator('#four-board > [data-x="7"][data-y="3"]').click();
    await page.locator('[data-human-action="capture"]').click();
    await expect(page.locator('.action-scene-capture')).toBeVisible();
    await page.locator('#tactical-scene-skip').press('Enter');
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '2');
    await tools(page);
    await page.locator('[data-save-slot="0"]').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).not.toBeNull();
    const before = await saved(page);
    expect(before.cpuVersion).toBe('four-army-cpu-v7');
    expect(before.archive.payload.map.match?.layoutVersion).toBe(3);
    expect(before.archive.payload.map.board.terrain[4]![8]!.kind).toBe('factory');
    expect(before.archive.payload.commands.map((c) => c.type)).toEqual(['move', 'capture']);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`systems-v1525-three-${width}-${locale}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.reload();
    await page.locator('#title-four-army').click();
    await tools(page);
    await page.locator('[data-load-slot="0"]').click();
    await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '停止状態で読み込みました。' : 'Loaded and paused.');
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '2');
    await expect(page.locator('#four-upgrade-cpu')).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'));
    await page.locator('.four-playback-options').evaluate((e) => ((e as HTMLDetailsElement).open = true));
    await page.locator('#four-replay').click();
    await page.locator('.four-playback-options').evaluate((e) => ((e as HTMLDetailsElement).open = true));
    await expect(page.locator('#four-replay-count')).toHaveText('0/2');
    await page.locator('#four-step').click();
    await expect(page.locator('#four-replay-count')).toHaveText('1/2');
    await page.locator('#four-step').click();
    await expect(page.locator('.action-scene-capture')).toBeVisible();
    await page.locator('#tactical-scene-skip').press('Enter');
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '2');
    await expect(page.locator('#four-board > [data-x="7"][data-y="3"] .unit.army1')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe(stored);
    expect((await saved(page)).archive.payload).toEqual(before.archive.payload);
  });
}
test('old v6 three-army save keeps its layout and only changes CPU when explicitly upgraded', async ({ page }) => {
  const map = value(createExpandedBattleMap({ participants: ['army1', 'army2', 'army3'], seed: 42, rules: { version: 1, tactics: true } })),
    state = value(createFourArmyState(map)),
    controllers = fourArmyControllers(['army1']);
  const old: FourArmySpectatorSave = {
    format: 'ministr-four-army-configurable',
    schemaVersion: 6,
    cpuVersion: 'four-army-cpu-v6',
    name: 'Old three-army record',
    savedAt: '2026-11-19T00:00:00.000Z',
    settings: defaultFourArmyCpuSettings(),
    controllers,
    controlHistory: { initial: controllers, events: [] },
    experience: fourArmyExperienceManifest(initialFourArmyExperience(state, 0)),
    view: 'army1',
    speed: 1,
    archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, state, commands: [] } },
  };
  await open(page);
  await tools(page);
  await page.locator('#four-file').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(value(encodeFourArmySpectatorSave(old))) });
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  await tools(page);
  await page.locator('[data-save-slot="0"]').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).not.toBeNull();
  expect((await saved(page)).cpuVersion).toBe('four-army-cpu-v6');
  await page.locator('#four-upgrade-cpu').evaluate((e) => ((e.closest('details') as HTMLDetailsElement).open = true));
  await page.locator('#four-upgrade-cpu').click();
  await expect(page.locator('#four-upgrade-cpu')).toHaveCount(0);
  await tools(page);
  await page.locator('[data-save-slot="0"]').click();
  await expect.poll(async () => (await saved(page)).cpuVersion).toBe('four-army-cpu-v7');
  const next = await saved(page);
  expect(next.archive.payload).toEqual(old.archive.payload);
  expect(next.archive.payload.map.match?.layoutVersion).toBe(2);
  expect(next.archive.payload.map.board.terrain[5]![8]!.kind).toBe('factory');
});
