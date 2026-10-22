import { expect, test } from '@playwright/test';
import { crossingScenarioData } from '../crossing.fixture';

test('title speed, half-size map and disabled spectator skip work together', async ({ page }) => {
  // Keep the 4x CPU timer deterministic while exercising the visible controls.
  const now = new Date('2026-10-22T00:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1_000));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#title-cpu-speed').focus();
  await page.locator('#title-cpu-speed').selectOption('4');
  await page.clock.runFor(50);
  await expect(page.locator('#title-cpu-speed')).toBeFocused();
  await page.locator('#title-board-zoom').focus();
  await page.locator('#title-board-zoom').selectOption('50');
  await page.clock.runFor(50);
  await expect(page.locator('#title-board-zoom')).toBeFocused();
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.locator('#begin-operation').click();
  await expect(page.locator('#cpu-speed')).toHaveValue('4');
  await expect(page.locator('.board')).toHaveAttribute('data-zoom', '50');
  await expect(page.locator('#skip-cpu')).toBeDisabled();
  await page.locator('#spectate-toggle').click();
  for (let step = 0; step < 6 && (await page.locator('#board-zoom-out').isEnabled()); step++) await page.locator('#board-zoom-out').click();
  await expect(page.locator('.board')).toHaveAttribute('data-zoom', '50');
  expect((await page.locator('.tile').first().boundingBox())!.width).toBe(22);
  await page.locator('#open-title').click();
  await expect(page.locator('#title-cpu-speed')).toHaveValue('4');
  await expect(page.locator('#title-board-zoom')).toHaveValue('50');
  await page.locator('#title-cpu-speed').selectOption('0.5');
  await page.locator('#title-board-zoom').selectOption('auto');
  await page.locator('#title-resume').click();
  await expect(page.locator('#cpu-speed')).toHaveValue('0.5');
  await expect(page.locator('.board')).toHaveAttribute('data-zoom', '100');
  await page.locator('#spectate-toggle').click();
  await expect(page.locator('#skip-cpu')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('bridge keyboard confirmation and saved state survive reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('#title-editor').click();
  await page.locator('#editor-json').fill(JSON.stringify(crossingScenarioData()));
  await page.locator('#editor-import').click();
  await page.locator('#editor-start').click();
  await page.locator('#begin-operation').click();
  await page.locator('.tile[data-x="3"][data-y="2"]').click();
  await page.locator('#bridge-unit').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#bridge-unit')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tile[data-x="4"][data-y="2"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bridge-confirm')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.bridge-marker')).toHaveCount(1);
  await page.locator('#save').click();
  await page.reload();
  await page.locator('.load-save-slot[data-save-slot="manual"]').click();
  await expect(page.locator('.bridge-marker')).toHaveCount(1);
  await expect(page.locator('.tile[data-x="8"][data-y="4"] .unit')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const viewport of [
  { width: 360, height: 780 },
  { width: 430, height: 850 },
  { width: 844, height: 390 },
]) {
  test(`practice/save/resume at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: '基本操作を練習' }).click();
    await page.locator('#begin-operation').click();
    await page.locator('.tile[data-x="0"][data-y="1"]').click();
    await page.locator('.tile[data-x="0"][data-y="2"]').click();
    await page.locator('#save').click();
    await expect(page.locator('.status-message')).toContainText('セーブしました');
    await page.locator('#open-title').click();
    await page.locator('.load-save-slot[data-save-slot="manual"]').click();
    await expect(page.locator('.title-overlay')).toHaveCount(0);
    await expect(page.locator('.tile[data-x="0"][data-y="2"]')).toContainText('歩');
    const overflow = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.right > window.innerWidth + 1 && !element.closest('.board-viewport, .unit-reference');
        })
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          width: element.getBoundingClientRect().width,
        }))
        .slice(0, 20),
    }));
    expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width + 1);
    await page.locator('#open-title').click();
    await page.locator('#title-editor').click();
    await page.locator('#editor-start').click();
    await expect(page.locator('.editor-notice')).toContainText('司令部');
    await page.locator('#editor-close').click();
    await expect(page.locator('.title-overlay')).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('title-verified.png'),
      fullPage: true,
    });
  });
}

test('keyboard navigation and enlarged text retain primary actions', async ({ page }) => {
  await page.goto('/');
  const beforeScale = Number.parseFloat(await page.locator('#title-editor').evaluate((element) => getComputedStyle(element).fontSize));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const afterScale = Number.parseFloat(await page.locator('#title-editor').evaluate((element) => getComputedStyle(element).fontSize));
  expect(afterScale).toBeGreaterThanOrEqual(beforeScale * 1.9);
  await page.locator('.title-map-card[data-map-id="skirmish"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#begin-operation').focus();
  await page.keyboard.press('Enter');
  const tile = page.locator('.tile[data-x="0"][data-y="1"]');
  await tile.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.status-message')).toContainText('移動');
  await page.locator('#save').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.status-message')).toContainText('セーブ');
  await page.locator('#open-title').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title-resume')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('keyboard-verified.png'),
    fullPage: true,
  });
});

test('modal keyboard focus stays inside and wraps in both directions', async ({ page }) => {
  await page.goto('/');
  const focusAt = (index: 'first' | 'last') =>
    page.evaluate((which) => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
      items[which === 'first' ? 0 : items.length - 1]?.focus();
    }, index);
  const isFocused = (index: 'first' | 'last') =>
    page.evaluate((which) => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
      return document.activeElement === items[which === 'first' ? 0 : items.length - 1];
    }, index);
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!;
      const first = [
        ...dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')[0];
      return document.activeElement === first;
    }),
  ).toBe(true);
  await focusAt('last');
  await page.keyboard.press('Tab');
  expect(await isFocused('first')).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await isFocused('last')).toBe(true);
});

test('editor text edits have live undo and export status is announced', async ({ page }) => {
  await page.goto('/');
  await page.locator('#title-editor').click();
  const name = page.locator('#editor-name');
  const original = await name.inputValue();
  await name.fill('Review scenario');
  await expect(page.locator('#editor-undo')).toBeEnabled();
  await page.locator('#editor-undo').click();
  await expect(name).toHaveValue(original);
  await name.fill('Review scenario');
  await page.locator('#editor-export').click();
  await expect(page.locator('#editor-notice')).toBeVisible();
  await expect(page.locator('#editor-notice')).toContainText('JSONを書き出しました');
});

test('editor resize rejects invalid dimensions and lists cropped hold objectives', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('#title-editor').click();
  const source = JSON.parse(await page.locator('#editor-json').inputValue()) as {
    board: { width: number; height: number; cells: unknown[] };
    victoryConditions: unknown[];
  } & Record<string, unknown>;
  source.board.width = 32;
  source.board.height = 32;
  source.victoryConditions = [{ type: 'hold', positions: [{ x: 31, y: 31 }], turns: 2 }];
  await page.locator('#editor-json').fill(JSON.stringify(source));
  await page.locator('#editor-import').click();
  await expect(page.locator('#editor-notice')).toContainText('JSONを反映しました');

  await page.locator('#editor-width').fill('1');
  await page.locator('#editor-resize').click();
  await expect(page.locator('#editor-notice')).toContainText('2〜32の整数');
  await expect(page.locator('#editor-width')).toHaveValue('32');

  await page.locator('#editor-width').fill('12');
  await page.locator('#editor-height').fill('9');
  await page.locator('#editor-resize').click();
  await expect(page.locator('#editor-notice')).toContainText('(32, 32)');
  await expect(page.locator('#editor-notice')).toContainText('勝利条件を修正');
});

test('dense 32×32 editor boards render within the interactive budget', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.locator('#title-editor').click();
  const source = JSON.parse(await page.locator('#editor-json').inputValue()) as {
    board: { width: number; height: number; fill?: string; cells: unknown[] };
  } & Record<string, unknown>;
  source.board = {
    width: 32,
    height: 32,
    fill: 'plain',
    cells: Array.from({ length: 32 * 32 }, (_, index) => [index % 32, Math.floor(index / 32), 'forest']),
  };
  await page.locator('#editor-json').fill(JSON.stringify(source));
  const started = await page.evaluate(() => performance.now());
  await page.locator('#editor-import').click();
  await expect(page.locator('.editor-tile')).toHaveCount(32 * 32);
  const elapsedMs = await page.evaluate((start) => performance.now() - start, started);
  console.info(`Dense 32×32 editor render: ${elapsedMs.toFixed(1)} ms`);
  expect(elapsedMs).toBeLessThan(5_000);
});
