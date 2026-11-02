import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

// Run against a built preview. Each sample starts in a fresh context. No CPU
// spectating: both measured buttons select real, owned units in hotseat mode.
const [url, output] = process.argv.slice(2);
if (!url || !output || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) throw Error('Usage: node scripts/browser-response.mjs http://127.0.0.1:PORT OUTPUT.json');
const scenario = {
  id: 'response-v141',
  name: 'Response 32',
  briefing: '',
  startingGold: 0,
  board: { width: 32, height: 32, cells: [] },
  initialUnits: ['red', 'blue'].flatMap((owner) =>
    Array.from({ length: 16 }, (_, i) => ({
      kind: 'tank',
      owner,
      x: owner === 'red' ? 1 + (i % 8) : 30 - (i % 8),
      y: owner === 'red' ? 1 + Math.floor(i / 8) : 30 - Math.floor(i / 8),
    })),
  ),
  tacticalOptions: { simultaneous: true, ambush: true, terrain: true, weather: true, zoc: true, submarines: true },
  victoryConditions: [{ type: 'eliminate' }],
  defeatConditions: [{ type: 'eliminate' }],
};
const browser = await chromium.launch(process.env.MINISTR_CHROMIUM ? { executablePath: process.env.MINISTR_CHROMIUM, args: ['--no-sandbox'] } : {});
const samples = [];
try {
  for (const width of [1280, 390])
    for (let repeat = 0; repeat < 5; repeat++) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript((scenario) => {
        const { localStorage } = globalThis;
        localStorage.setItem('ministr.locale', 'en');
        localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
      }, scenario);
      const started = performance.now();
      await page.goto(url);
      await page.locator('.title-map-card[data-map-id="response-v141"]').waitFor();
      const coldTitleMs = performance.now() - started;
      await page.locator('.title-map-card[data-map-id="response-v141"]').click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      const result = await page.evaluate(async () => {
        const { document, performance, requestAnimationFrame } = globalThis;
        const paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        let started = performance.now();
        document.querySelector('#begin-operation').click();
        const startHandlerMs = performance.now() - started;
        await paint();
        const startPaintMs = performance.now() - started;
        if (document.querySelectorAll('.board .tile').length !== 1024) throw Error('Missing 32 board');
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
          selections.push({ handlerMs, paintMs });
        }
        started = performance.now();
        document.querySelector('#open-title').click();
        document.querySelector('#title-resume').click();
        await paint();
        return { startHandlerMs, startPaintMs, selections, resumePaintMs: performance.now() - started };
      });
      if (errors.length) throw Error(errors.join('\n'));
      samples.push({ width, repeat, coldTitleMs, ...result });
      await context.close();
    }
  writeFileSync(
    output,
    JSON.stringify(
      {
        format: 'browser-response-v1',
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
