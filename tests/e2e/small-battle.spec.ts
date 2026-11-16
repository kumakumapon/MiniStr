import { expect, type Page } from '@playwright/test';
import { test } from './helpers/engineTest';
import { createSmallBattleMap } from '../../src/game/smallBattleMap';
import { createFourArmyState, applyFourArmyCommand } from '../../src/game/fourArmyEngine';
import { fourArmyControllers } from '../../src/game/fourArmyControl';
import { defaultFourArmyCpuSettings } from '../../src/ai/fourArmyCpu';
import { initialFourArmyExperience, fourArmyExperienceManifest } from '../../src/game/fourArmyExperience';
import { encodeFourArmySpectatorSave, parseFourArmySpectatorSave } from '../../src/game/fourArmySpectatorSave';
import type { GameResult } from '../../src/game/types';
const value = <T>(v: GameResult<T>): T => {
  if (!v.ok) throw Error(v.error);
  return v.value;
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
for (const count of [3, 4] as const)
  for (const width of [1280, 390])
    test(`compact ${count}-army human play and verified restore ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, width === 390 ? 'en' : 'ja');
      await expect(page.locator('#four-map')).toHaveValue('compact');
      await expect(page.locator('#four-ending')).toHaveValue('short');
      await page.locator('#four-count').selectOption(String(count));
      await expect(page.locator('[data-order]')).toHaveCount(count);
      await page.locator('#four-start').click();
      await expect(page.locator('#four-board > button')).toHaveCount(252);
      await expect(page.locator('#four-army-info > div')).toHaveCount(count);
      await expect(page.locator('#four-turn')).toContainText('/20');
      await expect.poll(() => page.evaluate(() => localStorage.getItem('ministr.fourArmy.autosave'))).not.toBeNull();
      const original = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.autosave'));
      await page.locator(count === 3 ? '#four-board > [data-x="8"][data-y="4"]' : '#four-board > [data-x="2"][data-y="4"]').click();
      await page.locator(width === 390 ? '[data-quick-action="wait"]' : '[data-human-action="wait"]').click();
      await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '1');
      await page.locator('#four-undo').click();
      await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '0');
      expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.autosave'))).toBe(original);
      await tools(page);
      await page.locator('[data-save-slot="0"]').click();
      await expect.poll(() => page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).not.toBeNull();
      const saved = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!),
        checked = value(parseFourArmySpectatorSave(saved));
      expect(checked.schemaVersion).toBe(5);
      expect(checked.archive.payload.map.match?.participants).toHaveLength(count);
      expect(checked.archive.payload.commands).toEqual([]);
      await page.locator('.four-playback-options').evaluate((e) => ((e as HTMLDetailsElement).open = true));
      await page.locator('#four-menu').click();
      await page.locator('#four-map').selectOption('wide');
      await tools(page);
      await page.locator('[data-load-slot="0"]').click();
      await expect(page.locator('#four-notice')).toHaveText(width === 390 ? 'Loaded and paused.' : '停止状態で読み込みました。');
      await expect(page.locator('#four-board > button')).toHaveCount(252);
      await expect(page.locator('#four-toggle')).toBeHidden();
      await page.screenshot({ path: info.outputPath(`v1521-compact-${count}-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
test('twentieth-round result, replay and rematch retain three-army conditions', async ({ page }, info) => {
  const map = value(createSmallBattleMap(3, 1521, undefined, 'short', { version: 1, tactics: true }));
  let state = value(createFourArmyState(map));
  const experience = fourArmyExperienceManifest(initialFourArmyExperience(state, 0)),
    commands = [];
  for (let i = 0; i < 60; i++) {
    const c = { actor: state.round.order[state.round.index]!, type: 'endTurn' as const };
    commands.push(c);
    state = value(applyFourArmyCommand(state, c));
  }
  const file = value(
    encodeFourArmySpectatorSave({
      format: 'ministr-four-army-configurable',
      schemaVersion: 5,
      controllers: fourArmyControllers(['army1']),
      cpuVersion: 'four-army-cpu-v5',
      experience,
      name: 'Short match',
      savedAt: '2026-11-16T00:00:00.000Z',
      settings: defaultFourArmyCpuSettings(),
      view: 'army1',
      speed: 1,
      archive: { format: 'ministr-four-army-save', schemaVersion: 4, ruleset: 'four-army-v4', payload: { map, commands, state } },
    }),
  );
  await open(page);
  await tools(page);
  await page.locator('#four-file').setInputFiles({ name: 'short.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await expect(page.locator('#four-result-title')).toHaveText('Draw');
  await expect(page.locator('.four-result tbody tr')).toHaveCount(3);
  await expect(page.locator('.four-result')).toContainText('20-round decision');
  await page.screenshot({ path: info.outputPath('v1521-compact-result.png'), fullPage: true });
  await page.locator('.four-playback-options').evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator('#four-menu').click();
  await page.locator('#four-map').selectOption('wide');
  await page.locator('#four-return').click();
  await page.locator('#four-rematch').click();
  await expect(page.locator('#four-board > button')).toHaveCount(252);
  await expect(page.locator('#four-turn')).toContainText('/20');
  await expect(page.locator('#four-army-info > div')).toHaveCount(3);
  await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '0');
});
test('three-army hotseat hides CPU intervals and never presents an inactive fourth army', async ({ page }) => {
  await open(page);
  await page.locator('#four-count').selectOption('3');
  await page.locator('#four-mode').selectOption('custom');
  await expect(page.locator('[data-controller]')).toHaveCount(3);
  await page.locator('#four-controller-army2').selectOption('cpu');
  await page.locator('#four-controller-army3').selectOption('human');
  await page.locator('#four-start').click();
  await expect(page.locator('#four-board')).toHaveCount(0);
  await page.locator('#four-handoff-start').click();
  await expect(page.locator('#four-army-info > div')).toHaveCount(3);
  await expect(page.locator('#four-view')).toHaveValue('army1');
  await page.locator('.four-playback-options').evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator('#four-speed').selectOption('4');
  await page.locator('[data-human-action="endTurn"]').click();
  await expect(page.locator('#four-board')).toHaveCount(0);
  await expect(page.locator('#four-handoff-title')).toContainText('Army 3');
  await page.locator('#four-handoff-start').click();
  await expect(page.locator('#four-view')).toHaveValue('army3');
  await expect(page.locator('#four-army-info')).not.toContainText('Army 4');
});
