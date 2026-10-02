import { expect, test } from '@playwright/test';

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
        .map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width }))
        .slice(0, 20),
    }));
    expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width + 1);
    await page.locator('#open-title').click();
    await page.locator('#title-editor').click();
    await page.locator('#editor-start').click();
    await expect(page.locator('.editor-notice')).toContainText('司令部');
    await page.locator('#editor-close').click();
    await expect(page.locator('.title-overlay')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('title-verified.png'), fullPage: true });
  });
}

test('keyboard navigation and enlarged text retain primary actions', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
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
  await page.screenshot({ path: test.info().outputPath('keyboard-verified.png'), fullPage: true });
});
