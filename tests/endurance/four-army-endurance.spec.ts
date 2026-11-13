import { expect, type Page } from '@playwright/test';
import { test } from '../e2e/helpers/engineTest';
import { build } from 'vite';
import { fourArmySpectatorFixture } from '../../src/game/fourArmySpectator.fixture';
import { encodeFourArmySpectatorSave, FOUR_ARMY_COMMAND_LIMIT } from '../../src/game/fourArmySpectatorSave';
import type { compareFourArmyCpu } from '../../scripts/fourArmyPerformance';

interface Metrics {
  created: number;
  terminated: number;
  active: number;
  pauses: number[];
}
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ministr.locale', 'en');
    const Native = window.Worker,
      metrics: Metrics = { created: 0, terminated: 0, active: 0, pauses: [] };
    Object.assign(window, { fourEnduranceMetrics: metrics });
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('fourArmy')) {
          metrics.created++;
          metrics.active++;
          let stopped = false;
          const end = this.terminate.bind(this);
          this.terminate = () => {
            if (!stopped) {
              stopped = true;
              metrics.active--;
              metrics.terminated++;
            }
            end();
          };
        }
      }
    };
    document.addEventListener(
      'pointerdown',
      (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('#four-toggle')?.getAttribute('aria-pressed') !== 'true') return;
        const start = performance.now();
        const up = () => {
          document.removeEventListener('pointerup', up, true);
          queueMicrotask(() => requestAnimationFrame(() => metrics.pauses.push(performance.now() - start)));
        };
        document.addEventListener('pointerup', up, true);
      },
      true,
    );
  });
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.locator('#title-four-army').click();
}
const count = (page: Page) => page.locator('#four-army-screen').getAttribute('data-record-count').then(Number);
async function fileTools(page: Page) {
  await page.locator('.four-tools').evaluate((e) => ((e as HTMLDetailsElement).open = true));
}
const metrics = (page: Page) => page.evaluate(() => (window as unknown as { fourEnduranceMetrics: Metrics }).fourEnduranceMetrics);
const sample = (a: number[]) => {
  const v = [...a].sort((x, y) => x - y);
  return { count: v.length, p95: v[Math.ceil(v.length * 0.95) - 1] ?? 0, max: v.at(-1) ?? 0 };
};

test('maximum record: lossless import, checkpoint seeks, persistence, export and backup cancellation', async ({ page, browserName }, info) => {
  const began = performance.now(),
    source = { ...fourArmySpectatorFixture(FOUR_ARMY_COMMAND_LIMIT), schemaVersion: 2 as const },
    encoded = encodeFourArmySpectatorSave(source);
  if (!encoded.ok) throw Error(encoded.error);
  const pretty = JSON.stringify(JSON.parse(encoded.value), null, 2);
  await setup(page);
  await fileTools(page);
  const start = performance.now();
  await page.locator('#four-file').setInputFiles({ name: 'maximum.json', mimeType: 'application/json', buffer: Buffer.from(pretty) });
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.', { timeout: 300000 });
  const importMs = performance.now() - start;
  expect(await count(page)).toBe(FOUR_ARMY_COMMAND_LIMIT);
  await expect(page.locator('#four-toggle')).toBeDisabled();
  await expect(page.locator('#four-step')).toBeDisabled();
  const seeks: number[] = [];
  let t = performance.now();
  await page.locator('#four-replay').click();
  await expect(page.locator('#four-replay-count')).toHaveText(`0/${FOUR_ARMY_COMMAND_LIMIT}`);
  const replayOpenMs = performance.now() - t;
  for (const pos of [FOUR_ARMY_COMMAND_LIMIT, 0, 32768, 65500, 2048, FOUR_ARMY_COMMAND_LIMIT]) {
    t = performance.now();
    await page.locator('#four-position').evaluate((e, pos) => {
      (e as HTMLInputElement).value = String(pos);
    }, pos);
    await page.locator('#four-position').dispatchEvent('change');
    await expect(page.locator('#four-replay-count')).toHaveText(`${pos}/${FOUR_ARMY_COMMAND_LIMIT}`, { timeout: 15000 });
    seeks.push(performance.now() - t);
  }
  const retained = Number(await page.locator('#four-army-screen').getAttribute('data-replay-states'));
  expect(retained).toBeLessThanOrEqual(42);
  expect(Number(await page.locator('#four-army-screen').getAttribute('data-checkpoints'))).toBeLessThanOrEqual(33);
  await page.locator('#four-replay-close').click();
  await fileTools(page);
  t = performance.now();
  await page.locator('[data-save-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Saved to the four-army slot.', { timeout: 300000 });
  const saveMs = performance.now() - t;
  const raw = await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1')!);
  expect(JSON.parse(raw).archive.payload.commands.rows).toHaveLength(FOUR_ARMY_COMMAND_LIMIT);
  t = performance.now();
  const download = page.waitForEvent('download');
  await page.locator('#four-export').click();
  await download;
  const repeatExportMs = performance.now() - t;
  const backup = JSON.stringify({
    schemaVersion: 1,
    entries: [
      ['ministr.fourArmy.save.1', raw],
      ['ministr.locale', 'en'],
    ],
  });
  const beforeReloadWorkers = await metrics(page);
  expect(beforeReloadWorkers.active).toBe(0);
  await page.reload();
  await page.locator('#title-four-army').click();
  await fileTools(page);
  await page.locator('[data-load-slot="0"]').click();
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.', { timeout: 300000 });
  expect(await count(page)).toBe(FOUR_ARMY_COMMAND_LIMIT);
  await page.locator('#four-close').click();
  expect((await metrics(page)).active).toBe(0);
  await expect(page.locator('#four-army-screen')).toBeEmpty();
  // The restore uses the existing public backup input; leaving the title cancels the cooperative verifier before any write.
  await page
    .locator('#save-slots-panel summary')
    .count()
    .then(async (n) => {
      if (n) await page.locator('#save-slots-panel').evaluate((e) => ((e as HTMLDetailsElement).open = true));
    });
  const input = page.locator('#backup-import');
  await input.setInputFiles({ name: 'long-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.locator('#title-training').click();
  await expect(page.locator('#briefing-title')).toBeVisible();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe(raw);
  expect(await page.evaluate(() => localStorage.getItem('ministr.locale'))).toBe('en');
  await page.screenshot({ path: info.outputPath(`systems-long-${browserName}.png`), fullPage: false });
  console.info(
    JSON.stringify({
      phase: 'four-army-long-record',
      browser: browserName,
      source: process.env.GITHUB_SHA,
      commands: FOUR_ARMY_COMMAND_LIMIT,
      rawBytes: Buffer.byteLength(pretty),
      compactBytes: Buffer.byteLength(encoded.value),
      importMs,
      saveMs,
      replayOpenMs,
      repeatExportMs,
      seekMs: sample(seeks),
      retainedReplayStates: retained,
      totalSeconds: (performance.now() - began) / 1000,
      beforeReloadWorkers,
      workers: await metrics(page),
    }),
  );
});

test('same-population CPU comparison in an actual browser', async ({ page, browserName }) => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: { write: false, minify: false, target: 'es2022', lib: { entry: 'tests/endurance/fourArmyBrowser.ts', formats: ['iife'], name: 'FourArmyPerformance' } },
  });
  let code = '';
  for (const bundle of Array.isArray(result) ? result : [result])
    if ('output' in bundle) for (const part of bundle.output) if (part.type === 'chunk' && part.isEntry) code = part.code;
  if (!code) throw Error('Browser comparison bundle missing');
  await page.goto('/');
  await page.addScriptTag({ content: code });
  const report = await page.evaluate(() =>
    (window as unknown as { FourArmyPerformance: { compareFourArmyCpu: typeof compareFourArmyCpu } }).FourArmyPerformance.compareFourArmyCpu(20),
  );
  console.info(JSON.stringify({ phase: 'four-army-cpu-comparison', browser: browserName, source: process.env.GITHUB_SHA, report }));
  expect(report.rows).toHaveLength(8);
});

