import { expect, test } from '@playwright/test';
import { operationData } from '../../src/game/operations.fixture';

for (const width of [1280, 390]) {
  test(`configures title music and changes army tracks through hotseat turns at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(
      (scenario) => {
        localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
        localStorage.setItem('ministr.locale', 'en');
        const OriginalAudio = window.Audio;
        const observed = { elements: [] as HTMLAudioElement[], loads: [] as string[] };
        Object.assign(window, { musicProbe: observed });
        window.Audio = function (src?: string) {
          const element = new OriginalAudio(src);
          const load = element.load.bind(element);
          element.load = () => {
            observed.loads.push(element.src);
            load();
          };
          observed.elements.push(element);
          return element;
        } as typeof Audio;
      },
      operationData({
        id: 'army-music',
        name: 'Army music',
        initialUnits: [
          { kind: 'tank', owner: 'red', x: 1, y: 1 },
          { kind: 'infantry', owner: 'red', x: 0, y: 2 },
          { kind: 'heavyTank', owner: 'blue', x: 2, y: 1 },
          { kind: 'infantry', owner: 'blue', x: 5, y: 3 },
        ],
        victoryConditions: [{ type: 'eliminate' }],
        defeatConditions: [{ type: 'eliminate' }],
      }),
    );
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await page.locator('#title-music-settings > summary').click();
    await page.locator('#title-music-track').selectOption('rock-red');
    await page.locator('#title-music-blue-track').selectOption('rock-blue');
    await page.locator('#title-music-preview-blue').click();
    const source = () => page.evaluate(() => (window as unknown as { musicProbe: { elements: HTMLAudioElement[] } }).musicProbe.elements[0]!.src);
    await expect.poll(source).toContain('rock-blue-theme.ogg');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { musicProbe: { elements: HTMLAudioElement[] } }).musicProbe.elements[0]!.readyState))
      .toBeGreaterThanOrEqual(2);
    await page.locator('#title-music-preview-red').click();
    await expect.poll(source).toContain('rock-red-theme.ogg');
    await page.screenshot({ path: testInfo.outputPath(`systems-title-music-${width}.png`) });
    await page.locator('.title-map-card[data-map-id="army-music"]').click();
    await page.locator('input[name="match-mode"][value="hotseat"]').check();
    await page.locator('#begin-operation').click();
    await expect(page.locator('#music-track')).toHaveValue('rock-red');
    await expect(page.locator('#music-blue-track')).toHaveValue('rock-blue');
    await page.locator('.tile[data-x="1"][data-y="1"]').click();
    await page.locator('.tile[data-x="2"][data-y="1"]').click();
    await expect(page.locator('.battle-scene')).toBeVisible();
    await expect.poll(source).toContain('battle-theme.ogg');
    // Keyboard activation does not wait for the animated scene to become
    // geometrically stable before its automatic 3.6-second dismissal.
    await page.locator('#battle-scene-skip').press('Enter');
    await expect(page.locator('.battle-scene')).toHaveCount(0);
    await expect.poll(source).toContain('rock-red-theme.ogg');
    await expect.poll(() => page.evaluate(() => (window as unknown as { musicProbe: { elements: HTMLAudioElement[] } }).musicProbe.elements[0]!.paused)).toBe(false);

    await page.locator('#end').click();
    await expect(page.locator('#handoff-start')).toBeVisible();
    await expect.poll(source).toContain('rock-blue-theme.ogg');
    await page.locator('#handoff-start').click();
    await page.locator('#end').click();
    await expect.poll(source).toContain('rock-red-theme.ogg');
    await page.locator('#handoff-start').click();
    await page.locator('#music-army-tracks').uncheck();
    const loadCount = await page.evaluate(() => (window as unknown as { musicProbe: { loads: string[] } }).musicProbe.loads.length);
    await page.locator('#end').click();
    await expect.poll(source).toContain('rock-red-theme.ogg');
    expect(await page.evaluate(() => (window as unknown as { musicProbe: { loads: string[] } }).musicProbe.loads.length)).toBe(loadCount);
    expect(await page.evaluate(() => (window as unknown as { musicProbe: { elements: HTMLAudioElement[] } }).musicProbe.elements.length)).toBe(1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.music.settings')!));
    expect(saved).toMatchObject({ fieldTrack: 'rock-red', blueFieldTrack: 'rock-blue', armyTracks: false });
    await page.reload();
    await page.locator('#title-music-settings > summary').click();
    await expect(page.locator('#title-music-track')).toHaveValue('rock-red');
    await expect(page.locator('#title-music-blue-track')).toHaveValue('rock-blue');
    await expect(page.locator('#title-music-blue-track')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}
