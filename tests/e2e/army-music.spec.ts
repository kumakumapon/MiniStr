import { expect, test, type Page } from '@playwright/test';
import { operationData } from '../../src/game/operations.fixture';

async function prepareMusic(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(
    (scenario) => {
      localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
      localStorage.setItem('ministr.locale', 'en');
      if (!localStorage.getItem('ministr.music.settings')) {
        localStorage.setItem('ministr.music.settings', JSON.stringify({ muted: false, volume: 0.35, fieldTrack: 'rock-red', blueFieldTrack: 'rock-blue', armyTracks: true }));
      }
      // Observe the real Web Audio graph: which tracks have a started, not yet stopped source.
      const trackOf = new WeakMap<object, string>();
      const observed = {
        started: [] as string[],
        active: new Map<AudioBufferSourceNode, string>(),
        peak: 0,
        loops: [] as boolean[],
        elements: [] as HTMLAudioElement[],
        contexts: new Set<AudioContext>(),
        effects: 0,
      };
      Object.assign(window, { musicProbe: observed });
      // Browsers without Web Audio (e.g. Playwright's Windows WebKit) use the <audio> fallback: observe that too.
      const OriginalAudio = window.Audio;
      window.Audio = function (src?: string) {
        const element = new OriginalAudio(src);
        observed.elements.push(element);
        return element;
      } as typeof Audio;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('.ogg')) return response;
        const arrayBuffer = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => {
          const data = await arrayBuffer();
          trackOf.set(data, url);
          return data;
        };
        return response;
      };
      const base = BaseAudioContext.prototype;
      const gain = base.createGain;
      base.createGain = function (this: AudioContext) {
        observed.contexts.add(this);
        return gain.call(this);
      };
      const oscillator = base.createOscillator;
      base.createOscillator = function (this: BaseAudioContext) {
        const node = oscillator.call(this);
        const start = node.start.bind(node);
        node.start = (...args: Parameters<OscillatorNode['start']>) => {
          observed.effects++;
          start(...args);
        };
        return node;
      };

      const decode = base.decodeAudioData;
      base.decodeAudioData = function (this: BaseAudioContext, data: ArrayBuffer, ...rest: never[]) {
        const url = trackOf.get(data);
        const decoded = (decode as (...args: unknown[]) => Promise<AudioBuffer>).call(this, data, ...rest);
        void decoded.then((buffer) => {
          if (url) trackOf.set(buffer, url);
        });
        return decoded;
      } as typeof base.decodeAudioData;
      const createSource = base.createBufferSource;
      base.createBufferSource = function (this: BaseAudioContext) {
        const node = createSource.call(this);
        const start = node.start.bind(node);
        const stop = node.stop.bind(node);
        const url = () => (node.buffer ? trackOf.get(node.buffer) : undefined);
        node.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
          start(...args);
          const track = url();
          if (!track) return;
          observed.started.push(track);
          observed.loops.push(node.loop);
          observed.active.set(node, track);
          observed.peak = Math.max(observed.peak, observed.active.size);
        };
        node.stop = (...args: Parameters<AudioBufferSourceNode['stop']>) => {
          observed.active.delete(node);
          stop(...args);
        };
        node.addEventListener('ended', () => observed.active.delete(node));
        return node;
      };
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
}

type Probe = { contexts: Set<AudioContext>; effects: number; started: string[]; active: Map<unknown, string>; peak: number; loops: boolean[]; elements: HTMLAudioElement[] };
// Tracks of the sources that have started and not yet stopped. Exactly one must sound at a time.
const playing = (page: Page) =>
  page.evaluate(() => {
    const probe = (window as unknown as { musicProbe: Probe }).musicProbe;
    const elements = probe.elements.filter((element) => !element.paused && !element.muted).map((element) => element.src);
    return [...probe.active.values(), ...elements].join(',');
  });
const peak = (page: Page) => page.evaluate(() => (window as unknown as { musicProbe: Probe }).musicProbe.peak);
const elementCount = (page: Page) => page.evaluate(() => (window as unknown as { musicProbe: Probe }).musicProbe.elements.length);
const startCount = (page: Page) => page.evaluate(() => (window as unknown as { musicProbe: Probe }).musicProbe.started.length);

async function startHotseat(page: Page) {
  await page.locator('.title-map-card[data-map-id="army-music"]').click();
  await page.locator('input[name="match-mode"][value="hotseat"]').check();
  await page.locator('#begin-operation').click();
}

async function expectSingleAudio(page: Page) {
  // Never more than one music source sounds at once, and one is sounding now.
  expect(await peak(page)).toBeLessThanOrEqual(1);
  expect(await elementCount(page)).toBe(1);
  await expect.poll(() => playing(page).then((tracks) => tracks.split(',').filter(Boolean).length)).toBe(1);
}

