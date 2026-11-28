import { expect } from '@playwright/test';
import { test } from './helpers/engineTest';

test.describe.configure({ mode: 'parallel' });

for (const width of [390, 1280]) {
  for (const locale of ['ja', 'en'] as const) {
    test(`keeps the map, setup and start action accessible at ${width}/${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.addInitScript((language) => localStorage.setItem('ministr.locale', language), locale);
      await page.goto('/');
      await page.locator('.title-map-card[data-map-id="canyon"]').click();

      const dialog = page.getByRole('dialog');
      const content = dialog.locator('.briefing-content');
      const zoom = dialog.locator('[data-briefing-zoom]');
      const heading = dialog.locator('#briefing-title');
      const classicStart = dialog.locator('#begin-operation');
      const classicSettings = dialog.locator('#briefing-advanced');
      const classicName = await heading.innerText();
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport({ ratio: 1 });
      await expect(content).toHaveJSProperty('scrollTop', 0);
      await expect(classicSettings).toHaveJSProperty('open', false);
      await expect(classicStart).toBeInViewport({ ratio: 1 });
      await expect(dialog.locator('.map-preview')).toBeInViewport();

      const preview = dialog.locator('.map-preview');
      const originalWidth = await preview.evaluate((el) => el.getBoundingClientRect().width);
      await zoom.click();
      await expect(zoom).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => preview.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(originalWidth);
      await zoom.click();
      await expect(zoom).toHaveAttribute('aria-pressed', 'false');

      await classicSettings.locator('> summary').click();
      await expect(dialog.locator('#briefing-supply-mode')).toBeVisible();
      await dialog.locator('#briefing-supply-mode').scrollIntoViewIfNeeded();
      await expect(classicStart).toBeInViewport({ ratio: 1 });
      await classicSettings.locator('> summary').click();

      await dialog.locator('#briefing-match-variants label:has(input[value="3"])').click();
      await expect(dialog).toHaveCount(1);
      await expect(heading).toContainText(classicName.split(' / ')[0]!);
      await expect(dialog.locator('#four-variants input[value="3"]')).toBeChecked();
      const marker = dialog.locator('#four-site-marker-2');
      await marker.click();
      await expect(marker).toHaveAttribute('aria-pressed', 'true');
      await expect(dialog.locator('#four-site-army1')).toHaveValue('2');
      await expect(dialog.locator('#four-site-army3')).toHaveValue('0');
      const multiSettings = dialog.locator('#four-setup-options');
      await expect(multiSettings).toHaveJSProperty('open', false);
      await multiSettings.locator('> summary').click();
      await expect(dialog.locator('#four-order-0')).toHaveValue('army1');
      await dialog.locator('#four-seed').fill('342');
      await expect(dialog.locator('#four-start')).toBeInViewport({ ratio: 1 });
      await dialog.locator('#four-setup-confirm').click();
      await expect(dialog.locator('#four-start')).toBeFocused();
      await dialog.locator('#four-variants label:has(input[value="4"])').click();
      await expect(dialog.locator('[id^="four-site-marker-"]')).toHaveCount(4);
      await dialog.locator('#four-variants label:has(input[value="standard"])').click();
      await expect(dialog.locator('#briefing-match-variants input[value="standard"]')).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await classicStart.click();
      await expect(page.locator('#board-viewport')).toBeFocused();
    });
  }
}
