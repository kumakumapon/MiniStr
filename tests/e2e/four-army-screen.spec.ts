import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from './helpers/engineTest';
import { chooseFourArmyCpuCommand } from '../../src/ai/fourArmyCpu';
import { applyFourArmyCommand, observeFourArmy } from '../../src/game/fourArmyEngine';
import { fourArmySpectatorFixture } from '../../src/game/fourArmySpectator.fixture';
import { encodeFourArmySpectatorSave, parseFourArmySpectatorSave } from '../../src/game/fourArmySpectatorSave';

// Every case owns a fresh page/context and fixture; keep the existing worker and timeout budgets.
test.describe.configure({ mode: 'parallel' });

async function open(page: Page, locale = 'en', mode: 'spectator' | 'human' = 'spectator') {
  await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('#title-four-army').click();
  await page.locator('#four-map').selectOption('wide');
  await expect(page.locator('#four-heading')).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('#four-army-screen')).toHaveAttribute('role', 'main');
  await expect(page.locator('#four-mode')).toHaveValue('human');
  if (mode === 'spectator') await page.locator('#four-mode').selectOption('spectator');
}
async function playbackControls(page: Page) {
  await page.locator('.four-playback-options').evaluate((e) => {
    (e as HTMLDetailsElement).open = true;
  });
}
async function tools(page: Page) {
  await page.locator('.four-tools').evaluate((e) => ((e as HTMLDetailsElement).open = true));
}
async function importMatch(page: Page, text: string) {
  await tools(page);
  await page.locator('#four-file').setInputFiles({ name: 'four.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}
async function count(page: Page) {
  return Number((await page.locator('#four-turn').textContent())?.match(/(\d+) (?:commands|命令)/)?.[1]);
}

for (const { locale, width } of [
  { locale: 'ja', width: 1280 },
  { locale: 'en', width: 390 },
]) {
  test(`four-army retains old CPU until explicit upgrade ${width}/${locale}`, async ({ page, browserName }, info) => {
    const source = fourArmySpectatorFixture();
    for (let i = 0; i < 2; i++) {
      const observed = observeFourArmy(source.archive.payload.state, 'army1');
      if (!observed.ok) throw Error(observed.error);
      const command = chooseFourArmyCpuCommand(observed.value, source.settings.army1, 'four-army-cpu-v1')!;
      const next = applyFourArmyCommand(source.archive.payload.state, command);
      if (!next.ok) throw Error(next.error);
      source.archive.payload.commands.push(command);
      source.archive.payload.state = next.value;
    }
    const raw = JSON.stringify(source);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((raw) => localStorage.setItem('ministr.fourArmy.save.1', raw), raw);
    await open(page, locale);
    await importMatch(page, raw);
    await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '停止状態で読み込みました。' : 'Loaded and paused.');
    const settings = page.locator('details').filter({ has: page.locator('#four-upgrade-cpu') });
    await settings.evaluate((e) => {
      (e as HTMLDetailsElement).open = true;
    });
    await expect(page.locator('#four-upgrade-cpu')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`systems-v1515-legacy-${locale}-${width}.png`), fullPage: true });
    if (process.env.FOUR_UI_REVIEW && browserName === 'chromium')
      console.info(
        JSON.stringify({
          phase: 'four-ui-shot',
          name: `legacy-${locale}-${width}`,
          base64: (await page.screenshot({ type: 'jpeg', quality: 55, fullPage: true })).toString('base64'),
        }),
      );
    await page.locator('#four-upgrade-cpu').click();
    await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
    expect(await count(page)).toBe(2);
    expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe(raw);
    await page.locator('#four-step').click();
    await expect.poll(() => count(page)).toBe(3);
    await tools(page);
    await page.locator('[data-save-slot="1"]').click();
    await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '4軍専用枠へ保存しました。' : 'Saved to the four-army slot.');
    const stored = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.2')!);
    const checked = parseFourArmySpectatorSave(stored);
    expect(checked.ok).toBe(true);
    if (!checked.ok) throw Error(checked.error);
    expect(checked.value.cpuVersion).toBe('four-army-cpu-v7');
    expect(checked.value.archive.payload.map.pathVersion).toBeUndefined();
    expect(checked.value.archive.payload.commands.slice(0, 2)).toEqual(source.archive.payload.commands);
    expect(checked.value.archive.payload.commands[2]).toMatchObject({ type: 'move', unitId: 'u4', destination: { x: 12, y: 5 } });
  });
}

