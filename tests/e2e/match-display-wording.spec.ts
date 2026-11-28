import { expect, test } from '@playwright/test';

for (const locale of ['ja', 'en'] as const) {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`localized save actions and mission objectives at ${viewport.width}/${locale}`, async ({ page }, info) => {
      const english = locale === 'en';
      const mapName = english ? 'Green Border' : '緑の国境';
      const defeat = english ? ['All your units are eliminated', 'Your headquarters is captured'] : ['自軍の部隊が全滅する', '自軍の司令部を占領される'];
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => localStorage.setItem('ministr.locale', value), locale);
      await page.goto('/');

      for (const [id, label] of [
        ['backup-import', english ? 'Choose a backup to restore' : '復元するバックアップを選ぶ'],
        ['save-recovery-import', english ? 'Choose a file to recover matches' : '対局を救出するファイルを選ぶ'],
      ]) {
        const action = page.getByRole('button', { name: label, exact: true });
        await expect(page.locator(`#${id}`)).toBeHidden();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), action.press('Enter')]);
        expect(await chooser.element().getAttribute('id')).toBe(id);
        await chooser.setFiles([]);
        await expect(action).toBeFocused();
      }
      await page.locator('.backup-actions').screenshot({ path: info.outputPath(`systems-save-actions-${viewport.width}-${locale}.png`) });

      const card = page.locator('.title-map-card[data-map-id="skirmish"]');
      await expect(card.locator('.title-map-name')).toHaveText(mapName);
      await card.click();
      await expect(page.locator('#briefing-title')).toHaveText(mapName);
      await expect(page.locator('.briefing-objectives section').last().locator('li')).toHaveText(defeat);
      const begin = page.getByRole('button', { name: english ? 'Start operation' : '作戦開始', exact: true });
      await expect(begin).toBeFocused();
      await page.locator('.briefing-objectives').screenshot({ path: info.outputPath(`systems-objectives-${viewport.width}-${locale}.png`) });
      await begin.press('Enter');
      await expect(page.locator('.battlefield-heading h2')).toHaveText(mapName);
      await expect(page.locator('.objective-group.defeat li > span')).toHaveText(defeat);
      await expect(page.getByRole('button', { name: english ? 'Choose a backup to restore' : '復元するバックアップを選ぶ', exact: true })).toHaveCount(1);
    });
  }
}
