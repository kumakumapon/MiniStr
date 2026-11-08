import { expect, test } from '@playwright/test';

test('picks a map on the title screen, goes back from the briefing, and starts (#143)', async ({ page }) => {
  await page.goto('/');
  const title = page.locator('.title-overlay');
  await expect(title).toBeVisible();
  await expect(page.locator('.briefing-overlay')).toHaveCount(0);
  expect(await page.locator('.title-map-card').count()).toBeGreaterThanOrEqual(11);
  await expect(page.locator('#title-continue')).toBeDisabled();
  // Each card draws its miniature when brought into view (#145, v1.4.7).
  const cards = await page.locator('.title-map-card').count();
  for (let index = 0; index < cards; index++) {
    const card = page.locator('.title-map-card').nth(index);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('svg.map-preview')).toBeVisible();
  }
  await expect(page.locator('.title-map-card svg.map-preview')).toHaveCount(cards);

  const landing = page.locator('.title-map-card[data-map-id="landing"]');
  await expect(landing).toContainText('海峡上陸作戦');
  await expect(landing).toContainText('期限：40ラウンド終了');
  await landing.click();
  await expect(page.locator('#briefing-title')).toHaveText('海峡上陸作戦 / Tactical v2');

  // The briefing leads back to the map list, which now marks the last choice.
  await page.locator('#briefing-back-to-title').click();
  await expect(title).toBeVisible();
  await expect(page.locator('.title-map-card[aria-current="true"]')).toHaveAttribute('data-map-id', 'landing');

  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  await expect(page.locator('.battlefield-heading h2')).toHaveText('緑の国境 / Tactical v2');
});

test('opens the title during a match and returns to the same match (#143)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  await page.locator('.tile[data-x="0"][data-y="1"]').click();
  await page.locator('.tile[data-x="0"][data-y="2"]').click();
  await expect(page.locator('.status-message')).toContainText('移動しました');

  await page.locator('#open-title').click();
  await expect(page.locator('#title-resume')).toBeFocused();
  await page.locator('#title-resume').click();
  await expect(page.locator('.title-overlay')).toHaveCount(0);
  // The moved infantry is still where it went.
  await expect(page.locator('.tile[data-x="0"][data-y="2"] .unit.red')).toBeVisible();
});

test('returns to the title from the campaign menu and the editor (#143)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#title-campaign').click();
  await expect(page.locator('.campaign-overlay')).toBeVisible();
  await page.locator('#campaign-close').click();
  await expect(page.locator('.title-overlay')).toBeVisible();

  await page.locator('#title-editor').click();
  await expect(page.locator('.editor-overlay')).toBeVisible();
  await page.locator('#editor-close').click();
  await expect(page.locator('.title-overlay')).toBeVisible();
});

test('works from the keyboard alone (#143)', async ({ page }) => {
  await page.goto('/');
  // Focus starts on the last chosen map, the first one at start.
  await expect(page.locator('.title-map-card[data-map-id="skirmish"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.title-map-card[data-map-id="islands"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#briefing-title')).toHaveText('群島補給線 / Tactical v2');
});

test('fits a phone screen without horizontal scrolling (#143)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.title-overlay')).toBeVisible();
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    screen: document.querySelector('.title-screen')!.scrollWidth,
    screenBox: document.querySelector('.title-screen')!.clientWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  expect(widths.screen).toBeLessThanOrEqual(widths.screenBox);
  const [first, second] = await page.locator('.title-map-card').evaluateAll((cards) => cards.slice(0, 2).map((card) => card.getBoundingClientRect().left));
  // One column: the cards line up vertically.
  expect(first).toBe(second);
});

test('keeps the way back to a match through screens opened from the title (#143 review)', async ({ page }) => {
  await page.goto('/');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole('button', { name: /単体作戦を開始/ }).click();
  await page.locator('.tile[data-x="0"][data-y="1"]').click();
  await page.locator('.tile[data-x="0"][data-y="2"]').click();

  await page.locator('#open-title').click();
  await page.locator('#title-campaign').click();
  await page.locator('#campaign-close').click();
  await page.locator('#title-editor').click();
  await page.locator('#editor-close').click();
  await expect(page.locator('#title-resume')).toBeVisible();
  await page.locator('#title-resume').click();
  await expect(page.locator('.tile[data-x="0"][data-y="2"] .unit.red')).toBeVisible();
});

