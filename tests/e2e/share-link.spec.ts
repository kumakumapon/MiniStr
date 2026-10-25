import { expect, test, type Page } from '@playwright/test';

const LINK = '/#ministr-gen1/2/20/coast/standard/Share-E2E';
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

async function useLocale(page: Page, locale: 'ja' | 'en') {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('share-test-seeded')) {
      sessionStorage.setItem('share-test-seeded', 'true');
      localStorage.setItem('ministr.locale', value);
    }
  }, locale);
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const [width, height] of [
  [1280, 800],
  [390, 844],
  [375, 667],
] as const)
  for (const locale of ['ja', 'en'] as const) {
    test(`confirms a shared link at ${width}x${height} in ${locale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await useLocale(page, locale);
      await page.goto(LINK);
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toHaveCount(1);
      await expect(page.locator('#share-link-title')).toBeVisible();
      await expect(page.locator('#share-link-cancel')).toBeFocused();
      await expect(page.locator('.title-overlay')).toHaveCount(0);
      await expect(page.locator('main')).toHaveAttribute('inert', '');
      await expect(page.locator('.share-link-facts')).toContainText('Share-E2E');
      await expect(page.locator('.share-link-facts')).toContainText('20×16');
      if (locale === 'en') {
        const text = await dialog.innerText();
        expect(text).not.toMatch(JAPANESE);
        await expect(page.locator('#share-link-confirm')).toHaveText('Generate and prepare the operation');
      } else await expect(page.locator('#share-link-confirm')).toHaveText('生成して作戦準備へ');
      await noHorizontalOverflow(page);
      // Both actions are reachable without scrolling the page sideways.
      for (const id of ['#share-link-confirm', '#share-link-cancel']) {
        await page.locator(id).scrollIntoViewIfNeeded();
        const box = (await page.locator(id).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
      await page.locator('#share-link-title').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`share-link-${width}x${height}-${locale}.png`) });
      expect(await page.evaluate(() => localStorage.getItem('ministr.scenarios.custom'))).toBeNull();
    });
  }

test('keeps Tab and Shift+Tab inside the confirmation and closes it with Escape', async ({ page }) => {
  await page.goto(LINK);
  await expect(page.locator('#share-link-cancel')).toBeFocused();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  const order: string[] = [];
  for (let at = 0; at < 4; at++) {
    await page.keyboard.press('Tab');
    expect(await inside()).toBe(true);
    order.push(await page.evaluate(() => document.activeElement?.id ?? ''));
  }
  expect(order).toEqual(['share-link-confirm', 'share-link-cancel', 'share-link-confirm', 'share-link-cancel']);
  for (let at = 0; at < 3; at++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inside()).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#share-link-title')).toHaveCount(0);
  await expect(page.locator('.title-overlay')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(await page.evaluate(() => localStorage.getItem('ministr.scenarios.custom'))).toBeNull();
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
});

test('cancel returns focus to a title control', async ({ page }) => {
  await page.goto('/');
  await page.locator('#title-generator summary').click();
  await page.locator('#title-generator-seed').focus();
  await page.evaluate(() => {
    location.hash = '#ministr-gen1/2/16/none/standard/Late-1';
  });
  await expect(page.locator('#share-link-title')).toBeVisible();
  await expect(page.locator('#share-link-cancel')).toBeFocused();
  await page.locator('#share-link-cancel').click();
  await expect(page.locator('#share-link-title')).toHaveCount(0);
  await expect(page.locator('#title-generator-seed')).toBeFocused();
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('confirming adds a custom operation, opens the briefing and clears the hash', async ({ page }) => {
  await page.goto(LINK);
  await page.locator('#share-link-confirm').click();
  await expect(page.locator('#briefing-title')).toContainText('Share-E2E');
  await expect(page.locator('#begin-operation')).toBeFocused();
  expect(await page.evaluate(() => location.hash)).toBe('');
  const ids = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('ministr.scenarios.custom')!) as { scenarios: { id: string }[] }).scenarios.map((scenario) => scenario.id),
  );
  expect(ids).toEqual(['generated-v2-20-coast-Share-E2E']);
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  // Reloading does not bring the confirmation back.
  await page.reload();
  await expect(page.locator('#share-link-title')).toHaveCount(0);
});

test('refuses an invalid link with a notice and writes nothing', async ({ page }) => {
  await page.goto('/#ministr-gen1/2/20/coast/standard/%41');
  await expect(page.locator('#share-link-title')).toHaveCount(0);
  await expect(page.locator('.title-notice')).toContainText('共有リンクのseedが正しくありません。');
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('scenarios') || key.includes('save')))).toEqual([]);
});

test('refuses an invalid link in English', async ({ page }) => {
  await useLocale(page, 'en');
  await page.goto('/#ministr-gen1/1/20/coast/standard/a');
  await expect(page.locator('.title-notice')).toHaveText('The generator version of this share link is not supported.');
});

test('opens the confirmation when the address changes on the title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title-overlay')).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#ministr-gen1/3/16/none/frontline/Live-1';
  });
  await expect(page.locator('.share-link-facts')).toContainText('Live-1');
  await expect(page.locator('.share-link-facts')).toContainText('前線補給・工兵');
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
});

test('copies a share link from the generator, with a manual fallback when copying fails', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { copied: string[] }).copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          const copied = (window as unknown as { copied: string[] }).copied;
          if (sessionStorage.getItem('deny-clipboard')) return Promise.reject(new Error('denied'));
          copied.push(text);
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto('/');
  await page.locator('#title-generator summary').click();
  await page.locator('#title-generator-size').selectOption('24');
  await page.locator('#title-generator-sea').selectOption('ocean');
  await page.locator('#title-generator-preset').selectOption('frontline');
  await page.locator('#title-generator-seed').fill('Copy-1');
  await page.locator('#title-generator-copy-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title-generator-link-status')).toHaveText('共有リンクをコピーしました。');
  await expect(page.locator('#title-generator-copy-link')).toBeFocused();
  const base = new URL(page.url());
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([`${base.origin}${base.pathname}#ministr-gen1/3/24/ocean/frontline/Copy-1`]);

  await page.evaluate(() => sessionStorage.setItem('deny-clipboard', '1'));
  await page.locator('#title-generator-copy-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title-generator-link-status')).toContainText('コピーできませんでした');
  await expect(page.locator('#title-generator-link-text')).toBeVisible();
  await expect(page.locator('#title-generator-link-text')).toHaveValue(`${base.origin}${base.pathname}#ministr-gen1/3/24/ocean/frontline/Copy-1`);
  await expect(page.locator('#title-generator-copy-link')).toBeFocused();

  await page.locator('#title-generator-seed').fill('bad seed');
  await page.locator('#title-generator-copy-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title-generator [role="alert"]')).toHaveText('共有リンクのseedが正しくありません。');
  await page.locator('#title-generator-seed').fill('D20260501');
  await page.locator('#title-generator-copy-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title-generator [role="alert"]')).toHaveText('日替わり形式のseedは共有リンクにできません。');
});
