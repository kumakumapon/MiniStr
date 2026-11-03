import { expect, test, type Page } from '@playwright/test';
import { operationData } from '../../src/game/operations.fixture';

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`preserves conflicting tabs and recovers a damaged backup at ${width}/${locale}`, async ({ page, context }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.locator('.title-overlay [data-locale]').selectOption(locale);
      await page.locator('.title-map-card').first().click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      await page.locator('#begin-operation').click();
      await page.locator('#save').click();
      const original = await page.evaluate(() => localStorage.getItem('ministr.save.manual'));
      expect(original).not.toBeNull();
      await page.locator('#open-title').click();
      const second = await context.newPage();
      await second.goto('/');
      await second.evaluate(() => localStorage.setItem('ministr.save.manual', '{broken-in-other-tab'));
      await expect(page.locator('#storage-session-export')).toBeVisible();
      const download = page.waitForEvent('download');
      await page.locator('#backup-export').click();
      const stream = await (await download).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const backup = JSON.parse(Buffer.concat(chunks).toString());
      expect(backup.entries.find((entry: string[]) => entry[0] === 'ministr.save.manual')[1]).toBe(original);
      expect(await second.evaluate(() => localStorage.getItem('ministr.save.manual'))).toBe('{broken-in-other-tab');
      const matchDownload = page.waitForEvent('download');
      await page.locator('#storage-session-export').click();
      expect((await matchDownload).suggestedFilename()).toBe('ministr-current-match.json');
      await page.screenshot({ path: info.outputPath('systems-storage-conflict.png'), fullPage: true });
      await second.close();
      await page.reload();
      await expect(page.locator('.export-save-slot[data-save-slot="manual"]')).toBeEnabled();
      page.on('dialog', (d) => d.accept());
      const recovery = JSON.stringify({
        schemaVersion: 1,
        entries: [
          ['ministr.save.manual', original],
          ['ministr.save.auto', '{broken'],
        ],
      });
      await page.locator('#save-recovery-import').setInputFiles({ name: 'damaged-backup.json', mimeType: 'application/json', buffer: Buffer.from(recovery) });
      await expect(page.locator('.load-save-slot:not([disabled])')).toHaveCount(1);
      expect(await page.evaluate(() => localStorage.getItem('ministr.save.manual'))).toBe('{broken-in-other-tab');
      await page.locator('.load-save-slot:not([disabled])').click();
      await page.locator('#handoff-start').click();
      await expect(page.locator('.board .tile').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }

test('CPU worker pauses, resumes and never applies results after returning to title', async ({ page }) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="wide-front"]').click();
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.locator('#begin-operation').click();
  await expect(page.locator('.spectate-current')).toHaveCount(1);
  const pauseControl = await page.locator('#spectate-toggle').elementHandle();
  await page.locator('#spectate-toggle').click();
  expect(await pauseControl!.evaluate((node) => node === document.querySelector('#spectate-toggle'))).toBe(true);
  await expect(page.locator('#spectate-toggle')).toHaveAttribute('aria-pressed', 'true');
  const paused = await page.locator('.board').innerHTML();
  await page.waitForTimeout(600);
  expect(await page.locator('.board').innerHTML()).toBe(paused);
  await page.locator('#spectate-toggle').click();
  await expect.poll(() => page.locator('.board').innerHTML()).not.toBe(paused);
  await page.locator('#spectate-toggle').click();
  await page.locator('#open-title').click();
  await expect(page.locator('.board .tile')).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.locator('.title-overlay')).toBeVisible();
});

test('worker decisions match the synchronous CPU for archived state snapshots', async ({ page }) => {
  const { readdirSync } = await import('node:fs');
  const { createScenarioInitialState, maps, operationScenarios } = await import('../../src/game');
  const { chooseCpuAction } = await import('../../src/ai');
  const workerFile = readdirSync('dist/assets').find((name) => /^cpuWorker-.*\.js$/.test(name));
  expect(workerFile).toBeDefined();
  await page.goto('/');
  for (const scenario of [maps[0]!, operationScenarios.find((s) => s.id === 'wide-front')!])
    for (const policy of ['balanced', 'defensive'] as const) {
      const state = createScenarioInitialState(scenario);
      const expected = chooseCpuAction(state, 'normal', 'red', policy);
      const actual = await page.evaluate(
        async ({ state, policy, workerFile }) => {
          const worker = new Worker(new URL(`assets/${workerFile}`, location.href), { type: 'module' });
          try {
            return await new Promise((resolve, reject) => {
              worker.onmessage = (e) => resolve(e.data);
              worker.onerror = reject;
              worker.postMessage({ state, difficulty: 'normal', side: 'red', policy });
            });
          } finally {
            worker.terminate();
          }
        },
        { state, policy, workerFile },
      );
      expect(actual).toEqual(expected);
    }
});

