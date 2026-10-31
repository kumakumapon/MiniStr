/* global process, document, localStorage, performance, requestAnimationFrame */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true });
const rows = [];
try {
  for (const width of [1280, 390])
    for (const size of [16, 32]) {
      const scenario = {
        id: 'selection-profile',
        name: 'Selection profile',
        briefing: '',
        startingGold: 0,
        board: { width: size, height: size, cells: [] },
        initialUnits: Array.from({ length: size * 4 }, (_, i) => ({
          kind: 'infantry',
          owner: i < size * 2 ? 'red' : 'blue',
          x: i % size,
          y: i < size * 2 ? Math.floor(i / size) : size - 2 + Math.floor((i - size * 2) / size),
        })),
        victoryConditions: [{ type: 'eliminate' }],
        defeatConditions: [{ type: 'eliminate' }],
      };
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.addInitScript((s) => {
        localStorage.setItem('ministr.locale', 'en');
        localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [s], history: [] }));
      }, scenario);
      await page.goto(process.env.PROFILE_BASE_URL ?? 'http://127.0.0.1:4173/');
      await page.locator('.title-map-card[data-map-id="selection-profile"]').click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      await page.locator('#begin-operation').click();
      const samples = await page.evaluate(async () => {
        const samples = [];
        for (let i = 0; i < 22; i++) {
          const x = i % 2,
            start = performance.now();
          document.querySelector(`.tile[data-x="${x}"][data-y="0"]`).click();
          const handlerMs = performance.now() - start;
          if (!document.querySelector(`.tile[data-x="${x}"][data-y="0"] .selected-marker`)) throw Error('Click did not select the requested unit');
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (i >= 2) samples.push({ handlerMs, frameMs: performance.now() - start });
        }
        return samples;
      });
      rows.push({ width, size, samples });
      await page.close();
    }
} finally {
  await browser.close();
}
writeFileSync(process.argv[2], JSON.stringify({ variant: process.argv[3], browser: browser.version(), rows }, null, 2));
