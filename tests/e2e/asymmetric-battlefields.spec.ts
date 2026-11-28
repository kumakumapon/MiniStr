import { expect } from '@playwright/test';
import { test } from './helpers/engineTest';
import { createExpandedBattleMap } from '../../src/game/expandedBattleMap';
import { createFourArmyState, applyFourArmyCommand, type FourArmyCommand } from '../../src/game/fourArmyEngine';
import { fourArmyControllers } from '../../src/game/fourArmyControl';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from '../../src/game/fourArmyExperience';
import { defaultFourArmyCpuSettings } from '../../src/ai/fourArmyCpu';
import type { GameResult } from '../../src/game/types';
import { encodeFourArmySpectatorSave, parseFourArmySpectatorSave } from '../../src/game/fourArmySpectatorSave';
test.describe.configure({ mode: 'parallel' });
for (const [source, name, count] of [
  ['canyon', '峡谷の関門', 3],
  ['marsh', '湿地の突破', 4],
  ['river', '渡河作戦', 4],
  ['tundra', '凍土の防衛線', 3],
] as const) {
  test(`starts standard ${source} in two clicks`, async ({ page }) => {
    await page.goto('/');
    await page.locator(`.title-map-card[data-map-id="${source}"]`).click();
    await expect(page.locator('#briefing-match-variants')).toHaveValue('standard');
    await expect(page.locator('#briefing-match-variants option')).toHaveCount(source === 'tundra' ? 2 : 3);
    await page.getByRole('button', { name: '作戦開始', exact: true }).click();
    await expect(page.locator('.battlefield-heading h2')).toContainText(name);
  });
  test(`assigns ${source} sites independently of initiative and restores the record`, async ({ page }, info) => {
    const width = count === 3 ? 390 : 1280;
    await page.setViewportSize({ width, height: 844 });
    page.on('dialog', (d) => d.accept());
    await page.goto('/');
    await page.locator(`.title-map-card[data-map-id="${source}"]`).click();
    await page.locator('#briefing-match-variants').selectOption(String(count));
    if (source === 'tundra') {
      await page.locator('#four-setup-summary').click();
      await page.locator('#four-reserve').selectOption('army2');
      await expect(page.locator('#four-site-army4')).toHaveValue('1');
      await expect(page.locator('#four-order-1')).toHaveValue('army4');
      await page.locator('#four-reserve').selectOption('army4');
      await page.locator('#four-setup-summary').click();
    }
    await page.locator('#four-site-army1').selectOption(String(count - 1));
    await expect(page.locator(`#four-site-army${count}`)).toHaveValue('0');
    await expect(page.locator('.four-start-sites .map-preview-unit')).toHaveCount(0);
    await expect(page.locator('#four-site-army1 option:checked')).toContainText(count === 3 ? '東' : '南');
    await page.locator('.four-start-card').screenshot({ path: info.outputPath(`systems-asymmetric-${source}-${width}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.locator('#four-start').click();
    await expect(page.locator('#four-board > button')).toHaveCount(252);
    if (source === 'tundra') {
      await expect(page.locator('.four-objectives')).toContainText('第15ラウンド');
      await expect(page.locator('.four-map-panel')).toHaveClass(/theme-snow/);
    }
    await page.locator('[data-four-unit]').first().click();
    await page.locator('[data-human-action="wait"]').click();
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '1');
    await page.locator('.four-tools').evaluate((e) => {
      (e as HTMLDetailsElement).open = true;
    });
    await page.locator('[data-save-slot="0"]').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).not.toBeNull();
    const stored = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
    const save = parseFourArmySpectatorSave(stored);
    expect(save.ok).toBe(true);
    if (!save.ok) throw Error(save.error);
    const map = save.value.archive.payload.map;
    expect(map.match).toMatchObject({
      sourceMapId: source,
      layoutVersion: 5,
      siteArmies: Array.from({ length: count }, (_, i) => 'army' + (i === 0 ? count : i === count - 1 ? 1 : i + 1)),
      initialOrder: Array.from({ length: count }, (_, i) => 'army' + (i + 1)),
    });
    await page.reload();
    await page.locator(`.title-map-card[data-map-id="${source}"]`).click();
    await page.locator('#briefing-match-variants').selectOption(String(count));
    await page.locator('.four-tools').evaluate((e) => {
      (e as HTMLDetailsElement).open = true;
    });
    await page.locator('[data-load-slot="0"]').click();
    await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '1');
    const h = map.capitals.army1;
    await expect(page.locator(`#four-board [data-x="${h.x}"][data-y="${h.y}"] .facility-capital.army1`)).toHaveCount(1);
    await page.locator('.four-playback-options').evaluate((e) => {
      (e as HTMLDetailsElement).open = true;
    });
    await page.locator('#four-replay').click();
    await expect(page.locator('#four-replay-count')).toHaveText('0/1');
    await page.locator('#four-replay-end').click();
    await expect(page.locator('#four-replay-count')).toHaveText('1/1');
    expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe(stored);
  });
}

test('the eliminated marsh commander can watch the remaining armies and rematch at the same sites', async ({ page }) => {
  const value = <T>(r: GameResult<T>) => {
    if (!r.ok) throw Error(r.error);
    return r.value;
  };
  const map = value(
    createExpandedBattleMap({ sourceMapId: 'marsh', layoutVersion: 4, participants: ['army1', 'army2', 'army3'], rules: { version: 1, tactics: false }, seed: 33501 }),
  );
  let state = value(createFourArmyState(map)),
    experience = initialFourArmyExperience(state, 0);
  const commands: FourArmyCommand[] = [];
  const apply = (c: FourArmyCommand) => {
    const next = value(applyFourArmyCommand(state, c));
    commands.push(c);
    experience = advanceFourArmyExperience(experience, state, c, next, commands.length);
    state = next;
  };
  // The western infantry takes the unguarded northern HQ. Both surviving armies are outside the defeated commander's view.
  const route = [{ x: 6, y: 7 }, { x: 7, y: 5 }, { x: 7, y: 2 }, map.capitals.army1];
  while (state.alive.includes('army1')) {
    expect(state.round.round).toBeLessThan(8);
    const actor = state.round.order[state.round.index]!;
    if (actor === 'army2') {
      const destination = route.shift();
      if (destination) apply({ actor, type: 'move', unitId: 'u6', destination });
      if (!route.length) apply({ actor, type: 'capture', unitId: 'u6' });
    }
    if (state.alive.includes('army1')) apply({ actor, type: 'endTurn' });
  }
  const controllers = fourArmyControllers(['army1']);
  const file = () =>
    value(
      encodeFourArmySpectatorSave({
        format: 'ministr-four-army-configurable',
        schemaVersion: 6,
        cpuVersion: 'four-army-cpu-v7',
        name: 'Marsh',
        savedAt: '2026-11-27T00:00:00.000Z',
        view: 'army1',
        speed: 4,
        controllers,
        controlHistory: { initial: controllers, events: [] },
        settings: defaultFourArmyCpuSettings(),
        experience: fourArmyExperienceManifest(experience),
        archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, state, commands } },
      }),
    );
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.locator('[data-map-id="marsh"]').click();
  await page.locator('#briefing-match-variants').selectOption('3');
  const importFile = () => page.locator('#four-file').setInputFiles({ name: 'marsh.json', mimeType: 'application/json', buffer: Buffer.from(file()) });
  await importFile();
  await page.locator('#four-human-watch').click();
  await expect.poll(() => page.locator('#four-army-screen').getAttribute('data-record-count').then(Number)).toBeGreaterThan(commands.length);
  await page.locator('#four-toggle').click();
  while (state.outcome.type === 'ongoing') apply({ actor: state.round.order[state.round.index]!, type: 'endTurn' });
  await importFile();
  await page.locator('#four-rematch').click();
  await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '0');
  await expect(page.locator('#four-turn')).toContainText('ラウンド 1/21');
  const home = map.capitals.army1;
  await expect(page.locator(`#four-board [data-x="${home.x}"][data-y="${home.y}"] .facility-capital.army1`)).toHaveCount(1);
});
