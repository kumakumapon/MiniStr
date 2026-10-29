import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { timingSummary } from '../../scripts/performanceMetrics';
import type { ScenarioData } from '../../src/game/maps';

// Measurements are evidence, not hardware-dependent CI thresholds.
for (const width of [1280, 390])
  for (const size of [16, 32]) {
    test(`measures board interactions for ${size}x${size} at ${width}`, async ({ page, browser }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const scenario: ScenarioData = {
        id: 'performance-board',
        name: 'Performance board',
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
      await page.addInitScript((scenario) => {
        localStorage.setItem('ministr.locale', 'en');
        localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
      }, scenario);
      await page.goto('/');
      await page.locator('.title-map-card[data-map-id="performance-board"]').click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      await page.locator('#begin-operation').click();
      await expect(page.locator('.board .tile')).toHaveCount(size * size);
      // Use a real pointer once to validate the route, then measure native click
      // handlers in-page so driver/network latency is not counted as game time.
      await page.locator('.tile[data-x="0"][data-y="0"]').click();
      await expect(page.locator('.selected-marker')).toHaveCount(1);
      const profile = process.env.BOARD_CPU_PROFILE ? await page.context().newCDPSession(page) : undefined;
      if (profile) {
        await profile.send('Profiler.enable');
        await profile.send('Profiler.start');
      }
      const result = await page.evaluate(
        async (samples) => {
          const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const selection: number[] = [],
            zoom: number[] = [];
          for (let i = 0; i < samples + 2; i++) {
            const start = performance.now();
            document.querySelector<HTMLButtonElement>(`.tile[data-x="${i % 3}"][data-y="0"]`)!.click();
            await frame();
            if (!document.querySelector('.selected-marker')) throw Error('Selection did not render');
            if (i >= 2) selection.push(performance.now() - start);
            const zoomStart = performance.now();
            document.querySelector<HTMLButtonElement>(i % 2 ? '#board-zoom-out' : '#board-zoom-in')!.click();
            await frame();
            if (i >= 2) zoom.push(performance.now() - zoomStart);
          }
          return {
            selection,
            zoom,
            userAgent: navigator.userAgent,
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            domNodes: document.querySelectorAll('*').length,
          };
        },
        Number(process.env.PERF_SAMPLES ?? 5),
      );
      if (profile) {
        const data = await profile.send('Profiler.stop');
        writeFileSync(testInfo.outputPath('board.cpuprofile'), JSON.stringify(data.profile));
        await profile.detach();
      }
      expect(result.documentWidth).toBeLessThanOrEqual(width + 1);
      const report = {
        kind: 'browser-performance',
        sourceState: 'working-tree',
        variant: process.env.PERFORMANCE_VARIANT ?? 'unrecorded',
        scripts: await page.evaluate(() => [...document.scripts].map((script) => new URL(script.src).pathname).filter(Boolean)),
        sha: process.env.GITHUB_SHA ?? 'unrecorded',
        browser: testInfo.project.name,
        browserVersion: browser.version(),
        board: [size, size],
        units: size * 4,
        warmup: 2,
        ...result,
        selectionTiming: timingSummary(result.selection),
        zoomTiming: timingSummary(result.zoom),
        note: 'Native handler to two animation frames; frame scheduling included. Samples are diagnostic, not a mobile-hardware p95 guarantee. No fixed latency threshold.',
      };
      const body = JSON.stringify(report, null, 2);
      writeFileSync(testInfo.outputPath('systems-performance.json'), body);
      await testInfo.attach('performance', { body, contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath('systems-performance-board.png') });
    });
  }