for (const width of [1280, 390]) {
  test(`configures, previews and persists title music at ${width}`, async ({ page }, testInfo) => {
    await prepareMusic(page, width);
    await page.locator('#title-music-settings > summary').click();
    await page.locator('#title-music-track').selectOption('rock-red');
    await page.locator('#title-music-blue-track').selectOption('rock-blue');
    await page.locator('#title-music-preview-blue').click();
    await expect.poll(() => playing(page)).toContain('rock-blue-theme.ogg');
    await page.locator('#title-music-preview-red').click();
    await expect.poll(() => playing(page)).toContain('rock-red-theme.ogg');
    await page.screenshot({ path: testInfo.outputPath(`systems-title-music-${width}.png`) });
    await startHotseat(page);
    await expect(page.locator('#music-track')).toHaveValue('rock-red');
    await expect(page.locator('#music-blue-track')).toHaveValue('rock-blue');
    await expectSingleAudio(page);
    await page.locator('#music-army-tracks').uncheck();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.music.settings')!));
    expect(saved).toMatchObject({ fieldTrack: 'rock-red', blueFieldTrack: 'rock-blue', armyTracks: false });
    await page.reload();
    await page.locator('#title-music-settings > summary').click();
    await expect(page.locator('#title-music-track')).toHaveValue('rock-red');
    await expect(page.locator('#title-music-blue-track')).toHaveValue('rock-blue');
    await expect(page.locator('#title-music-blue-track')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });

  test(`restores army music after an actual battle at ${width}`, async ({ page }) => {
    await prepareMusic(page, width);
    await startHotseat(page);
    await page.locator('.tile[data-x="1"][data-y="1"]').click();
    await page.locator('.tile[data-x="2"][data-y="1"]').click();
    await expect(page.locator('.battle-scene')).toBeVisible();
    await expect.poll(() => playing(page)).toContain('battle-theme.ogg');
    // Keyboard activation does not wait for the animated scene to become
    // geometrically stable before its automatic 3.6-second dismissal.
    await page.locator('#battle-scene-skip').press('Enter');
    await expect(page.locator('.battle-scene')).toHaveCount(0);
    await expect.poll(() => playing(page)).toContain('rock-red-theme.ogg');
    await expectSingleAudio(page);
    await page.locator('#end').click();
    await expect(page.locator('#handoff-start')).toBeVisible();
    await expect.poll(() => playing(page)).toContain('rock-blue-theme.ogg');
    await expectSingleAudio(page);
  });

  test(`changes army music through hotseat turns and keeps a common track at ${width}`, async ({ page }) => {
    await prepareMusic(page, width);
    await startHotseat(page);
    await page.locator('#end').click();
    await expect(page.locator('#handoff-start')).toBeVisible();
    await expect.poll(() => playing(page)).toContain('rock-blue-theme.ogg');
    await page.locator('#handoff-start').click();
    await page.locator('#end').click();
    await expect.poll(() => playing(page)).toContain('rock-red-theme.ogg');
    await page.locator('#handoff-start').click();
    await page.locator('#music-army-tracks').uncheck();
    const startsBefore = await startCount(page);
    await page.locator('#end').click();
    await expect.poll(() => playing(page)).toContain('rock-red-theme.ogg');
    // A shared track keeps playing: no new source is started when the army changes.
    expect(await startCount(page)).toBe(startsBefore);
    await expectSingleAudio(page);
  });
}

for (const width of [1280, 390]) {
  test(`recovers music and effects after background return without another tap at ${width}`, async ({ page }) => {
    await prepareMusic(page, width);
    await startHotseat(page);
    await expectSingleAudio(page);
    const contexts = () => page.evaluate(() => [...(window as unknown as { musicProbe: Probe }).musicProbe.contexts].map((ctx) => ctx.state));
    const expectedContexts = await page.evaluate(() => ((window as unknown as { musicProbe: Probe }).musicProbe.elements.some((element) => !element.paused) ? 1 : 2));
    await expect.poll(contexts).toHaveLength(expectedContexts);
    await expect.poll(contexts).toEqual(Array(expectedContexts).fill('running'));
    const sourcesBefore = await startCount(page);
    for (const event of ['visibilitychange', 'pageshow', 'focus']) {
      await page.evaluate(async (event) => {
        const probe = (window as unknown as { musicProbe: Probe }).musicProbe;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        await Promise.all([...probe.contexts].map((ctx) => ctx.suspend()));
        document.dispatchEvent(new Event('visibilitychange'));
        if ([...probe.contexts].some((ctx) => ctx.state !== 'suspended')) throw Error('resumed in background');
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event));
      }, event);
      await expect.poll(contexts).toEqual(Array(expectedContexts).fill('running'));
      await expectSingleAudio(page);
      expect(await startCount(page)).toBe(sourcesBefore);
    }
    const effectsBefore = await page.evaluate(() => (window as unknown as { musicProbe: Probe }).musicProbe.effects);
    await page.locator('#end').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { musicProbe: Probe }).musicProbe.effects)).toBeGreaterThan(effectsBefore);
    await expect.poll(() => playing(page)).toContain('rock-blue-theme.ogg');
    await expectSingleAudio(page);
  });
}