test('ten-minute actual spectator lifecycle: pause input, background, view changes and retained memory', async ({ page, browserName }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.locator('#four-start').click();
  await page.locator('#four-speed').selectOption('4');
  const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : undefined;
  const heap = async () => {
    if (!cdp) return null;
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  const samples: { minute: number; commands: number; heap: number | null; workers: Metrics }[] = [];
  let completedCommands = 0,
    games = 1;
  const start = Date.now();
  await page.locator('#four-toggle').click();
  for (let minute = 1; minute <= 10; minute++) {
    await page.waitForTimeout(Math.max(0, start + minute * 60000 - Date.now()));
    if ((await page.locator('#four-toggle').getAttribute('aria-pressed')) === 'true') await page.locator('#four-toggle').click();
    await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
    const paused = await count(page);
    await page.waitForTimeout(150);
    expect(await count(page)).toBe(paused);
    expect((await metrics(page)).active).toBe(0);
    samples.push({ minute, commands: completedCommands + paused, heap: await heap(), workers: await metrics(page) });
    await page.locator('#four-view').selectOption(minute % 2 ? 'army1' : 'all');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    if (minute < 10) {
      if (await page.locator('#four-toggle').isDisabled()) {
        completedCommands += paused;
        games++;
        await page.locator('#four-menu').click();
        await page.locator('#four-seed').fill(String(1512 + games));
        await page.locator('#four-start').click();
        await page.locator('#four-speed').selectOption('4');
      }
      await page.locator('#four-toggle').click();
    }
    console.info(JSON.stringify({ phase: 'four-army-soak-sample', browser: browserName, sample: samples.at(-1) }));
  }
  const m = await metrics(page),
    pause = sample(m.pauses);
  expect(pause.p95).toBeLessThan(250);
  expect(samples.at(-1)!.commands).toBeGreaterThan(samples[0]!.commands);
  const heaps = samples.flatMap((s) => (s.heap === null ? [] : [s.heap]));
  if (heaps.length) expect(Math.max(...heaps) - heaps[0]!).toBeLessThan(32 * 1024 * 1024);
  await page.locator('#four-close').click();
  await expect(page.locator('#four-army-screen')).toBeEmpty();
  expect((await metrics(page)).active).toBe(0);
  await page.screenshot({ path: info.outputPath(`systems-soak-${browserName}.png`), fullPage: false });
  console.info(
    JSON.stringify({
      phase: 'four-army-soak',
      browser: browserName,
      source: process.env.GITHUB_SHA,
      elapsedSeconds: (Date.now() - start) / 1000,
      games,
      samples,
      pause,
      heapAvailable: !!cdp,
      workers: await metrics(page),
    }),
  );
});