for (const locale of ['ja', 'en'])
  for (const width of [1280, 390]) {
    test(`four-army menu and spectator ${width}/${locale}`, async ({ page, browserName }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, locale);
      await page.locator('#four-seed').fill('42');
      await page.locator('#four-order-0').selectOption('army4');
      await page.locator('#four-order-3').selectOption('army1');
      await page.locator('#four-difficulty-army2').selectOption('easy');
      await page.locator('#four-policy-army3').selectOption('offensive');
      await page.screenshot({ path: info.outputPath(`systems-four-setup-${locale}-${width}.png`), fullPage: true });
      await page.locator('#four-start').click();
      await expect(page.locator('#four-turn')).toContainText(locale === 'ja' ? '第4軍' : 'Army 4');
      await expect(page.locator('#four-unit option')).toHaveCount(32);
      await page.locator('#four-zoom-in').click();
      await page.locator('#four-fit').click();
      await expect(page.locator('#four-zoom-label')).toHaveText('50%');
      expect(
        await page
          .locator('#four-board > .tile')
          .first()
          .evaluate((e) => e.getBoundingClientRect().width),
      ).toBe(22);
      await page.locator('#four-board').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#four-selection')).toContainText('(5, 4)');
      await page.locator('#four-step').click();
      await expect.poll(() => count(page)).toBe(1);
      await playbackControls(page);
      await page.locator('#four-speed').selectOption('4');
      await page.locator('#four-toggle').click();
      await expect.poll(() => count(page)).toBeGreaterThanOrEqual(3);
      const target = await page.locator('#four-toggle').boundingBox();
      if (!target) throw Error('Pause control missing');
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
      await page.mouse.down();
      const pressedAt = await count(page);
      await expect.poll(() => count(page)).toBeGreaterThan(pressedAt);
      await page.mouse.up();
      await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
      const paused = await count(page);
      await page.waitForTimeout(250);
      expect(await count(page)).toBe(paused);
      await page.locator('#four-view').selectOption('army1');
      await page.locator('.four-armies summary').click();
      await expect(page.locator('#four-army-info')).toContainText(locale === 'ja' ? '資金非公開' : 'Funds hidden');
      await expect(page.locator('#four-unit option')).toHaveCount(8);
      await page.locator('.four-armies summary').click();
      await page.locator('#four-view').selectOption('all');
      await page.evaluate(() => scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: info.outputPath(`systems-four-watch-${locale}-${width}.png`), fullPage: true });
      if (process.env.FOUR_UI_REVIEW === '1' && browserName === 'chromium' && ((width === 1280 && locale === 'ja') || (width === 390 && locale === 'en'))) {
        const jpeg = await page.screenshot({ type: 'jpeg', quality: 65, fullPage: true });
        console.info(JSON.stringify({ phase: 'four-ui-shot', name: `${locale}-${width}`, base64: jpeg.toString('base64') }));
      }
      await page.locator('#four-locale').selectOption(locale === 'ja' ? 'en' : 'ja');
      await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
      await page.locator('#four-menu').click();
      await page.locator('#four-return').click();
      await page.locator('#four-close').click();
      await expect(page.locator('#title-four-army')).toBeFocused();
    });
  }

test('four-army dedicated saves, JSON and replay preserve current state and legacy storage', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('ministr.fourArmy.'))));
  await page.locator('#four-start').click();
  await page.locator('#four-step').click();
  await expect.poll(() => count(page)).toBe(1);
  await page.locator('#four-view').selectOption('army3');
  await playbackControls(page);
  await page.locator('#four-speed').selectOption('2');
  await tools(page);
  await page.locator('#four-name').fill('<record & four>');
  await page.locator('[data-save-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.');
  await page.locator('[data-save-slot="1"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.');
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('ministr.fourArmy.'))))).toEqual(before);
  const downloaded = page.waitForEvent('download');
  await page.locator('#four-export').click();
  const path = await (await downloaded).path();
  if (!path) throw Error('Download missing');
  const raw = await readFile(path, 'utf8');
  const checked = parseFourArmySpectatorSave(raw);
  expect(checked.ok).toBe(true);
  if (!checked.ok) throw Error(checked.error);
  expect(checked.value.name).toBe('<record & four>');
  expect(checked.value.archive.payload.map.pathVersion).toBe(1);
  expect(checked.value.archive.payload.commands).toHaveLength(1);
  await playbackControls(page);
  await page.locator('#four-replay').click();
  await expect(page.locator('#four-replay-count')).toHaveText('0/1');
  await page.locator('#four-replay-end').click();
  await expect(page.locator('#four-replay-count')).toHaveText('1/1');
  await page.locator('#four-replay-start').click();
  await expect(page.locator('#four-replay-count')).toHaveText('0/1');
  await page.locator('#four-replay-close').click();
  expect(await count(page)).toBe(1);
  await page.reload();
  await page.locator('#title-four-army').click();
  await page.locator('#four-map').selectOption('wide');
  await tools(page);
  await page.locator('[data-load-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  await expect(page.locator('#four-view')).toHaveValue('army3');
  await expect(page.locator('#four-speed')).toHaveValue('2');
  expect(await count(page)).toBe(1);
  await importMatch(page, raw);
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  expect(await count(page)).toBe(1);
  await tools(page);
  await page.locator('#four-import-replay').click();
  await page.locator('#four-file').setInputFiles({ name: 'four.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(page.locator('#four-replay-count')).toHaveText('0/1');
  await page.locator('#four-replay-close').click();
  expect(await count(page)).toBe(1);
});

test('four-army pagehide cancels the actual module Worker before computation returns', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    const metrics = { created: 0, terminated: 0 };
    Object.assign(window, { fourWorkers: metrics });
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('fourArmyCpuWorker')) {
          metrics.created++;
          const end = this.terminate.bind(this);
          this.terminate = () => {
            metrics.terminated++;
            end();
          };
        }
      }
    };
  });
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/fourArmyCpuWorker-*.js', async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  await open(page);
  await page.locator('#four-start').click();
  await page.locator('#four-step').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { fourWorkers: { created: number } }).fourWorkers.created)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  release();
  await page.waitForTimeout(250);
  expect(await count(page)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { fourWorkers: { created: number; terminated: number } }).fourWorkers)).toEqual({ created: 1, terminated: 1 });
  await page.unrouteAll({ behavior: 'wait' });
  await page.locator('#four-step').click();
  await expect.poll(() => count(page)).toBe(1);
});

