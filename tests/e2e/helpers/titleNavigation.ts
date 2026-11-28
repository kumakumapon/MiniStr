import type { Page } from '@playwright/test';

/** Follow the same home and panel buttons a player uses. Shared save controls also exist during a match. */
export async function openTitlePanel(page: Page, panel: 'home' | 'settings' | 'records', sharedWithMatch = false): Promise<void> {
  const screen = page.locator('.title-screen:visible');
  if (sharedWithMatch && !(await screen.count())) return;
  const current = await screen.getAttribute('data-title-panel');
  if (current === panel) return;
  if (current !== 'home') await page.locator('#title-home-back').click();
  if (panel !== 'home') await page.locator(`#title-open-${panel}`).click();
}
