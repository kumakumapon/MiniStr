import { expect, test, type Page } from '@playwright/test';

async function assertMapContains(page: Page, selector: string): Promise<void> {
  const contained = await page.evaluate((selector) => {
    const viewport = document.querySelector<HTMLElement>('#board-viewport')!;
    const tile = viewport.querySelector<HTMLElement>(selector)!;
    const frame = viewport.getBoundingClientRect();
    const target = tile.getBoundingClientRect();
    return (
      target.left >= frame.left - 1 &&
      target.top >= frame.top - 1 &&
      target.right <= frame.left + viewport.clientWidth + 2 &&
      target.bottom <= frame.top + viewport.clientHeight + 2
    );
  }, selector);
  expect(contained).toBe(true);
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`follows and locates spectated units at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    const now = new Date('2026-10-14T12:00:00Z');
    await page.clock.install({ time: now });
    await page.clock.pauseAt(new Date(now.getTime() + 1_000));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('.title-map-card[data-map-id="siege"]').click();
    await page.locator('input[name="match-mode"][value="spectate"]').check();
    await page.locator('#begin-operation').click();
    await expect(page.locator('#spectate-follow')).toHaveAttribute('aria-pressed', 'true');
    while (await page.locator('#board-zoom-in').isEnabled()) await page.locator('#board-zoom-in').click();
    const pageScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));

    // Advance actual CPU commands until the far side takes over, without wall-clock races.
    for (let step = 0; step < 60; step += 1) {
      if ((await page.locator('.turn-indicator strong').textContent())?.includes('青軍')) break;
      await page.clock.runFor(400);
    }
    await expect(page.locator('.turn-indicator strong')).toContainText('青軍');
    await assertMapContains(page, '.tile.spectate-current');
    const followedScroll = await page.locator('#board-viewport').evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
    expect(followedScroll.x).toBeGreaterThan(0);
    expect(followedScroll.y).toBeGreaterThan(0);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(pageScroll);
    await expect(page.locator('.tile-inspector-unit')).toContainText('武器');
    await expect(page.locator('.tile-inspector-unit')).toContainText('弾数上限');
    await page.locator('.battlefield-wrap').screenshot({ path: testInfo.outputPath('spectator-follow-blue.png') });

    await page.locator('#spectate-toggle').click();
    await expect(page.locator('#spectate-toggle')).toHaveText('観戦を再開');
    await page.locator('#spectate-whole-board').click();
    const select = page.locator('#spectate-locate-unit');
    const option = await select.locator('option[value="r1"]').textContent();
    const coordinates = /\((\d+), (\d+)\)/.exec(option ?? '')!;
    const target = `.tile[data-x="${Number(coordinates[1]) - 1}"][data-y="${Number(coordinates[2]) - 1}"]`;
    await select.scrollIntoViewIfNeeded();
    await select.focus();
    // Header controls and Playwright's actionability scrolling intentionally move the page.
    // Measure the locator's own redraw against the position just before it is used.
    const manualPageScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await select.selectOption('r1');
    await page.clock.runFor(50);
    await expect(select).toBeFocused();
    await expect(page.locator('#spectate-follow')).toHaveAttribute('aria-pressed', 'false');
    await assertMapContains(page, target);
    await expect(page.locator('.tile-inspector-unit')).not.toContainText('補給');
    const locatedScroll = await page.locator('#board-viewport').evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
    expect(locatedScroll.x).toBeLessThan(followedScroll.x);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(manualPageScroll);
    const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
    await page.locator('.battlefield-wrap').screenshot({ path: testInfo.outputPath('spectator-locate-red.png') });

    // With follow off, later commands preserve the manually chosen map view.
    await page.locator('#spectate-toggle').click();
    await page.clock.runFor(400);
    expect(await page.locator('#board-viewport').evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))).toEqual(locatedScroll);
    const skipScene = page.locator('#battle-scene-skip, #tactical-scene-skip');
    if (await skipScene.count()) await skipScene.click();
    await page.locator('#spectate-toggle').click();
    await page.locator('#spectate-follow').click();
    await expect(page.locator('#spectate-follow')).toHaveAttribute('aria-pressed', 'true');
    await assertMapContains(page, '.tile.spectate-current');
  });
}