test('four-army rejects corrupt files and quota failures without replacing a slot or match', async ({ page }) => {
  await open(page);
  await page.locator('#four-start').click();
  await tools(page);
  await page.locator('[data-save-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.');
  const original = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'));
  const bad = JSON.parse(original!);
  bad.cpuVersion = 'future';
  await importMatch(page, JSON.stringify(bad));
  await expect(page.locator('#four-notice')).toContainText('Could not load');
  expect(await count(page)).toBe(0);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'ministr.fourArmy.save.1') throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
  });
  await page.locator('[data-save-slot="0"]').click();
  await expect(page.locator('#four-notice')).toContainText('Check storage capacity');
  expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe(original);
});

test('four-army resumes the 100-round boundary explicitly and retains the resume command', async ({ page }) => {
  const source = fourArmySpectatorFixture(400);
  expect(source.archive.payload.state.paused).toBe(true);
  await open(page);
  await importMatch(page, JSON.stringify(source));
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  expect(await count(page)).toBe(400);
  await page.waitForTimeout(200);
  expect(await count(page)).toBe(400);
  await page.locator('#four-step').click();
  await expect.poll(() => count(page)).toBe(402);
  await tools(page);
  await page.locator('[data-save-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.');
  const raw = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
  const parsed = parseFourArmySpectatorSave(raw);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw Error(parsed.error);
  expect(parsed.value.archive.payload.commands[400]!.type).toBe('resume');
  expect(parsed.value.schemaVersion).toBe(4);
});

test('four-army resumes a legacy record beyond its old limit and migrates on explicit save', async ({ page }) => {
  const source = fourArmySpectatorFixture(2048);
  await open(page);
  await importMatch(page, JSON.stringify(source));
  // Complete replay is now asynchronous. Keep the existing 30s test budget, including the explicit re-save.
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.', { timeout: 10000 });
  expect(await count(page)).toBe(2048);
  await expect(page.locator('#four-toggle')).toBeEnabled();
  await page.locator('#four-step').click();
  await expect.poll(() => count(page)).toBe(2049);
  await tools(page);
  await expect(page.locator('#four-export')).toBeEnabled();
  await page.locator('[data-save-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.', { timeout: 10000 });
});

test('four-army verifies a long JSON and keeps replay navigation and cancellation responsive', async ({ page }) => {
  const source = { ...fourArmySpectatorFixture(2050), schemaVersion: 2 as const };
  const encoded = encodeFourArmySpectatorSave(source);
  if (!encoded.ok) throw Error(encoded.error);
  await open(page);
  await importMatch(page, encoded.value);
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.', { timeout: 10000 });
  expect(await count(page)).toBe(2050);
  await playbackControls(page);
  await page.locator('#four-replay').click();
  await expect(page.locator('#four-replay-count')).toHaveText('0/2050');
  await page.locator('#four-replay-end').click();
  await expect(page.locator('#four-replay-count')).toHaveText('2050/2050');
  await page.locator('#four-replay-start').click();
  await expect(page.locator('#four-replay-count')).toHaveText('0/2050');
  await page.locator('#four-position').evaluate((e) => {
    (e as HTMLInputElement).value = '1900';
  });
  await page.locator('#four-position').dispatchEvent('change');
  await page.locator('#four-menu').click();
  await page.locator('#four-return').click();
  expect(await count(page)).toBe(2050);
  await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
});

