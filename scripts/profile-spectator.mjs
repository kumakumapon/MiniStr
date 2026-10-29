/* global process, document, localStorage, performance, requestAnimationFrame, Event, console */
/** Preview must already be running. Args: output.json variant. See performance-evaluation.md. */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true });
  const rows = [];
  for (const width of [1280, 390])
    for (const size of [16, 32]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const scenario = {
        id: 'wide-profile',
        name: 'Wide profile',
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
      await page.addInitScript((s) => {
        localStorage.setItem('ministr.locale', 'en');
        localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [s], history: [] }));
      }, scenario);
      await page.goto(process.env.PROFILE_BASE_URL ?? 'http://127.0.0.1:4173/');
      const boot = await page.evaluate(() => ({ readyMs: performance.now(), nodes: document.querySelectorAll('*').length }));
      await page.locator('.title-map-card[data-map-id="wide-profile"]').click();
      await page.locator('input[name="match-mode"][value="spectate"]').check();
      const start = await page.evaluate(() => {
        const s = performance.now();
        document.querySelector('#begin-operation').click();
        document.querySelector('#spectate-toggle').click();
        return performance.now() - s;
      });
      await page.locator('#spectate-whole-board').click();
      const result = await page.evaluate(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const locate = [],
          zoom = [],
          title = [];
        for (let i = 0; i < 32; i++) {
          let s = performance.now();
          const select = document.querySelector('#spectate-locate-unit');
          select.value = i % 2 ? 'r1' : 'b1';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await frame();
          if (i >= 2) locate.push(performance.now() - s);
          s = performance.now();
          document.querySelector(i % 2 ? '#board-zoom-out' : '#board-zoom-in').click();
          await frame();
          if (i >= 2) zoom.push(performance.now() - s);
          s = performance.now();
          document.querySelector('#open-title').click();
          await frame();
          if (i >= 2) title.push(performance.now() - s);
          document.querySelector('#title-resume').click();
          await frame();
        }
        return { locate, zoom, title, nodes: document.querySelectorAll('*').length };
      });
      rows.push({ width, size, start, boot, ...result });
      await page.close();
    }
  await browser.close();
  writeFileSync(process.argv[2], JSON.stringify({ variant: process.argv[3], rows }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
