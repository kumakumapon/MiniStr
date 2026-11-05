import { expect } from '@playwright/test';
import { test } from './helpers/engineTest';

for (const width of [1280, 390])
  for (const locale of ['ja', 'en'])
    for (const id of ['tactics-supply', 'tactics-crossing']) {
      test(`learns, folds and restores ${id} at ${width}/${locale}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript((locale) => localStorage.setItem('ministr.locale', locale), locale);
        await page.goto('/');
        const card = page.locator(`.title-map-card[data-map-id="${id}"]`);
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator('.map-preview')).toBeVisible();
        await card.click();
        await expect(page.locator('#briefing-title')).toContainText(locale === 'en' ? 'Tactical Exercise' : '戦術演習');
        await page.locator('#begin-operation').click();
        const panel = page.locator('#learning-panel');
        await expect(panel).toHaveAttribute('open', '');
        await expect(panel.locator('ol > li')).toHaveCount(6);
        await expect(panel.locator('.learning-progress')).toContainText('0/6');
        if (id === 'tactics-supply') {
          await page.locator('.tile[data-x="2"][data-y="3"]').click();
          await page.locator('.tile[data-x="4"][data-y="3"]').click();
        } else {
          await page.locator('.tile[data-x="4"][data-y="3"]').click();
          await page.locator('#bridge-unit').click();
          await page.locator('.tile[data-x="5"][data-y="3"]').click();
          await page.locator('#bridge-confirm').click();
        }
        await expect(panel.locator('.learning-progress')).toContainText('1/6');
        await expect(panel.locator('[data-learning-complete="true"]')).toHaveCount(1);
        await page.locator('#save').click();
        await panel.locator('summary').click();
        await expect(panel).not.toHaveAttribute('open', '');
        await expect(panel.locator('.unit-reference')).toHaveCount(0);
        await expect(panel.locator('summary')).toBeFocused();
        await panel.locator('summary').press('Enter');
        await expect(panel.locator('.learning-progress')).toContainText('1/6');
        await expect(panel.locator('.unit-reference tbody tr')).toHaveCount(18);
        if (locale === 'en') {
          expect(await panel.innerText()).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
          if (id === 'tactics-supply') expect(await page.locator('.capture-card').innerText()).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/);
        }
        await page.locator('.battlefield-heading').evaluate((element) => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: info.outputPath(`systems-learning-board-${id}-${width}-${locale}.png`) });
        await panel.locator('summary').evaluate((element) => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: info.outputPath(`systems-learning-${id}-${width}-${locale}.png`) });
        await page.reload();
        await page.locator('#title-continue').click();
        await expect(page.locator('#learning-panel .learning-progress')).toContainText('1/6');
        // Current lesson progress is reconstructed from the save's legal commands.
        await expect(page.locator('#learning-panel [data-learning-complete="true"]')).toHaveCount(1);
      });
    }

test('renders nearby title previews only, then preserves dimensions and draws every scrolled card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const cards = page.locator('.title-map-card');
  const count = await cards.count();
  await expect(cards.first().locator('.map-preview')).toBeVisible();
  expect(await page.locator('.title-map-card .map-preview').count()).toBeLessThan(count);
  const last = cards.last();
  const before = await last.boundingBox();
  await expect(last.locator('.map-preview')).toHaveCount(0);
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator('.map-preview')).toBeVisible();
  const after = await last.boundingBox();
  expect(after!.height).toBeCloseTo(before!.height, 1);
  // Leaving and returning discards stale observer callbacks.
  await last.click();
  await page.locator('#briefing-back-to-title').click();
  await expect(last).toBeFocused();
  await expect(last.locator('.map-preview')).toBeVisible();
});