async function humanTile(page: Page, x: number, y: number) {
  await page.locator(`#four-board > [data-x="${x}"][data-y="${y}"]`).click();
}
for (const armyIndex of [0, 1, 2, 3]) {
  for (const width of [1280, 390]) {
    test(`human four-army control ${armyIndex + 1}/${width}`, async ({ page, browserName }, info) => {
      const { rotateFourArmy32 } = await import('../../src/game/fourArmyMap32');
      const locale = width === 390 ? 'en' : 'ja',
        human = `army${armyIndex + 1}`;
      await page.setViewportSize({ width, height: 900 });
      await open(page, locale);
      await page.locator('#four-mode').selectOption('human');
      await page.locator('#four-human-army').selectOption(human);
      if (armyIndex) {
        await page.locator('#four-order-0').selectOption(human);
        await page.locator(`#four-order-${armyIndex}`).selectOption('army1');
      }
      await page.locator('#four-start').click();
      await expect(page.locator('#four-turn')).toContainText(locale === 'ja' ? 'あなたの手番' : 'Your turn');
      await expect(page.locator('#four-view')).toBeDisabled();
      await expect(page.locator('#four-view')).toHaveValue(human);
      await expect(page.locator('#four-toggle')).toBeDisabled();
      await expect(page.locator('#four-unit option')).toHaveCount(8);
      const source = rotateFourArmy32({ x: 4, y: 4 }, armyIndex),
        destination = rotateFourArmy32({ x: 3, y: 4 }, armyIndex);
      await humanTile(page, source.x, source.y);
      await expect(page.locator('#four-unit-brief')).toHaveAttribute('data-unit-id', `u${armyIndex * 8 + 1}`);
      await expect(page.locator('#four-board .reachable').first()).toBeAttached();
      await page.keyboard.press('Escape');
      expect(await count(page)).toBe(0);
      await expect(page.locator('#four-board .selected')).toHaveCount(0);
      await humanTile(page, source.x, source.y);
      await humanTile(page, destination.x, destination.y);
      if (armyIndex === 0 && browserName === 'chromium' && process.env.FOUR_UI_REVIEW) {
        await page.screenshot({ path: info.outputPath(`human-${locale}-${width}.png`), fullPage: true });
        console.info(
          JSON.stringify({
            phase: 'four-ui-shot',
            name: `human-${locale}-${width}`,
            base64: (await page.screenshot({ type: 'jpeg', quality: 60, fullPage: true })).toString('base64'),
          }),
        );
      }
      expect(await count(page)).toBe(1);
      await page.locator(width === 390 ? '[data-quick-action="wait"]' : '[data-human-action="wait"]').click();
      expect(await count(page)).toBe(2);
      await playbackControls(page);
      await page.locator('#four-speed').selectOption('4');
      await page.locator('[data-human-action="endTurn"]').click();
      await expect(page.locator('[data-human-action]')).toHaveCount(0);
      await expect(page.locator('#four-turn')).toContainText(locale === 'ja' ? 'あなたの手番' : 'Your turn', { timeout: 20000 });
      expect(await count(page)).toBeGreaterThan(3);
      await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
      await tools(page);
      await page.locator('[data-save-slot="0"]').click();
      await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '4軍専用枠へ保存しました。' : 'Saved to the four-army slot.');
      const raw = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
      const checked = parseFourArmySpectatorSave(raw);
      expect(checked.ok).toBe(true);
      if (!checked.ok) throw Error(checked.error);
      expect(checked.value).toMatchObject({ format: 'ministr-four-army-configurable', controllers: { [human]: 'human' }, view: human });
      expect(checked.value.archive.payload.commands[0]).toMatchObject({ actor: human, type: 'move', unitId: `u${armyIndex * 8 + 1}` });
      expect(new Set(checked.value.archive.payload.commands.map((c) => c.actor)).size).toBe(4);
      await page.locator('[data-load-slot="0"]').click();
      await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '停止状態で読み込みました。' : 'Loaded and paused.');
      await expect(page.locator('#four-view')).toHaveValue(human);
      await playbackControls(page);
      await page.locator('#four-replay').click();
      await expect(page.locator('[data-human-action]')).toHaveCount(0);
      await expect(page.locator('#four-view')).toBeDisabled();
      await page.locator('#four-replay-end').click();
      await page.locator('#four-replay-close').click();
      expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe(raw);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }
}
test('human loss pauses for spectator continuation and a victory record stays read-only', async ({ page }) => {
  const { fourArmyHumanFinishedFixture } = await import('../../src/game/fourArmyHuman.fixture');
  const loss = encodeFourArmySpectatorSave(fourArmyHumanFinishedFixture());
  if (!loss.ok) throw Error(loss.error);
  await open(page);
  await importMatch(page, loss.value);
  await expect(page.locator('#four-turn')).toContainText('You lost');
  await expect(page.locator('[data-human-action]')).toHaveCount(0);
  await expect(page.locator('#four-view')).toBeEnabled();
  await expect(page.locator('#four-human-watch')).toBeVisible();
  const before = await count(page);
  await page.locator('#four-human-watch').click();
  await expect.poll(() => count(page)).toBeGreaterThan(before);
  await page.locator('#four-toggle').click();
  const victory = encodeFourArmySpectatorSave(fourArmyHumanFinishedFixture('army4', true));
  if (!victory.ok) throw Error(victory.error);
  await importMatch(page, victory.value);
  await expect(page.locator('#four-turn')).toContainText('You win');
  await expect(page.locator('#four-toggle')).toBeDisabled();
  await expect(page.locator('[data-human-action]')).toHaveCount(0);
});

