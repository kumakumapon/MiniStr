/* global process, document, localStorage, performance, requestAnimationFrame, window, MutationObserver, setInterval, clearInterval */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true });
const rows = [];
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.addInitScript(() => localStorage.setItem('ministr.locale', 'en'));
    await page.goto(process.env.PROFILE_BASE_URL ?? 'http://127.0.0.1:4173/');
    const boot = await page.evaluate(() => ({
      readyMs: performance.now(),
      transferBytes: performance.getEntriesByType('resource').reduce((sum, entry) => sum + entry.transferSize, 0),
    }));
    await page.locator('.title-map-card[data-map-id="wide-front"]').click();
    await page.locator('input[name="match-mode"][value="spectate"]').check();
    await page.locator('#title-cpu-speed').count();
    const start = await page.evaluate(() => {
      const s = performance.now();
      document.querySelector('#begin-operation').click();
      document.querySelector('#spectate-toggle').click();
      return performance.now() - s;
    });
    await page.locator('#cpu-speed').selectOption('4');
    const result = await page.evaluate(async () => {
      const beats = [],
        steps = [];
      let last = performance.now();
      const timer = setInterval(() => {
        const now = performance.now();
        beats.push(now - last);
        last = now;
      }, 10);
      let previous = performance.now();
      const observer = new MutationObserver(() => {
        if (!document.querySelector('.board .tile')) return;
        const now = performance.now();
        steps.push(now - previous);
        previous = now;
      });
      observer.observe(document.querySelector('#app'), { childList: true });
      const began = performance.now();
      document.querySelector('#spectate-toggle').click();
      // Fixed observation window includes the real CPU, DOM work and scene timing.
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      document.querySelector('#spectate-toggle').click();
      observer.disconnect();
      clearInterval(timer);
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const selection = [],
        synchronousSelection = [];
      for (let i = 0; i < 12; i++) {
        const s = performance.now();
        document.querySelector('.tile[data-x="10"][data-y="14"]').click();
        if (i >= 2) synchronousSelection.push(performance.now() - s);
        await frame();
        if (i >= 2) selection.push(performance.now() - s);
      }
      return { elapsed: performance.now() - began, beats, steps, selection, synchronousSelection, nodes: document.querySelectorAll('*').length };
    });
    rows.push({ width, size: 32, boot, start, ...result });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(process.argv[2], JSON.stringify({ variant: process.argv[3], browser: browser.version(), rows }, null, 2));