async function namedSnapshot(page: Page) {
  const before = await page.evaluate(() => Object.keys(localStorage));
  await page.locator('#save').click();
  return page.evaluate((before) => {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith('ministr.save.slot.') && !before.includes(key));
    if (keys.length !== 1) throw Error('Expected exactly one newly persisted slot');
    return JSON.parse(localStorage.getItem(keys[0]!)!);
  }, before);
}

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`pauses inside combat, preserves results and opens the spectator menu at ${width}/${locale}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.clock.install();
      await page.addInitScript(
        ({ scenario, locale }) => {
          localStorage.setItem('ministr.locale', locale);
          localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
        },
        {
          locale,
          scenario: operationData({
            id: 'pause-combat',
            name: 'Pause combat',
            initialUnits: [
              { kind: 'heavyTank', owner: 'red', x: 1, y: 1 },
              { kind: 'infantry', owner: 'red', x: 0, y: 3 },
              { kind: 'heavyTank', owner: 'blue', x: 2, y: 1 },
              { kind: 'infantry', owner: 'blue', x: 7, y: 3 },
            ],
            victoryConditions: [{ type: 'eliminate' }],
            defeatConditions: [{ type: 'eliminate' }],
          }),
        },
      );
      page.on('dialog', (dialog) => dialog.accept('Paused match'));
      await page.goto('/');
      await expect(page.locator('.storage-write-notice')).toHaveCount(0);
      await page.locator('#title-cpu-speed').selectOption('4');
      await page.locator('.title-map-card[data-map-id="pause-combat"]').click();
      await page.locator('input[name="match-mode"][value="spectate"]').check();
      await page.locator('#begin-operation').click();
      await expect(page.locator('.battle-scene-backdrop #spectate-scene-pause')).toBeVisible();
      await expect(page.locator('#skip-cpu')).toBeDisabled();
      await expect(page.locator('#spectate-scene-menu')).toBeVisible();
      await expect(page.locator('.battle-scene')).toHaveCSS('opacity', '1');
      await expect(page.locator('.battle-scene')).toHaveCSS('animation-name', 'none');
      await page.screenshot({ path: info.outputPath('systems-spectate-scene-controls.png') });
      if (width === 1280) await page.locator('#spectate-scene-pause').press('Enter');
      else await page.locator('#spectate-scene-pause').click();
      await expect(page.locator('.battle-scene-backdrop, .tactical-scene-backdrop')).toHaveCount(0);
      await expect(page.locator('#spectate-toggle')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#spectate-toggle')).toBeFocused();
      const paused = await namedSnapshot(page);
      expect(paused.commands.some((command: { type: string }) => command.type === 'attack')).toBe(true);
      await page.clock.fastForward(10_000);
      const stopped = await namedSnapshot(page);
      expect(stopped.commands).toEqual(paused.commands);
      expect(stopped.gameState).toEqual(paused.gameState);
      await page.screenshot({ path: info.outputPath('systems-spectate-scene-paused.png') });
      await page.locator('#spectate-toggle').click();
      await page.clock.runFor(1_000);
      await expect(page.locator('#spectate-scene-menu')).toBeVisible();
      await expect(page.locator('.spectator-scene')).toHaveCSS('animation-name', 'none');
      await page.locator('#spectate-scene-menu').click();
      await expect(page.locator('.title-overlay')).toBeVisible();
      await page.clock.fastForward(10_000);
      await page.locator('#title-resume').click();
      await expect(page.locator('#spectate-toggle')).toHaveAttribute('aria-pressed', 'true');
      const afterMenu = await namedSnapshot(page);
      expect(afterMenu.commands.length).toBeGreaterThan(paused.commands.length);
      await page.clock.fastForward(10_000);
      const stillStopped = await namedSnapshot(page);
      expect(stillStopped.commands).toEqual(afterMenu.commands);
      expect(stillStopped.gameState).toEqual(afterMenu.gameState);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }

test('only one real tab can write, stale snapshots stay protected after taking over', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.storage-write-notice')).toHaveCount(0);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('.storage-write-notice')).toContainText('別のMiniStr');
  await expect(second.locator('.storage-write-notice')).toBeInViewport({ ratio: 1 });
  await Promise.all([page.locator('.title-overlay [data-locale]').selectOption('en'), second.locator('.title-overlay [data-locale]').selectOption('en')]);
  expect(await page.evaluate(() => localStorage.getItem('ministr.locale'))).toBe('en');
  await second.locator('.title-overlay [data-locale]').selectOption('ja');
  expect(await page.evaluate(() => localStorage.getItem('ministr.locale'))).toBe('en');
  await page.close();
  await second.locator('[data-storage-write-retry]').click();
  await expect(second.locator('#storage-session-export')).toBeVisible();
  // A newly acquired lock does not make an old snapshot safe to overwrite with.
  await second.locator('.title-overlay [data-locale]').selectOption('ja');
  expect(await second.evaluate(() => localStorage.getItem('ministr.locale'))).toBe('en');
  await second.reload();
  await expect(second.locator('.storage-write-notice')).toHaveCount(0);
  await second.locator('.title-overlay [data-locale]').selectOption('ja');
  expect(await second.evaluate(() => localStorage.getItem('ministr.locale'))).toBe('ja');
});

test('releases ownership on pagehide and permits an unchanged second tab to retry', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.storage-write-notice')).toHaveCount(0);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('[data-storage-write-retry]')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await second.locator('[data-storage-write-retry]').click();
  await expect(second.locator('.storage-write-notice')).toHaveCount(0);
  await second.locator('.title-overlay [data-locale]').selectOption('en');
  expect(await second.evaluate(() => localStorage.getItem('ministr.locale'))).toBe('en');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('.storage-write-notice')).toBeVisible();
  await page.locator('.title-overlay [data-locale]').selectOption('ja');
  expect(await page.evaluate(() => localStorage.getItem('ministr.locale'))).toBe('en');
});

test('missing locking support refuses persistent saves and still exports the current match', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined });
    localStorage.setItem('ministr.locale', 'en');
    localStorage.setItem('ministr.save.manual', 'retained');
  });
  await page.goto('/');
  await expect(page.locator('.storage-write-notice')).toContainText('cannot be saved');
  await expect(page.locator('.storage-write-notice')).toBeInViewport({ ratio: 1 });
  await page.locator('.title-map-card').first().click();
  await page.locator('input[name="match-mode"][value="hotseat"]').check();
  await page.locator('#begin-operation').click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#save').click();
  expect(await page.evaluate(() => localStorage.getItem('ministr.save.manual'))).toBe('retained');
  const download = page.waitForEvent('download');
  await page.locator('[data-storage-write-export]').click();
  expect((await download).suggestedFilename()).toBe('ministr-current-match.json');
});

test('ignores a cancelled fallback result after rapid pause and resume', async ({ page }) => {
  let releaseImport!: () => void;
  let sawImport!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseImport = resolve;
  });
  const started = new Promise<void>((resolve) => {
    sawImport = resolve;
  });
  await page.route('**/cpuFallback-*.js', async (route) => {
    sawImport();
    await gate;
    await route.continue();
  });
  await page.clock.install();
  await page.addInitScript(
    (scenario) => {
      window.Worker = class {
        constructor() {
          throw Error('No worker');
        }
      } as unknown as typeof Worker;
      localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
    },
    operationData({
      id: 'fallback-pause',
      name: 'Fallback pause',
      initialUnits: [
        { kind: 'heavyTank', owner: 'red', x: 1, y: 1 },
        { kind: 'infantry', owner: 'red', x: 0, y: 3 },
        { kind: 'heavyTank', owner: 'blue', x: 2, y: 1 },
        { kind: 'infantry', owner: 'blue', x: 7, y: 3 },
      ],
      victoryConditions: [{ type: 'eliminate' }],
      defeatConditions: [{ type: 'eliminate' }],
    }),
  );
  page.on('dialog', (dialog) => dialog.accept('Fallback pause'));
  await page.goto('/');
  await page.locator('#title-cpu-speed').selectOption('4');
  await page.locator('.title-map-card[data-map-id="fallback-pause"]').click();
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.locator('#begin-operation').click();
  await started;
  await page.locator('#spectate-toggle').click();
  await page.locator('#spectate-toggle').click();
  releaseImport();
  await expect(page.locator('.battle-scene-backdrop #spectate-scene-pause')).toBeVisible();
  await page.clock.runFor(4_000);
  if (await page.locator('.spectator-scene').isVisible()) await expect(page.locator('.spectator-scene')).toHaveCSS('animation-name', 'none');
  if (await page.locator('#spectate-scene-pause').isVisible()) await page.locator('#spectate-scene-pause').click();
  else await page.locator('#spectate-toggle').click();
  const saved = await namedSnapshot(page);
  expect(saved.commands.length).toBeGreaterThan(1);
  const board = await page.locator('.board').innerHTML();
  await page.clock.fastForward(10_000);
  expect(await page.locator('.board').innerHTML()).toBe(board);
  expect((await namedSnapshot(page)).commands).toEqual(saved.commands);
});
