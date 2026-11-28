import { expect, test } from '@playwright/test';

for (const locale of ['ja', 'en'] as const) {
  test(`starts Peninsula Neck with the mainland commander in ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: locale === 'ja' ? 390 : 1280, height: 844 });
    await page.addInitScript((language) => localStorage.setItem('ministr.locale', language), locale);
    await page.goto('/');
    const card = page.locator('[data-map-id="peninsula-neck"]');
    await expect(card).toContainText(locale === 'ja' ? '水域' : 'Water');
    await card.click();
    await expect(page.locator('#briefing-title')).toHaveText(locale === 'ja' ? '半島の付け根' : 'Peninsula Neck');
    await expect(page.locator('#briefing-copy')).toContainText(locale === 'ja' ? '輸送ヘリ' : 'transport helicopter');
    await expect(page.locator('#briefing-copy')).toContainText(locale === 'ja' ? '輸送艦' : 'landing ship');
    await page.locator('[name="human-player"][value="blue"]').check();
    await page.screenshot({ path: info.outputPath(`systems-peninsula-briefing-${locale}.png`) });
    await page.locator('#begin-operation').click();
    await expect(page.locator('#skip-cpu')).toBeVisible();
    await expect(page.locator('.board .unit.red')).toHaveCount(0);
    await page.locator('#skip-cpu').click();
    await expect(page.locator('.turn-indicator.blue')).toBeVisible();
    await expect(page.locator('#end')).toBeEnabled();
  });

  test(`keeps 1 vs 3 teams tied to starting sites after a swap and reload in ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: locale === 'ja' ? 390 : 1280, height: 844 });
    await page.addInitScript((language) => localStorage.setItem('ministr.locale', language), locale);
    await page.goto('/');
    const card = page.locator('[data-map-id="multiplayer:encirclement"]');
    await expect(card).toContainText(locale === 'ja' ? '固定1対3' : 'Fixed 1 vs 3');
    await card.click();
    await expect(page.locator('#briefing-title')).toHaveText(locale === 'ja' ? '覇権国と包囲同盟' : 'Hegemon and Encircling Alliance');
    await expect(page.locator('#four-variants input')).toHaveCount(1);
    const role = (army: number) => page.locator(`.four-start-sites .army${army} strong`);
    const hegemon = locale === 'ja' ? '覇権国' : 'Hegemon';
    const alliance = locale === 'ja' ? '包囲同盟' : 'Encircling alliance';
    await expect(role(1)).toContainText(hegemon);
    await page.locator('#four-site-marker-2').click();
    await expect(role(1)).toContainText(alliance);
    await expect(role(3)).toContainText(hegemon);
    await page.screenshot({ path: info.outputPath(`systems-encirclement-briefing-${locale}.png`) });
    await page.locator('#four-setup-summary').click();
    await expect(page.locator('#four-team-mode')).toHaveCount(0);
    await page.locator('#four-order-1').selectOption('army4');
    await page.locator('#four-order-3').selectOption('army2');
    await page.locator('#four-start').click();
    await expect(page.locator('#four-board > .tile')).toHaveCount(252);
    const archiveMetadata = () => page.evaluate(() => JSON.parse(localStorage.getItem('ministr.fourArmy.autosave') ?? 'null')?.archive.payload.map.match);
    await expect.poll(archiveMetadata).toMatchObject({
      sourceMapId: 'encirclement',
      layoutVersion: 7,
      siteArmies: ['army3', 'army2', 'army1', 'army4'],
      initialOrder: ['army1', 'army4', 'army3', 'army2'],
      teams: { army1: 'army2', army2: 'army2', army3: 'army3', army4: 'army2' },
      sharedVision: true,
    });
    await page.reload();
    await page.locator('#title-continue').click();
    await expect(page.locator('#four-board > .tile')).toHaveCount(252);
    await expect(page.locator('#four-army-info > .army1')).toContainText(alliance);
  });
}
