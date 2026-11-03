import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

// Run against a built preview. Each sample starts in a fresh context. No CPU
// spectating: both measured buttons select real, owned units in hotseat mode.
const [url, output, variant, pair] = process.argv.slice(2);
if (!url || !output || !variant || !pair || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url))
  throw Error('Usage: node scripts/browser-response-v143.mjs http://127.0.0.1:PORT OUTPUT.json VARIANT PAIR');
const scenarioFor = (size) => ({
  id: 'response-v143',
  name: `Response ${size}`,
  briefing: '',
  startingGold: 0,
  board: { width: size, height: size, cells: [] },
  initialUnits: ['red', 'blue'].flatMap((owner) =>
    Array.from({ length: 16 }, (_, i) => ({
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
const browser = await chromium.launch(process.env.MINISTR_CHROMIUM ? { executablePath: process.env.MINISTR_CHROMIUM, args: ['--no-sandbox'] } : {});
const samples = [];
try {
  for (const width of [1280, 390])
    for (const size of [16, 32])
      for (let repeat = 0; repeat < 2; repeat++) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript((scenario) => {
          const { localStorage } = globalThis;
          localStorage.setItem('ministr.locale', 'en');
          localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
        }, scenarioFor(size));
        const started = performance.now();
        await page.goto(url);
        await page.locator('.title-map-card[data-map-id="response-v143"]').waitFor();
        const coldTitleMs = performance.now() - started;
        const build = await page.locator('.build-info').textContent();
        await page.locator('.title-map-card[data-map-id="response-v143"]').click();
        await page.locator('input[name="match-mode"][value="hotseat"]').check();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        const before = await cdp.send('Performance.getMetrics');
        const result = await page.evaluate(async (size) => {
          const { document, performance, requestAnimationFrame, PerformanceObserver } = globalThis;
          const longTasks = [];
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          });
          observer.observe({ type: 'longtask' });
          const paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          let started = performance.now();
          document.querySelector('#begin-operation').click();
          const startHandlerMs = performance.now() - started;
          await paint();
          const startPaintMs = performance.now() - started;
          if (document.querySelectorAll('.board .tile').length !== size * size) throw Error('Missing board');
          // Match an actual interaction with a scrolled-to, visible board on 390px.
          document.querySelector('.tile[data-x="1"][data-y="1"]').scrollIntoView({ block: 'center' });
          await paint();
          const zoom = document.querySelector('.board').dataset.zoom;
          const selections = [];
          for (let i = 0; i < 25; i++) {
            const x = 1 + (i % 2);
            const tile = document.querySelector(`.tile[data-x="${x}"][data-y="1"]`);
            started = performance.now();
            tile.focus({ preventScroll: true });
            tile.click();
            const handlerMs = performance.now() - started;
            await paint();
            const paintMs = performance.now() - started;
            if (!document.querySelector(`.tile[data-x="${x}"][data-y="1"] .selected-marker`)) throw Error('Not an actual unit selection');
            selections.push({ startTime: started, handlerMs, paintMs });
          }
          started = performance.now();
          document.querySelector('#open-title').click();
          document.querySelector('#title-resume').click();
          await paint();
          const resumePaintMs = performance.now() - started;
          for (const entry of observer.takeRecords()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          observer.disconnect();
          return { startHandlerMs, startPaintMs, selections, resumePaintMs, zoom, longTasks };
        }, size);
        const after = await cdp.send('Performance.getMetrics');
        const previous = Object.fromEntries(before.metrics.map((m) => [m.name, m.value]));
        const metrics = Object.fromEntries(
          after.metrics.filter((m) => /LayoutCount|RecalcStyleCount|LayoutDuration|RecalcStyleDuration/.test(m.name)).map((m) => [m.name, m.value - previous[m.name]]),
        );
        if (errors.length) throw Error(errors.join('\n'));
        samples.push({ width, size, repeat, coldTitleMs, build, metrics, ...result });
        await context.close();
      }
  writeFileSync(
    output,
    JSON.stringify(
      {
        format: 'browser-response-v143',
        variant,
        pair,
        harnessSha256: createHash('sha256')
          .update(readFileSync(new URL(import.meta.url)))
          .digest('hex'),
        browser: await browser.version(),
        url,
        samples,
        note: 'DOM focus+click handler and two animation frames, fresh contexts; first selection kept separately from warm selections; diagnostic hardware, not physical touch',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
