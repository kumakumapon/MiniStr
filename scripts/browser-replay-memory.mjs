import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';

const [url, output, replayPath] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? '') || !output || !replayPath) throw Error('Usage: node scripts/browser-replay-memory.mjs URL OUTPUT REPLAY.json');
const json = readFileSync(replayPath, 'utf8');
const count = JSON.parse(json).commands.length;
const browser = await chromium.launch(process.env.MINISTR_CHROMIUM ? { executablePath: process.env.MINISTR_CHROMIUM, args: ['--no-sandbox'] } : {});
const report = {
  format: 'replay-memory-v143',
  browser: browser.version(),
  url,
  viewport: { width: 390, height: 844 },
  commands: count,
  fixtureSha256: createHash('sha256').update(json).digest('hex'),
  harnessSha256: createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .digest('hex'),
  rows: [],
  errors: [],
  note: 'Browser File/DataTransfer change event avoids DevTools console retaining each inspected native file input. This is a synthetic import, not an OS file chooser timing. All commands are validated by the shipped importer.',
};
const persist = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
try {
  const page = await browser.newPage({ viewport: report.viewport });
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.addInitScript(() => globalThis.localStorage.setItem('ministr.locale', 'en'));
  await page.goto(url);
  await page.locator('#title-replay-file').waitFor({ state: 'attached' });
  report.build = await page.evaluate(() => globalThis.document.querySelector('.build-info').textContent);
  const cdp = await page.context().newCDPSession(page);
  async function sample(phase) {
    await page.waitForTimeout(500);
    const beforeGc = await cdp.send('Runtime.getHeapUsage');
    await cdp.send('HeapProfiler.collectGarbage');
    report.rows.push({ phase, beforeGc, heap: await cdp.send('Runtime.getHeapUsage'), dom: await cdp.send('Memory.getDOMCounters'), workers: page.workers().length });
    persist();
  }
  await sample('title');
  for (let cycle = 0; cycle < 6; cycle++) {
    // Selecting file inputs through CDP retains detached inputs in DevTools' console.
    // Pass text rather than a DOM handle, and create a real File in the browser.
    await page.evaluate((json) => {
      const { document, DataTransfer, File, Event } = globalThis;
      const input = document.querySelector('#title-replay-file');
      const transfer = new DataTransfer();
      transfer.items.add(new File([json], 'memory.json', { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, json);
    await page.locator('.replay-toolbar').waitFor();
    for (const index of [count, Math.floor(count / 2), 0, count]) {
      const actual = await page.evaluate((index) => {
        const input = globalThis.document.querySelector('#replay-seek');
        input.value = String(index);
        input.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
        return Number(globalThis.document.querySelector('#replay-seek').value);
      }, index);
      if (actual !== index) throw Error('Replay seek did not apply');
    }
    await page.evaluate(() => {
      const input = globalThis.document.querySelector('#replay-viewpoint');
      input.value = 'all';
      input.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    });
    await sample(`replay-${cycle}`);
    await page.evaluate(() => globalThis.document.querySelector('#replay-exit').click());
    await sample(`closed-${cycle}`);
  }
  if (report.errors.length) throw Error(report.errors.join('\n'));
  report.completed = true;
  persist();
} catch (error) {
  report.failure = String(error);
  persist();
  throw error;
} finally {
  await browser.close();
}