test('human production, embark and disembark use the public board controls', async ({ page }) => {
  await open(page);
  await page.locator('#four-mode').selectOption('human');
  await page.locator('#four-start').click();
  await humanTile(page, 5, 3);
  await expect(page.locator('#four-production-dialog')).toBeVisible();
  await page.locator('[data-production-kind="infantry"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#four-unit option')).toHaveCount(9);
  await humanTile(page, 4, 5);
  await page.locator('[data-human-action="embark"]').click();
  await humanTile(page, 4, 6);
  await expect(page.locator('#four-unit option')).toHaveCount(8);
  await playbackControls(page);
  await page.locator('#four-speed').selectOption('4');
  await page.locator('[data-human-action="endTurn"]').click();
  await expect(page.locator('#four-turn')).toContainText('Your turn', { timeout: 20000 });
  await humanTile(page, 4, 6);
  await page.locator('[data-human-action="disembark"]').click();
  await humanTile(page, 4, 5);
  await expect(page.locator('#four-selection')).toContainText('u3');
  await expect(page.locator('#four-unit option')).toHaveCount(9);
});

test('human visible combat previews and commits the explicitly chosen weapon', async ({ page }) => {
  const { fourArmyHumanFinishedFixture } = await import('../../src/game/fourArmyHuman.fixture');
  const { createFourArmyState } = await import('../../src/game/fourArmyEngine');
  const source = fourArmyHumanFinishedFixture(),
    history = source.archive.payload.commands;
  const cut = history.reduce((last, c, i) => (c.actor === 'army1' && c.type === 'endTurn' ? i : last), -1);
  const made = createFourArmyState(source.archive.payload.map);
  if (!made.ok) throw Error(made.error);
  let state = made.value;
  for (const command of history.slice(0, cut)) {
    const next = applyFourArmyCommand(state, command);
    if (!next.ok) throw Error(next.error);
    state = next.value;
  }
  source.archive.payload.commands = history.slice(0, cut);
  source.archive.payload.state = state;
  source.view = 'army1';
  const encoded = encodeFourArmySpectatorSave(source);
  if (!encoded.ok) throw Error(encoded.error);
  await open(page);
  await importMatch(page, encoded.value);
  await expect(page.locator('#four-turn')).toContainText('Your turn');
  // Clear the friendly infantry blocking the tank's only exit.
  await humanTile(page, 4, 5);
  await humanTile(page, 2, 5);
  await humanTile(page, 5, 5);
  await page.locator('#four-attack-weapon').selectOption('1');
  await humanTile(page, 3, 4);
  await expect(page.locator('#four-attack-weapon')).toHaveValue('1');
  await page.locator('#four-attack-weapon').selectOption('0');
  await page.locator('#four-board > [data-x="3"][data-y="3"]').focus();
  await expect(page.locator('#four-human-preview')).toContainText('Estimated damage');
  expect(await count(page)).toBe(history.slice(0, cut).length + 2);
  await page.locator('#four-attack-weapon').selectOption('1');
  await humanTile(page, 3, 3);
  await tools(page);
  await page.locator('[data-save-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.');
  const saved = parseFourArmySpectatorSave(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!));
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw Error(saved.error);
  expect(saved.value.archive.payload.commands.at(-1)).toEqual({ actor: 'army1', type: 'attack', unitId: 'u5', targetId: 'u25', weaponSlot: 1 });
  const humanRaw = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
  const spectator = fourArmySpectatorFixture();
  spectator.view = 'army3';
  await importMatch(page, JSON.stringify(spectator));
  await expect(page.locator('#four-view')).toHaveValue('army3');
  await expect(page.locator('#four-view')).toBeEnabled();
  await expect(page.locator('#four-human-panel')).toBeHidden();
  await importMatch(page, humanRaw);
  await expect(page.locator('#four-view')).toHaveValue('army1');
  await expect(page.locator('#four-view')).toBeDisabled();
});

test('four-army keyboard matches unit selection, direct movement, next-unit and escape controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page);
  await page.locator('#four-mode').selectOption('human');
  await page.locator('#four-start').click();
  await page.locator('#four-board > [data-x="3"][data-y="3"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#four-board > [data-x="4"][data-y="4"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#four-unit-brief')).toHaveAttribute('data-unit-id', 'u1');
  await page.keyboard.press('Space');
  expect(await count(page)).toBe(1);
  await expect(page.locator('#four-board > [data-x="3"][data-y="4"] .unit')).toBeAttached();
  await page.keyboard.press('n');
  await expect(page.locator('#four-unit-brief')).toHaveAttribute('data-unit-id', 'u2');
  await page.keyboard.press('End');
  await expect(page.locator('#four-board > [data-x="31"][data-y="4"]')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('#four-board > [data-x="0"][data-y="4"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#four-board .selected')).toHaveCount(0);
  expect(await count(page)).toBe(1);
  await expect(page.locator('#four-turn')).toContainText('Your turn');
  await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
});