test('lands on the start button after going back and forth by keyboard (#143 review)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title-map-card[data-map-id="skirmish"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#begin-operation')).toBeFocused();
  await page.locator('#briefing-back-to-title').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-overlay')).toBeVisible();
  await page.locator('.title-map-card[data-map-id="islands"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#briefing-title')).toHaveText('群島補給線 / Tactical v2');
  await expect(page.locator('#begin-operation')).toBeFocused();
});

test('explains a rejected replay on the title and keeps focus on the import button (#143 review)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#title-import-replay').focus();
  await page.locator('#title-replay-file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.locator('.title-notice')).toContainText('リプレイデータが壊れています');
  await expect(page.locator('.title-overlay')).toBeVisible();
  await expect(page.locator('#title-import-replay')).toBeFocused();
});

test('tells why continue is unavailable when the stored save cannot be read (#143 review)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('ministr.save.manual', '{broken'));
  await page.reload();
  await expect(page.locator('#title-continue')).toBeDisabled();
  await expect(page.locator('.title-notice')).toContainText('有効なセーブデータを読み込めません');
});

for (const locale of ['ja', 'en'] as const) {
  for (const width of [1280, 390]) {
    test(`consistent decision and deadline from title to match: ${locale} ${width} (#273)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((value) => localStorage.setItem('ministr.locale', value), locale);
      await page.goto('/');
      const decision = locale === 'en' ? 'Decision: from the end of round 60; complete ties continue' : '判定：60ラウンド終了時から・完全同点なら続行';
      const deadline = locale === 'en' ? 'Deadline: end of round 40' : '期限：40ラウンド終了';
      for (const tactics of [true, false]) {
        await page.locator('#title-tactical-preset').setChecked(tactics);
        const card = page.locator('[data-map-id="skirmish"]');
        await expect(card).toContainText(decision);
        await card.click();
        await expect(page.locator('.briefing-timing')).toHaveText(decision);
        await page.locator('#begin-operation').click();
        await expect(page.locator('.mission-timing')).toHaveText(decision);
        await expect(page.locator('.objective-heading .turn-limit')).toContainText('60');
        const layout = await page.locator('.objective-card').evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
        expect(layout.content).toBeLessThanOrEqual(layout.width + 1);
        await page.locator('#open-title').click();
      }
      const landing = page.locator('[data-map-id="landing"]');
      await expect(landing).toContainText(deadline);
      await landing.click();
      await expect(page.locator('.briefing-timing')).toHaveText(deadline);
      await expect(page.locator('.briefing-objectives')).toContainText(locale === 'en' ? 'Deadline reached (end of round 40)' : '作戦期限（40ラウンド終了）に到達');
      await page.locator('.briefing-timing').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`timing-${locale}-${width}-briefing.png`) });
      await page.locator('#begin-operation').click();
      await expect(page.locator('.mission-timing')).toHaveText(deadline);
      await expect(page.locator('.objective-card .defeat')).toContainText(locale === 'en' ? 'Deadline reached (end of round 40)' : '作戦期限（40ラウンド終了）に到達');
      await expect(page.locator('.objective-card')).not.toContainText(locale === 'en' ? 'round 41' : '41ラウンド');
      await page.locator('.objective-card').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`timing-${locale}-${width}-match.png`) });
    });
  }
  test(`campaign grading guide and deadline remain distinct: ${locale} (#273)`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('ministr.locale', value), locale);
    await page.goto('/');
    await page.locator('#title-campaign').click();
    const timing = locale === 'en' ? 'Recommended: 22 rounds (grading guide) / Deadline: end of round 50' : '推奨：22ラウンド（評価の目安） / 期限：50ラウンド終了';
    await expect(page.locator('.campaign-timing').first()).toHaveText(timing);
    await page.locator('.campaign-start[data-campaign-id="skirmish"]').click();
    await expect(page.locator('.briefing-timing')).toHaveText(timing);
    await page.locator('#begin-operation').click();
    await expect(page.locator('.mission-timing')).toHaveText(locale === 'en' ? 'Deadline: end of round 50' : '期限：50ラウンド終了');
  });
}
