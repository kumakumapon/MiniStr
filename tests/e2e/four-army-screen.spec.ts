import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from './helpers/engineTest';
import { chooseFourArmyCpuCommand } from '../../src/ai/fourArmyCpu';
import { applyFourArmyCommand, observeFourArmy } from '../../src/game/fourArmyEngine';
import { fourArmySpectatorFixture } from '../../src/game/fourArmySpectator.fixture';
import { encodeFourArmySpectatorSave, parseFourArmySpectatorSave } from '../../src/game/fourArmySpectatorSave';

async function open(page: Page, locale = 'en') {
  await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('#title-four-army').click();
  await expect(page.locator('#four-heading')).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('#four-army-screen')).toHaveAttribute('role', 'main');
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
    expect(checked.value.cpuVersion).toBe('four-army-cpu-v3');
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
      expect(await page.locator('.four-map-viewport').evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
      await page.locator('#four-board').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#four-selection')).toContainText('(5, 4)');
      await page.locator('#four-step').click();
      await expect.poll(() => count(page)).toBe(1);
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
  expect(parsed.value.schemaVersion).toBe(2);
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
