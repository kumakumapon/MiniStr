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
    // Generated CSS text does not appear in the DOM text walker.
    const engineer = document.createElement('span');
    engineer.className = 'unit-engineer';
    document.body.append(engineer);
    const badge = getComputedStyle(engineer, '::after').content;
    engineer.remove();
    if (japanese.test(badge)) found.push(`engineer badge: ${badge}`);
    return found.slice(0, 12);
  });
  expect(remaining).toEqual([]);
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
    objectives: [...document.querySelectorAll<HTMLElement>('.objective-card')].map((card) => ({ width: card.clientWidth, content: card.scrollWidth })),
  }));
  expect(layout.page, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport + 1);
  for (const card of layout.objectives) expect(card.content, JSON.stringify(card)).toBeLessThanOrEqual(card.width + 1);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`English menus, board and dialogs at ${viewport.width}`, async ({ page }, testInfo) => {
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
    await page.screenshot({ path: testInfo.outputPath(`systems-en-${viewport.width}-title.png`), fullPage: false });

    await page.locator('.title-map-card[data-map-id="bridgehead"]').click();
    await expect(page.locator('#briefing-title')).toHaveText('Establish a Bridgehead');
    await expect(page.locator('#briefing-copy')).toContainText('1000G');
    await page.locator('#briefing-deployment summary').click();
    await expect(page.locator('#briefing-preset-red-0-name')).toHaveValue('Deployment 1');
    await expectEnglish(page);
    await page.screenshot({ path: testInfo.outputPath(`systems-en-${viewport.width}-deployment.png`), fullPage: false });
    await page.locator('#briefing-back-to-title').click();
    await page.locator('#title-training').click();
    await page.locator('#begin-operation').click();
    await page.locator('.tile[data-x="0"][data-y="1"]').click();
    await expect(page.locator('#board-instructions')).toContainText('arrow keys');
    await expectEnglish(page);
    await page.screenshot({ path: testInfo.outputPath(`systems-en-${viewport.width}-battle.png`), fullPage: false });
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
  });

  test(`persists the English language round trip at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      if (!localStorage.getItem('ministr.locale')) localStorage.setItem('ministr.locale', 'en');
    });
    await page.goto('/');
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
