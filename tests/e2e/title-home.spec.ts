import { expect, test } from '@playwright/test';
import { fourArmySpectatorFixture } from '../../src/game/fourArmySpectator.fixture';
import { valueOf } from '../../src/game/operations.fixture';
import { forkResearch } from '../../src/game/research';
import { researchReplayFixture } from '../../src/game/research.fixture';
import { normalResearchTestEntries } from './helpers/researchFixtures';

for (const [width, language] of [
  [390, 'ja'],
  [1280, 'en'],
] as const) {
  test(`opens home at the top and restores the settings and records buttons at ${width}/${language}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.addInitScript((lang) => localStorage.setItem('ministr.locale', lang), language);
    await page.goto('/');
    await expect(page.locator('#title-heading')).toBeFocused();
    expect(await page.locator('.title-screen').evaluate((element) => [window.scrollY, element.scrollTop])).toEqual([0, 0]);
    await expect(page.locator('#title-continue')).toBeInViewport();
    await expect(page.locator('#title-new-game')).toBeInViewport();
    await page.locator('#title-open-settings').click();
    await expect(page.locator('#title-panel-heading')).toBeFocused();
    await expect(page.locator('#title-cpu-speed')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#title-open-settings')).toBeFocused();
    await page.locator('#title-open-records').click();
    await expect(page.locator('#title-import-replay')).toBeVisible();
    await page.locator('#title-home-back').click();
    await expect(page.locator('#title-open-records')).toBeFocused();
    await page.locator('.title-map-card[data-map-id="skirmish"]').click();
    await page.locator('#begin-operation').click();
    await expect(page.locator('#board-viewport')).toBeVisible();
  });
}

for (const latest of ['multiplayer', 'research', 'classic'] as const) {
  test(`continues the latest ${latest} match among three save formats`, async ({ page }) => {
    const old = '2024-01-01T00:00:00.000Z';
    const recent = '2090-01-01T00:00:00.000Z';
    const normal = normalResearchTestEntries();
    const saved = JSON.parse(normal['ministr.save.manual']!);
    const study = valueOf(await forkResearch(researchReplayFixture(), 0));
    const four = fourArmySpectatorFixture(2);
    const entries = {
      'ministr.save.manual': JSON.stringify({ ...saved, savedAt: latest === 'classic' ? recent : old }),
      'ministr.research.manual': JSON.stringify({ ...study, match: { ...study.match, savedAt: latest === 'research' ? recent : old } }),
      'ministr.fourArmy.save.1': JSON.stringify({ ...four, savedAt: latest === 'multiplayer' ? recent : old }),
    };
    await page.addInitScript((rows) => {
      for (const [key, raw] of Object.entries(rows)) localStorage.setItem(key, raw);
    }, entries);
    await page.goto('/');
    await page.locator('#title-continue').click();
    if (latest === 'multiplayer') await expect(page.locator('#four-turn')).toBeVisible();
    else {
      await expect(page.locator('#board-viewport')).toBeVisible();
      await expect(page.locator('.research-status')).toHaveCount(latest === 'research' ? 1 : 0);
    }
    await expect(page.locator('.title-overlay')).toBeHidden();
  });
}
