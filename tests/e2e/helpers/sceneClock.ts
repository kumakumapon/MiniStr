import type { Page } from '@playwright/test';

/** Inspect and operate short-lived scenes without racing their automatic dismissal. */
export async function freezeSceneClock(page: Page): Promise<void> {
  const now = new Date('2026-11-19T00:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
}
