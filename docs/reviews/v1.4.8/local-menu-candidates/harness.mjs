import { chromium, firefox, webkit } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

// Same harness and installed tools for both builds. Run alternating A/B pairs,
// sequentially, without CPU games or other browser suites on the measurement host.
const [url, output, variant, pair, engine] = process.argv.slice(2);
if (!url || !output || !variant || !pair || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !['chromium', 'firefox', 'webkit'].includes(engine))
  throw Error('Usage: node scripts/browser-response-v148.mjs http://127.0.0.1:PORT OUTPUT.json VARIANT PAIR ENGINE');
const scenarioFor = (size, count) => ({
  id: 'response-v148',
  name: `Response ${size}`,
  briefing: '',
  startingGold: 0,
  board: { width: size, height: size, cells: [] },
  initialUnits: ['red', 'blue'].flatMap((owner) =>
    Array.from({ length: count }, (_, i) => ({
      kind: 'tank',
      owner,
      x: owner === 'red' ? 1 + (i % 8) : size - 2 - (i % 8),
      y: owner === 'red' ? 1 + Math.floor(i / 8) : size - 2 - Math.floor(i / 8),
    })),
  ),
  tacticalOptions: { simultaneous: true, ambush: true, terrain: true, weather: true, zoc: true, submarines: true },
  victoryConditions: [{ type: 'eliminate' }],
  defeatConditions: [{ type: 'eliminate' }],
});
const launched = performance.now();
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === 'chromium' && process.env.MINISTR_CHROMIUM ? { executablePath: process.env.MINISTR_CHROMIUM, args: ['--no-sandbox'] } : {},
);
const samples = [];
try {
  // Native engine startup is measured separately, using an empty document only.
  const probe = await browser.newContext();
  const blank = await probe.newPage();
  if (blank.url() !== 'about:blank') throw Error('Expected blank engine probe');
  await blank.title();
  await probe.close();
  const engineReadyMs = performance.now() - launched;
  for (const [width, size, locale, zoom, count] of [
    [1280, 32, 'en', 0, 16],
    [390, 32, 'en', 0, 16],
    [390, 16, 'en', 0, 16],
    [390, 32, 'ja', 0, 16],
    [390, 32, 'en', 100, 32],
    [390, 32, 'en', 50, 32],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(
        ({ scenario, locale }) => {
          const { localStorage } = globalThis;
          localStorage.setItem('ministr.locale', locale);
          localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
        },
        { scenario: scenarioFor(size, count), locale },
      );
      const started = performance.now();
      await page.goto(url);
      await page.locator('.title-map-card[data-map-id="skirmish"]').waitFor();
      const coldTitleMs = performance.now() - started;
      // Count the first visible thumbnail too; placeholders alone are not completion.
      await page.locator('.title-map-card[data-map-id="skirmish"] .map-preview').waitFor();
      await page.evaluate(() => new Promise((resolve) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
      const coldVisiblePreviewMs = performance.now() - started;
      const titleDOM = await page.locator('.title-overlay').evaluate((element) => ({
        cards: element.querySelectorAll('.title-map-card').length,
        previews: element.querySelectorAll('.map-preview').length,
        elements: element.querySelectorAll('*').length,
      }));
      const build = await page.locator('.build-info').textContent();
      const custom = page.locator('.title-map-card[data-map-id="response-v148"]');
      await custom.scrollIntoViewIfNeeded();
      await custom.locator('.map-preview').waitFor();
      await custom.click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      const result = await page.evaluate(
        async ({ size, zoom }) => {
          const { document, performance, requestAnimationFrame, PerformanceObserver, HTMLElement } = globalThis;
          const longTasks = [];
          const hasLongTasks = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask');
          const observer = hasLongTasks
            ? new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
              })
            : undefined;
          observer?.observe({ type: 'longtask' });
          const paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const click = async (selector) => {
            const button = document.querySelector(selector);
            if (!(button instanceof HTMLElement)) throw Error(`Missing control: ${selector}`);
            const started = performance.now();
            button.click();
            const handlerMs = performance.now() - started;
            await paint();
            return { handlerMs, paintMs: performance.now() - started };
          };
          const start = await click('#begin-operation');
          if (zoom) {
            while (Number(document.querySelector('.board').dataset.zoom) < zoom) await click('#board-zoom-in');
            while (Number(document.querySelector('.board').dataset.zoom) > zoom) await click('#board-zoom-out');
          }
          if (document.querySelectorAll('.board .tile').length !== size * size) throw Error('Missing board');
          const guideClosed = !document.querySelector('#learning-panel')?.open;
          const hiddenReferenceRows = document.querySelectorAll('#learning-panel tbody tr').length;
          document.querySelector('.tile[data-x="1"][data-y="1"]').scrollIntoView({ block: 'center' });
          await paint();
          const actualZoom = document.querySelector('.board').dataset.zoom;
          const selections = [];
          for (let i = 0; i < 25; i++) {
            const x = 1 + (i % 2);
            const tile = document.querySelector(`.tile[data-x="${x}"][data-y="1"]`);
            const started = performance.now();
            tile.focus({ preventScroll: true });
            tile.click();
            const handlerMs = performance.now() - started;
            await paint();
            if (!document.querySelector(`.tile[data-x="${x}"][data-y="1"] .selected-marker`)) throw Error('Not an actual unit selection');
            selections.push({ startTime: started, handlerMs, paintMs: performance.now() - started });
          }
          const title = await click('#open-title');
          const resume = await click('#title-resume');
          if (document.querySelectorAll('.board .tile').length !== size * size || document.querySelector('.title-overlay')) throw Error('Resume did not restore match');
          for (const entry of observer?.takeRecords() ?? []) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          observer?.disconnect();
          return { start, selections, title, resume, zoom: actualZoom, guideClosed, hiddenReferenceRows, hasLongTasks, longTasks };
        },
        { size, zoom },
      );
      if (errors.length) throw Error(errors.join('\n'));
      samples.push({ width, size, locale, requestedZoom: zoom, units: count * 2, coldTitleMs, coldVisiblePreviewMs, titleDOM, build, ...result });
    } finally {
      await context.close();
    }
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        format: 'browser-response-v148',
        variant,
        pair,
        engine,
        engineReadyMs,
        harnessSha256: createHash('sha256')
          .update(readFileSync(new URL(import.meta.url)))
          .digest('hex'),
        browser: await browser.version(),
        url,
        samples,
        note: 'Fresh contexts; real owned hotseat units; first selection separate from warm selections; DOM click handler and two animation frames. Native engine startup separate. Diagnostic hardware, not physical touch. No absolute timing gate.',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
