import { expect, test } from '@playwright/test';
import { airliftData } from '../../src/game/airlift.fixture';
for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`restores BGM settings and rejects invalid backup at ${width}/${locale}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      page.on('dialog', (dialog) => dialog.accept());
      const settings = { muted: true, volume: 0.41, fieldTrack: 'rock-red', armyTracks: false, blueFieldTrack: 'mist' };
      const backup = (music: object) =>
        JSON.stringify({
          schemaVersion: 1,
          entries: [
            ['ministr.locale', locale],
            ['ministr.music.settings', JSON.stringify(music)],
          ],
        });
      await page.locator('#backup-import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup(settings)) });
      await page.locator('#title-music-settings > summary').click();
      await expect(page.locator('#title-music-track')).toHaveValue('rock-red');
      await expect(page.locator('#title-music-blue-track')).toHaveValue('mist');
      await expect(page.locator('#title-music-blue-track')).toBeDisabled();
      await expect(page.locator('#title-music-volume')).toHaveValue('41');
      const before = await page.evaluate(() => localStorage.getItem('ministr.music.settings'));
      await page.locator('#backup-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(backup({ ...settings, volume: 2 })) });
      await expect(page.locator('.title-notice')).toContainText(locale === 'en' ? 'Invalid BGM settings' : 'BGM設定が不正');
      expect(await page.evaluate(() => localStorage.getItem('ministr.music.settings'))).toBe(before);
      await page.screenshot({ path: info.outputPath(`systems-bgm-restore-${width}-${locale}.png`) });
    });
    test(`boards and resumes transport helicopter at ${width}/${locale}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(
        ({ scenario, locale }) => {
          localStorage.setItem('ministr.locale', locale);
          localStorage.setItem('ministr.scenarios.custom', JSON.stringify({ schemaVersion: 1, scenarios: [scenario], history: [] }));
        },
        { scenario: airliftData(), locale },
      );
      page.on('dialog', (dialog) => dialog.accept());
      await page.goto('/');
      await page.locator('.title-map-card[data-map-id="airlift-fixture"]').click();
      await expect(page.locator('#briefing-supply-mode option[value="unlimited"]')).toBeDisabled();
      await page.locator('#begin-operation').click();
      await page.locator('.tile[data-x="0"][data-y="2"]').click();
      await expect(page.locator('.embark')).toContainText(locale === 'en' ? 'Transport helicopter' : '輸送ヘリ');
      await page.locator('.embark').click();
      await page.locator('#save').click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
      expect(saved.gameState.ruleVersion).toBe(12);
      expect(saved.gameState.units.find((u: { id: string }) => u.id === 'r1').embarkedIn).toBe('r2');
      await page.reload();
      await page.locator('#title-continue').click();
      await page.locator('.tile[data-x="1"][data-y="2"]').click();
      await expect(page.locator('#unit-brief')).toContainText(locale === 'en' ? 'Transport helicopter' : '輸送ヘリ');
      await page.screenshot({ path: info.outputPath(`systems-airlift-${width}-${locale}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    });
  }
