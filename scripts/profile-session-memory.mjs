/* global process, localStorage */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 844 } });
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript(() => localStorage.setItem('ministr.locale', 'en'));
  await page.goto(process.env.PROFILE_BASE_URL ?? 'http://127.0.0.1:4173/');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const rows = [];
  for (let cycle = 0; cycle < 6; cycle++) {
    await page.locator('.title-map-card[data-map-id="wide-front"]').click();
    await page.locator('input[name="match-mode"][value="spectate"]').check();
    await page.locator('#begin-operation').click();
    await page.waitForTimeout(1200);
    await page.locator('#spectate-toggle').click();
    await page.locator('#open-title').click();
    await page.waitForTimeout(350);
    await cdp.send('HeapProfiler.collectGarbage');
    const metrics = await cdp.send('Performance.getMetrics');
    const dom = await cdp.send('Memory.getDOMCounters');
    rows.push({ cycle, heap: metrics.metrics.find((m) => m.name === 'JSHeapUsedSize').value, ...dom });
  }
  writeFileSync(process.argv[2], JSON.stringify({ variant: process.argv[3], browser: browser.version(), warmupCycles: 1, rows }, null, 2));
} finally {
  await browser.close();
}
