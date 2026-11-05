import { expect, test } from './helpers/engineTest';
import type { ScenarioData } from '../../src/game/maps';

test('390px touch selects once and keeps a scrolled board stable after localized redraw', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const page = await context.newPage();
    const scenario: ScenarioData = {
      id: 'touch-response',
      name: 'Touch response',
      briefing: '',
      startingGold: 0,
      board: { width: 32, height: 32, cells: [] },
      initialUnits: [
        { kind: 'infantry', owner: 'red', x: 6, y: 6 },
        { kind: 'infantry', owner: 'red', x: 7, y: 6 },
        { kind: 'infantry', owner: 'blue', x: 31, y: 31 },
      ],
      victoryConditions: [{ type: 'eliminate' }],
      defeatConditions: [{ type: 'eliminate' }],
    };
    await page.addInitScript((scenario) => {
      localStorage.setItem('ministr.locale', 'en');
      localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
    }, scenario);
    await page.goto('/');
    await page.locator('.title-map-card[data-map-id="touch-response"]').click();
    await page.locator('input[name="match-mode"][value="hotseat"]').check();
    await page.locator('#begin-operation').click();
    for (const x of [6, 7]) {
      await page.locator(`.tile[data-x="${x}"][data-y="6"]`).tap();
      await expect(page.locator(`.tile[data-x="${x}"][data-y="6"] .selected-marker`)).toHaveCount(1);
    }
    const offsets = await page.evaluate(async () => {
      const viewport = document.querySelector<HTMLElement>('#board-viewport')!;
      viewport.scrollLeft = 90;
      viewport.scrollTop = 80;
      viewport.scrollIntoView({ block: 'center' });
      const before = { x: window.scrollX, y: window.scrollY, left: viewport.scrollLeft, top: viewport.scrollTop };
      document.querySelector<HTMLButtonElement>('.tile[data-x="6"][data-y="6"]')!.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const next = document.querySelector<HTMLElement>('#board-viewport')!;
      return { before, after: { x: window.scrollX, y: window.scrollY, left: next.scrollLeft, top: next.scrollTop } };
    });
    expect(offsets.before.y).toBeGreaterThan(0);
    expect(offsets.before.left).toBe(90);
    expect(offsets.before.top).toBe(80);
    expect(offsets.after).toEqual(offsets.before);
    await expect(page.locator('.selected-marker')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    await page.screenshot({ path: testInfo.outputPath('systems-390-touch-response.png') });
  } finally {
    await context.close();
  }
});

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`large board keeps input, focus and geometry at ${width} in ${locale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const scenario: ScenarioData = {
        id: 'response-board',
        name: 'Response board',
        briefing: '',
        startingGold: 0,
        board: { width: 32, height: 32, cells: [] },
        initialUnits: [
          { kind: 'infantry', owner: 'red', x: 1, y: 0 },
          { kind: 'infantry', owner: 'red', x: 1, y: 1 },
          { kind: 'infantry', owner: 'blue', x: 31, y: 31 },
        ],
        victoryConditions: [{ type: 'eliminate' }],
        defeatConditions: [{ type: 'eliminate' }],
      };
      await page.addInitScript(
        ({ scenario, locale }) => {
          localStorage.setItem('ministr.locale', locale);
          localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
        },
        { scenario, locale },
      );
      await page.goto('/');
      await page.locator('.title-map-card[data-map-id="response-board"]').click();
      await page.locator('input[name="match-mode"][value="hotseat"]').check();
      await page.locator('#begin-operation').click();
      const first = page.locator('.tile[data-x="1"][data-y="0"]');
      await first.click();
      await expect(first).toBeFocused();
      await expect(page.locator('.tile[tabindex="0"]')).toHaveCount(1);
      await expect(first.locator('.selected-marker')).toHaveCount(1);
      const originalBoard = await page.locator('.board').elementHandle();
      await page.locator('#open-title').click();
      await expect(page.locator('main')).toHaveAttribute('inert', '');
      expect(await originalBoard!.evaluate((board) => board.isConnected && board === document.querySelector('.board'))).toBe(true);
      await page.locator('#title-resume').click();
      await expect(page.locator('main')).not.toHaveAttribute('inert', '');
      expect(await originalBoard!.evaluate((board) => board === document.querySelector('.board'))).toBe(true);
      await first.click();
      await expect(first).toBeFocused();
      await expect(first.locator('.selected-marker')).toHaveCount(1);
      // Selection must keep the board's entire ancestor path connected.
      const stableTile = await page.locator('.tile[data-x="30"][data-y="0"]').elementHandle();
      const writes = await page.evaluate(() => {
        const app = document.querySelector('#app')!;
        const observer = new MutationObserver(() => {});
        const retained = [
          app.querySelector('main'),
          app.querySelector('.battle-layout'),
          app.querySelector('.battlefield-wrap'),
          app.querySelector('.battlefield-stage'),
          app.querySelector('#board-viewport'),
          app.querySelector('.board'),
        ];
        observer.observe(app, { childList: true, subtree: true });
        document.querySelector<HTMLButtonElement>('.tile[data-x="1"][data-y="1"]')!.click();
        const records = observer.takeRecords();
        const count = records.filter((record) => [...record.addedNodes].some((node) => node instanceof HTMLElement && node.matches('main'))).length;
        const disconnected = records.some((record) => [...record.removedNodes].some((node) => retained.includes(node as Element)));
        observer.disconnect();
        return { count, disconnected, connected: retained.every((node) => node?.isConnected) };
      });
      expect(writes).toEqual({ count: 0, disconnected: false, connected: true });
      expect(await stableTile!.evaluate((tile) => tile === document.querySelector('.tile[data-x="30"][data-y="0"]'))).toBe(true);
      await expect(page.locator('.tile[data-x="1"][data-y="1"] .selected-marker')).toHaveCount(1);
      const retained = await page.evaluate(() => {
        const board = document.querySelector<HTMLElement>('.board')!,
          viewport = document.querySelector('#board-viewport'),
          tile = document.querySelector('.tile[data-x="1"][data-y="1"]');
        document.querySelector<HTMLButtonElement>('#board-zoom-in')!.click();
        const same =
          board === document.querySelector('.board') && viewport === document.querySelector('#board-viewport') && tile === document.querySelector('.tile[data-x="1"][data-y="1"]');
        for (let i = 0; i < 8; i++) document.querySelector<HTMLButtonElement>('#board-zoom-in')!.click();
        const maximum = board.dataset.zoom === '200' && document.querySelector<HTMLButtonElement>('#board-zoom-in')!.disabled;
        for (let i = 0; i < 8; i++) document.querySelector<HTMLButtonElement>('#board-zoom-out')!.click();
        return { same, maximum, minimum: board.dataset.zoom === '50' && document.querySelector<HTMLButtonElement>('#board-zoom-out')!.disabled };
      });
      expect(retained).toEqual({ same: true, maximum: true, minimum: true });
      const second = page.locator('.tile[data-x="1"][data-y="1"]');
      await expect(second).toBeFocused();
      await expect(second.locator('.selected-marker')).toHaveCount(1);
      await second.press('Escape');
      await expect(page.locator('.selected-marker')).toHaveCount(0);
      await expect(second).toBeFocused();
      await second.press('Enter');
      await second.press('ArrowDown');
      const target = page.locator('.tile[data-x="1"][data-y="2"]');
      await expect(target).toBeFocused();
      await expect(page.locator('.tile[tabindex="0"]')).toHaveCount(1);
      await target.press('Enter');
      await expect(target).toBeFocused();
      await expect(page.locator('.tile[tabindex="0"]')).toHaveCount(1);
      await expect(target.locator('.unit.red')).toHaveCount(1);
      await expect(second.locator('.unit.red')).toHaveCount(0);
      await expect(page.locator('.board')).toHaveAttribute('data-zoom', '50');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: testInfo.outputPath('systems-board-response.png') });
    });
  }
