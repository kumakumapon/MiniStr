import { expect, test } from '@playwright/test';

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
