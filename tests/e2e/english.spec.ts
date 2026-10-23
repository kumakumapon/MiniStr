import { expect, test, type Page } from '@playwright/test';

async function expectEnglish(page: Page) {
  const remaining = await page.evaluate(() => {
    const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    const found: string[] = [];
    const walker = document.createTreeWalker(document.querySelector('#app')!, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('textarea,script,style,[data-user-content],.title-map-name,.briefing-copy,.save-slot-manager strong')) continue;
      if (japanese.test(node.textContent ?? '')) found.push(node.textContent!.trim());
    }
    for (const element of document.querySelectorAll<HTMLElement>('[aria-label],[title],[alt],[placeholder],[label]')) {
      if (element.closest('[data-user-content]')) continue;
      for (const attribute of ['aria-label', 'title', 'alt', 'placeholder', 'label']) {
        if (element.dataset.userAttributes?.split(' ').includes(attribute)) continue;
        const value = element.getAttribute(attribute);
        if (value && japanese.test(value)) found.push(`${attribute}: ${value}`);
      }
    }
    return found.slice(0, 12);
  });
  expect(remaining).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`English menus, board, dialogs and language round trip at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('ministr.locale', 'en'));
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.accept();
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.title-map-card[data-map-id="skirmish"] .title-map-name')).toHaveText('Green Border');
    await expectEnglish(page);
    await page.screenshot({ path: testInfo.outputPath(`systems-en-${viewport.width}-title.png`), fullPage: true });

    await page.locator('.title-map-card[data-map-id="bridgehead"]').click();
    await expect(page.locator('#briefing-title')).toHaveText('Establish a Bridgehead');
    await expect(page.locator('#briefing-copy')).toContainText('1000G');
    await page.locator('#briefing-deployment summary').click();
    await expect(page.locator('#briefing-preset-red-0-name')).toHaveValue('Deployment 1');
    await expectEnglish(page);
    await page.screenshot({ path: testInfo.outputPath(`systems-en-${viewport.width}-deployment.png`), fullPage: true });
    await page.locator('#briefing-back-to-title').click();
    await page.locator('#title-training').click();
    await page.locator('#begin-operation').click();
    await page.locator('.tile[data-x="0"][data-y="1"]').click();
    await expect(page.locator('#board-instructions')).toContainText('arrow keys');
    await expectEnglish(page);
    await page.screenshot({ path: testInfo.outputPath(`systems-en-${viewport.width}-battle.png`), fullPage: true });
    await page.locator('#open-production').click();
    await expectEnglish(page);
    await page.locator('#production-menu-close').click();
    await page.locator('#save').click();
    await page.locator('#delete-save').click();
    expect(dialogs.length).toBeGreaterThan(0);
    for (const message of dialogs) expect(message).not.toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);

    await page.locator('#open-title').click();
    await page.locator('#title-campaign').click();
    await expectEnglish(page);
    await page.locator('#campaign-close').click();
    await page.locator('#title-editor').click();
    await expectEnglish(page);
    await page.locator('#editor-close').click();
    await page.locator('.title-menu [data-locale]').selectOption('ja');
    await expect(page.locator('#title-training')).toHaveText('基本操作を練習');
    await page.locator('.title-menu [data-locale]').selectOption('en');
    await expect(page.locator('#title-training')).toHaveText('Practice the basics');
    await expectEnglish(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectEnglish(page);
  });
}
