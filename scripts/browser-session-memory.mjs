import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';
import console from 'node:console';

const [url, output, variant, secondsText = '600', replayPath] = process.argv.slice(2);
const seconds = Number(secondsText);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? '') || !output || !variant || !Number.isInteger(seconds) || seconds < 1 || !replayPath)
  throw Error('Usage: node scripts/browser-session-memory.mjs URL OUTPUT VARIANT WATCH_SECONDS REPLAY.json');
const fixture = JSON.parse(readFileSync(replayPath, 'utf8'));
const browser = await chromium.launch(process.env.MINISTR_CHROMIUM ? { executablePath: process.env.MINISTR_CHROMIUM, args: ['--no-sandbox'] } : {});
const report = {
  format: 'session-memory-v143',
  variant,
  url,
  browser: browser.version(),
  viewport: { width: 390, height: 844 },
  seconds,
  fixtureCommands: fixture.commands.length,
  harnessSha256: createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .digest('hex'),
  rows: [],
  errors: [],
  note: 'Diagnostic Chromium, real clock, isolated context, no forced game rules. Main/worker GC is intrusive and sampled separately. Commands and replay checkpoints are legitimate retained data; heap alone does not establish a leak.',
};
const persist = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
try {
  const context = await browser.newContext({ viewport: report.viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept('Memory profile'));
  await page.addInitScript(() => globalThis.localStorage.setItem('ministr.locale', 'en'));
  await page.goto(url);
  report.build = await page.locator('.build-info').textContent();
  report.fixtureSha256 = createHash('sha256').update(readFileSync(replayPath)).digest('hex');
  await page.locator('.title-map-card[data-map-id="wide-front"]').waitFor();
  await page.waitForFunction(() => !globalThis.document.querySelector('.storage-write-notice'));
  const cdp = await context.newCDPSession(page);
  const targets = await browser.newBrowserCDPSession();
  await cdp.send('Performance.enable');
  // Nested CDP sessions also include worker heap; no remote object handles are kept.
  async function workerHeap(gc) {
    const { targetInfos } = await targets.send('Target.getTargets');
    const workers = targetInfos.filter((t) => t.type === 'worker' && t.url.includes('cpuWorker'));
    const values = [];
    for (const target of workers) {
      let sessionId;
      try {
        ({ sessionId } = await targets.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }));
        let nextId = 0;
        const send = (method) =>
          new Promise((resolve, reject) => {
            const id = ++nextId;
            const timeout = setTimeout(() => {
              targets.off('Target.receivedMessageFromTarget', listener);
              reject(Error('Worker CDP timeout'));
            }, 5000);
            function listener(event) {
              if (event.sessionId !== sessionId) return;
              const message = JSON.parse(event.message);
              if (message.id !== id) return;
              clearTimeout(timeout);
              targets.off('Target.receivedMessageFromTarget', listener);
              if (message.error) reject(Error(message.error.message));
              else resolve(message.result);
            }
            targets.on('Target.receivedMessageFromTarget', listener);
            targets.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method }) }).catch(reject);
          });
        if (gc) await send('HeapProfiler.collectGarbage');
        values.push({ targetId: target.targetId, ...(await send('Runtime.getHeapUsage')) });
      } catch (error) {
        values.push({ targetId: target.targetId, unavailable: String(error) });
      } finally {
        if (sessionId) await targets.send('Target.detachFromTarget', { sessionId }).catch(() => {});
      }
    }
    return values;
  }
  async function sample(phase, gc = false) {
    // Let file-input events, deferred focus and DOM disposal finish before GC.
    if (gc) await page.waitForTimeout(500);
    if (gc) await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const dom = await cdp.send('Memory.getDOMCounters');
    const workers = await workerHeap(gc);
    const progress = await page.evaluate(() => ({
      decisionRemaining: globalThis.document.querySelector('.turn-limit')?.textContent ?? '',
      side: globalThis.document.querySelector('.turn-indicator')?.textContent ?? '',
      scene: Boolean(globalThis.document.querySelector('#spectate-scene-pause')),
      finished: Boolean(globalThis.document.querySelector('.game-over')),
      tiles: globalThis.document.querySelectorAll('.board .tile').length,
    }));
    report.rows.push({ phase, gc, elapsedMs: performance.now() - started, heap, dom, workers, progress });
    persist();
    console.log(JSON.stringify({ phase, gc, heap: heap.usedSize, ...dom, workers: workers.length }));
  }
  const started = performance.now();
  await sample('title', true);
  await page.locator('.title-map-card[data-map-id="wide-front"]').click();
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.locator('#begin-operation').click();
  const watchStarted = performance.now();
  await sample('watch-0', true);
  let checkpoint = 0;
  while (performance.now() - watchStarted < seconds * 1000) {
    await page.waitForTimeout(Math.min(30_000, seconds * 1000 - (performance.now() - watchStarted)));
    await sample(`watch-${++checkpoint * 30}`);
    if (checkpoint % 4 === 0) await sample(`watch-${checkpoint * 30}-gc`, true);
  }
  report.actualWatchMs = performance.now() - watchStarted;
  await sample('watch-end', true);
  await page.evaluate(() => globalThis.document.querySelector('#spectate-scene-pause, #spectate-toggle[aria-pressed="false"]')?.click());
  await page.waitForTimeout(300);
  await sample('paused', true);
  // Save once, after measurement: spectating creates a slot, not a rolling autosave.
  await page.locator('#save').click();
  report.savedProgress = await page.evaluate(() =>
    Object.entries(globalThis.localStorage)
      .filter(([key]) => key.startsWith('ministr.save.slot.'))
      .map(([key, value]) => ({
        key,
        bytes: value.length,
        turn: (() => {
          try {
            return JSON.parse(value).turn;
          } catch {
            return undefined;
          }
        })(),
        commands: (() => {
          try {
            const parsed = JSON.parse(value);
            return parsed.session?.commands?.length ?? parsed.commands?.length ?? parsed.commandHistory?.length;
          } catch {
            return undefined;
          }
        })(),
      })),
  );
  if (report.savedProgress.length !== 1) throw Error('Expected one diagnostic save slot');
  await page.locator('#open-title').click();
  await sample('covered', true);
  for (let cycle = 0; cycle < 6; cycle++) {
    await page.locator('#title-resume').click();
    await page.locator('#open-title').click();
    await sample(`resume-${cycle}`, true);
  }
  for (let cycle = 0; cycle < 4; cycle++) {
    await page.locator('#title-replay-file').setInputFiles(replayPath);
    await page.locator('.replay-toolbar').waitFor();
    for (const index of [fixture.commands.length, Math.floor(fixture.commands.length / 2), 0, fixture.commands.length]) {
      await page.locator('#replay-seek').evaluate((input, value) => {
        input.value = String(value);
        input.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
      }, index);
    }
    await sample(`replay-${cycle}`, true);
    await page.locator('#replay-exit').click();
    await sample(`replay-closed-${cycle}`, true);
  }
  report.completed = true;
  persist();
} catch (error) {
  report.failure = String(error);
  persist();
  throw error;
} finally {
  await browser.close();
}