for (const width of [1280, 390]) {
  test(`four-army configurable local handoff protects both players ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, width === 390 ? 'en' : 'ja');
    await page.locator('#four-mode').selectOption('custom');
    await page.locator('#four-controller-army1').selectOption('human');
    await page.locator('#four-controller-army2').selectOption('human');
    await page.locator('#four-start').click();
    await expect(page.locator('.tile')).toHaveCount(0);
    await expect(page.locator('#four-handoff-title')).toContainText(width === 390 ? 'Army 1' : '第1軍');
    await page.locator('#four-handoff-start').click();
    await expect(page.locator('#four-board > button')).toHaveCount(1024);
    await page.locator('#four-human-panel [data-human-action="endTurn"]').click();
    for (const selector of ['.tile', '#four-unit-brief', '#four-human-panel', '.mobile-action-bar', '#four-selection', '#four-events', '#four-sightings'])
      await expect(page.locator('#four-army-screen').locator(selector)).toHaveCount(0);
    await expect(page.locator('#four-handoff-title')).toContainText(width === 390 ? 'Army 2' : '第2軍');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ministr.fourArmy.autosave') ?? '{}').view)).toBe('army2');
    const automatic = parseFourArmySpectatorSave(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.autosave')!));
    expect(automatic.ok && automatic.value.archive.payload.commands).toEqual([{ actor: 'army1', type: 'endTurn' }]);
    await page.screenshot({ path: info.outputPath(`v1519-handoff-${width}.png`), fullPage: true });
    await page.locator('#four-menu').click();
    await tools(page);
    await page.locator('[data-save-slot="0"]').click();
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).not.toBeNull();
    const file = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
    const saved = parseFourArmySpectatorSave(file);
    expect(saved.ok).toBe(true);
    if (!saved.ok || saved.value.format !== 'ministr-four-army-configurable') throw Error('Missing controller allocation');
    expect(saved.value.controllers).toEqual({ army1: 'human', army2: 'human', army3: 'cpu', army4: 'cpu' });
    await page.locator('[data-load-slot="0"]').click();
    await expect(page.locator('#four-handoff-start')).toBeVisible();
    await expect(page.locator('.tile')).toHaveCount(0);
    await page.locator('#four-handoff-start').click();
    await expect(page.locator('#four-human-panel')).toContainText(width === 390 ? 'Army 2' : '第2軍');
    await page.locator('#four-human-panel [data-human-action="endTurn"]').click();
    await expect(page.locator('.tile')).toHaveCount(0);
    await expect(page.locator('#four-toggle')).toBeVisible();
    await page.locator('#four-toggle').click();
  });
  test(`four-army new rules connect recon, production and logistics ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page.locator('#four-mode').selectOption('human');
    await page.locator('#four-start').click();
    await page.locator('#four-recon').click();
    await humanTile(page, 16, 16);
    await expect(page.locator('#four-recon')).toContainText('1/2');
    await expect(page.locator('#four-board >button[data-x="16"][data-y="16"]')).not.toHaveClass(/fog/);
    await page.locator('#four-open-production').click();
    await expect(page.locator('#four-production-facility')).toHaveValue('5,3');
    await page.locator('[data-production-kind="engineer"]').click();
    await expect(page.locator('#four-production-facility')).toHaveValue('3,5');
    await page.keyboard.press('Escape');
    await humanTile(page, 4, 4);
    await page.locator('[data-human-action="ambush-primary"]').click();
    await page.locator('#four-logistics-roster-toggle').click();
    await page.locator('#four-repair-reserve').fill('1000');
    await page.locator('#four-repair-reserve').press('Tab');
    await page.locator('#four-logistics-u2-priority').selectOption('true');
    await tools(page);
    await page.locator('[data-save-slot="0"]').click();
    await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.');
    const raw = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
    const saved = parseFourArmySpectatorSave(raw);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw Error(saved.error);
    expect(saved.value.archive.payload.state.extensions?.repairReserve.army1).toBe(1000);
    expect(saved.value.archive.payload.state.units.find((u) => u.id === 'u2')?.logistics?.priority).toBe(true);
    expect(saved.value.archive.payload.state.units.find((u) => u.id === 'u1')?.ambush).toBe(0);
    expect(saved.value.archive.payload.commands.map((c) => c.type)).toEqual(['recon', 'produce', 'ambush', 'repairReserve', 'logistics']);
    await page.locator('#four-logistics-roster-toggle').click();
    await page.screenshot({ path: info.outputPath(`v1519-rules-${width}.png`), fullPage: true });
  });
}

