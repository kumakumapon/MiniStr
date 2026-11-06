import { chromium } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';

const [url, output, label] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url ?? '') || !output || !label) throw Error('Usage: URL OUTPUT_PREFIX LABEL');
const browser = await chromium.launch(process.env.MINISTR_CHROMIUM ? { executablePath: process.env.MINISTR_CHROMIUM, args: ['--no-sandbox'] } : {});
const reports = [];
try {
  for (const [width, size] of [
    [1280, 32],
    [390, 16],
    [390, 32],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.addInitScript(
        ({ size }) => {
          globalThis.localStorage.setItem('ministr.locale', 'en');
          globalThis.localStorage.setItem(
            'ministr.scenarios.custom',
            JSON.stringify({
              schemaVersion: 1,
              history: [],
              scenarios: [
                {
                  id: 'profile-display-v149',
                  name: `Profile ${size}`,
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
                },
              ],
            }),
          );
        },
        { size },
      );
      await page.goto(url);
      const card = page.locator('.title-map-card[data-map-id="profile-display-v149"]');
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      await page.locator('#begin-operation').click();
      await page.locator('.tile[data-x="1"][data-y="1"]').scrollIntoViewIfNeeded();
      const build = await page.locator('.build-info').textContent();
      const cdp = await context.newCDPSession(page),
        events = [];
      cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value));
      await cdp.send('Tracing.start', {
        categories: 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.invalidationTracking',
        transferMode: 'ReportEvents',
      });
      const actions = await page.evaluate(async () => {
        const { document, performance, requestAnimationFrame } = globalThis;
        const calls = [],
          results = [];
        let active = '';
        const wrap = (owner, name) => {
          const original = owner[name];
          owner[name] = function (...args) {
            const start = performance.now();
            const result = original.apply(this, args);
            if (active) calls.push({ action: active, name, target: this.id || this.tagName || 'window', duration: performance.now() - start });
            return result;
          };
        };
        wrap(globalThis, 'scrollTo');
        wrap(globalThis.Element.prototype, 'scrollIntoView');
        wrap(globalThis.HTMLElement.prototype, 'focus');
        for (const name of ['scrollLeft', 'scrollTop']) {
          const descriptor = Object.getOwnPropertyDescriptor(globalThis.Element.prototype, name);
          if (!descriptor?.set || !descriptor.configurable) continue;
          Object.defineProperty(globalThis.Element.prototype, name, {
            ...descriptor,
            set(value) {
              const start = performance.now();
              descriptor.set.call(this, value);
              if (active) calls.push({ action: active, name, target: this.id || this.tagName, value, duration: performance.now() - start });
            },
          });
        }
        const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        for (const [name, selector, focus] of [
          ['first', '.tile[data-x="1"][data-y="1"]', true],
          ['warm', '.tile[data-x="2"][data-y="1"]', true],
          ['title', '#open-title', false],
          ['resume', '#title-resume', false],
        ]) {
          if (name === 'title') {
            const board = document.querySelector('#board-viewport');
            board.scrollLeft = 90;
            board.scrollTop = 80;
            await frame();
            await frame();
          }
          const target = document.querySelector(selector);
          if (!(target instanceof globalThis.HTMLElement)) throw Error(`Missing ${selector}`);
          active = name;
          const view = document.querySelector('#board-viewport');
          const beforeScroll = { x: globalThis.scrollX, y: globalThis.scrollY, left: view.scrollLeft, top: view.scrollTop };
          performance.mark(`v149:${name}:start`);
          const start = performance.now();
          if (focus) target.focus({ preventScroll: true });
          target.click();
          const handlerMs = performance.now() - start;
          performance.mark(`v149:${name}:handler`);
          await frame();
          const firstFrameMs = performance.now() - start;
          await frame();
          const twoFramesMs = performance.now() - start;
          await frame();
          await frame();
          performance.mark(`v149:${name}:end`);
          active = '';
          const afterView = document.querySelector('#board-viewport');
          results.push({
            name,
            handlerMs,
            firstFrameMs,
            twoFramesMs,
            beforeScroll,
            afterScroll: { x: globalThis.scrollX, y: globalThis.scrollY, left: afterView.scrollLeft, top: afterView.scrollTop },
          });
        }
        return { results, calls };
      });
      const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      await complete;
      const tracePath = `${output}-${width}-${size}.trace.json.gz`;
      writeFileSync(tracePath, gzipSync(JSON.stringify({ traceEvents: events })));
      const phases = actions.results.map((action) => {
        const start = events.find((e) => e.name === `v149:${action.name}:start`)?.ts;
        const end = events.find((e) => e.name === `v149:${action.name}:end`)?.ts;
        if (!Number.isFinite(start) || !Number.isFinite(end)) throw Error('Missing trace marks');
        const scoped = events.filter((e) => e.ph === 'X' && e.ts >= start && e.ts < end);
        const total = (name) => scoped.filter((e) => e.name === name).reduce((n, e) => n + (e.dur ?? 0), 0) / 1000;
        const paints = scoped.filter((e) => e.name === 'Paint');
        return {
          ...action,
          layoutMs: total('Layout'),
          updateStyleMs: total('UpdateLayoutTree'),
          paintWorkMs: total('Paint'),
          paintEvents: paints.length,
          firstMainThreadPaintMs: paints.length ? Math.min(...paints.map((e) => (e.ts + (e.dur ?? 0) - start) / 1000)) : null,
          lastMainThreadPaintMs: paints.length ? Math.max(...paints.map((e) => (e.ts + (e.dur ?? 0) - start) / 1000)) : null,
        };
      });
      reports.push({ width, size, build, tracePath, phases, calls: actions.calls });
    } finally {
      await context.close();
    }
  }
  writeFileSync(
    `${output}.json`,
    JSON.stringify(
      {
        label,
        browser: browser.version(),
        harnessSha256: createHash('sha256')
          .update(readFileSync(new URL(import.meta.url)))
          .digest('hex'),
        reports,
        note: 'Instrumented diagnostic; wrappers and tracing add overhead. Main-thread Paint is not GPU presentation or physical touch. Compare uninstrumented paired runs separately.',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