test('multiplayer replay import preserves the current match until explicitly resumed and stays read-only after completion', async ({ page }) => {
  const { fourArmyHumanFinishedFixture } = await import('../../src/game/fourArmyHuman.fixture');
  const incoming = encodeFourArmySpectatorSave({
    ...fourArmySpectatorFixture(4),
    format: 'ministr-four-army-configurable',
    schemaVersion: 3,
    controllers: { army1: 'human', army2: 'human', army3: 'cpu', army4: 'cpu' },
    view: 'army1',
  });
  if (!incoming.ok) throw Error(incoming.error);
  await open(page);
  await page.locator('#four-start').click();
  await tools(page);
  await page.locator('#four-import-replay').click();
  await page.locator('#four-file').setInputFiles({ name: 'ongoing.json', mimeType: 'application/json', buffer: Buffer.from(incoming.value) });
  await expect(page.locator('#four-notice')).toContainText('Import as a match to resume');
  expect(await count(page)).toBe(0);
  await expect(page.locator('#four-replay-close')).toHaveCount(0);
  await page.locator('#four-import').click();
  await page.locator('#four-file').setInputFiles({ name: 'ongoing.json', mimeType: 'application/json', buffer: Buffer.from(incoming.value) });
  await expect(page.locator('#four-handoff-start')).toBeVisible();
  await page.locator('#four-handoff-start').click();
  await expect(page.locator('#four-army-screen')).toHaveAttribute('data-record-count', '4');
  const completed = encodeFourArmySpectatorSave(fourArmyHumanFinishedFixture('army4', true));
  if (!completed.ok) throw Error(completed.error);
  const terminal = JSON.parse(completed.value);
  terminal.format = 'ministr-four-army-configurable';
  terminal.schemaVersion = 3;
  delete terminal.humanArmy;
  terminal.controllers = { army1: 'human', army2: 'human', army3: 'cpu', army4: 'cpu' };
  terminal.view = 'all';
  await tools(page);
  await page.locator('#four-import-replay').click();
  await page.locator('#four-file').setInputFiles({ name: 'finished.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(terminal)) });
  await expect(page.locator('#four-replay-close')).toBeVisible();
  await expect(page.locator('[data-human-action]')).toHaveCount(0);
  await expect(page.locator('#four-view')).toBeEnabled();
});

test('four-army opens human play by default and clearly separates live CPU progress from replay', async ({ page }) => {
  await open(page, 'en', 'human');
  await page.locator('#four-start').click();
  await expect(page.locator('#four-turn')).toContainText('Your turn');
  await expect(page.locator('#four-toggle')).toBeHidden();
  await expect(page.locator('#four-human-panel')).toContainText('Army 1');
  await playbackControls(page);
  await page.locator('#four-replay').click();
  await expect(page.locator('#four-toggle')).toHaveText('Play replay');
  await expect(page.locator('[data-human-action]')).toHaveCount(0);
});

test('CPU first starts automatically, respects a speed-change pause, then waits for the selected human', async ({ page }) => {
  await open(page, 'en', 'human');
  await page.locator('#four-human-army').selectOption('army2');
  await page.locator('#four-start').click();
  await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'true');
  await playbackControls(page);
  await page.locator('#four-speed').selectOption('4');
  await expect(page.locator('#four-toggle')).toHaveText('Run CPUs');
  await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#four-toggle').click();
  await expect(page.locator('#four-turn')).toContainText('Your turn');
  await expect(page.locator('#four-human-panel')).toContainText('Army 2');
  await expect(page.locator('#four-toggle')).toBeHidden();
  await expect(page.locator('#four-view')).toHaveValue('army2');
});

for (const { width, locale, actor } of [
  { width: 1280, locale: 'ja', actor: 'army3' },
  { width: 390, locale: 'en', actor: 'army1' },
] as const) {
  test(`four-army battle scene preference, HP and single commit ${width}/${locale}`, async ({ page }, info) => {
    const { fourArmyBattleFixture } = await import('./helpers/fourArmyBattleFixture');
    const fixture = fourArmyBattleFixture(actor);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      if (!localStorage.getItem('ministr.battleScene.settings')) localStorage.setItem('ministr.battleScene.settings', JSON.stringify({ twoArmy: false, multiArmy: true }));
    });
    await open(page, locale);
    await expect(page.locator('#battle-scenes-multiArmy')).toBeChecked();
    await importMatch(page, fixture.text);
    await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '停止状態で読み込みました。' : 'Loaded and paused.');
    const attack = async () => {
      await humanTile(page, fixture.attacker.position!.x, fixture.attacker.position!.y);
      await page.locator('#four-attack-weapon').selectOption(String(fixture.command.weaponSlot ?? 0));
      await humanTile(page, fixture.defender.position!.x, fixture.defender.position!.y);
    };
    await page.locator('#battle-scenes-multiArmy').uncheck();
    await attack();
    expect(await count(page)).toBe(fixture.count + 1);
    await expect(page.locator('.battle-scene')).toHaveCount(0);
    await tools(page);
    await page.locator('[data-save-slot="0"]').click();
    await expect(page.locator('#four-notice')).toHaveText(locale === 'ja' ? '4軍専用枠へ保存しました。' : 'Saved to the four-army slot.');
    const first = parseFourArmySpectatorSave(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!));
    expect(first.ok).toBe(true);
    if (!first.ok) throw Error(first.error);
    expect(first.value.archive.payload.state).toEqual(fixture.after);
    await page.reload();
    await page.locator('#title-four-army').click();
    await expect(page.locator('#battle-scenes-multiArmy')).not.toBeChecked();
    await page.locator('#battle-scenes-multiArmy').check();
    await importMatch(page, fixture.text);
    await expect(page.locator('#four-turn')).toContainText(locale === 'ja' ? 'あなたの手番' : 'Your turn');
    await attack();
    await expect(page.locator('.four-battle-scene .battle-scene')).toBeVisible();
    await expect(page.locator('#four-army-screen')).toHaveAttribute('inert', '');
    await expect(page.locator(`.battle-team-badge-${fixture.attacker.owner}`)).toContainText(locale === 'ja' ? `第${actor.slice(-1)}軍` : `Army ${actor.slice(-1)}`);
    const hp = fixture.after.units.find((u) => u.id === fixture.command.unitId)?.hp ?? 0;
    await expect(page.locator('.battle-attacker .battle-hp')).toHaveAttribute('aria-valuenow', String(hp));
    await page.screenshot({ path: info.outputPath(`systems-four-battle-${width}.png`), animations: 'disabled' });
    await page.locator('#battle-scene-skip').press('Enter');
    await expect(page.locator('.battle-scene')).toHaveCount(0);
    await expect(page.locator('#four-army-screen')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#four-human-panel [data-human-action="endTurn"]')).toBeEnabled();
    expect(await count(page)).toBe(fixture.count + 1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.battleScene.settings')!))).toEqual({ twoArmy: false, multiArmy: true });
    await playbackControls(page);
    await page.locator('#four-replay').click();
    await playbackControls(page);
    const seek = async () => {
      await page.locator('#four-position').evaluate((element, position) => {
        const input = element as HTMLInputElement;
        input.value = String(position);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, fixture.count);
      await expect.poll(() => count(page)).toBe(fixture.count);
    };
    await seek();
    await page.locator('#four-step').click();
    await expect(page.locator('.four-battle-scene .battle-scene')).toBeVisible();
    await page.locator('#battle-scene-skip').press('Enter');
    await expect(page.locator('.battle-scene')).toHaveCount(0);
    await page.locator('#battle-scenes-multiArmy').uncheck();
    await seek();
    await page.locator('#four-step').click();
    await expect.poll(() => count(page)).toBe(fixture.count + 1);
    await expect(page.locator('.battle-scene')).toHaveCount(0);
  });
}

test('four-army battle holds CPU progress and cancels on pause, menu and background', async ({ page }) => {
  const { fourArmyBattleFixture } = await import('./helpers/fourArmyBattleFixture');
  const fixture = fourArmyBattleFixture('army1', true);
  await open(page);
  await importMatch(page, fixture.text);
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  const now = new Date('2026-11-18T00:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const show = async () => {
    await page.locator('#four-toggle').click();
    await page.clock.runFor(150);
    await expect(page.locator('.four-battle-scene #spectate-scene-pause')).toBeVisible();
  };
  await show();
  const beforeDisable = await count(page);
  await page.locator('#battle-scenes-multiArmy-overlay').press('Space');
  await expect(page.locator('.battle-scene')).toHaveCount(0);
  await page.clock.runFor(500);
  await expect.poll(() => count(page)).toBeGreaterThan(beforeDisable);
  await page.locator('#four-toggle').click();
  await page.locator('#battle-scenes-multiArmy').check();
  await importMatch(page, fixture.text);
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  await show();
  const at = await count(page);
  await page.clock.runFor(1000);
  expect(await count(page)).toBe(at);
  await page.locator('#spectate-scene-pause').press('Enter');
  await page.clock.runFor(5000);
  await expect(page.locator('.battle-scene')).toHaveCount(0);
  expect(await count(page)).toBe(at);
  await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
  await importMatch(page, fixture.text);
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  await show();
  await page.locator('#spectate-scene-menu').press('Enter');
  await page.clock.runFor(5000);
  await expect(page.locator('#four-start')).toBeVisible();
  await expect(page.locator('.battle-scene')).toHaveCount(0);
  await importMatch(page, fixture.text);
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  await show();
  const last = await count(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.clock.runFor(5000);
  await expect(page.locator('.battle-scene')).toHaveCount(0);
  expect(await count(page)).toBe(last);
  await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
});
