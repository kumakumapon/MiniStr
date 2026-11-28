import { openTitlePanel } from './helpers/titleNavigation';
import { expect, type Page } from '@playwright/test';
import { test } from './helpers/engineTest';
import { fourArmyBattleFixture } from './helpers/fourArmyBattleFixture';
import { freezeSceneClock } from './helpers/sceneClock';
import { normalResearchTestEntries } from './helpers/researchFixtures';
import { fourArmySpectatorFixture } from '../../src/game/fourArmySpectator.fixture';
import { researchReplayFixture } from '../../src/game/research.fixture';
import { forkResearch } from '../../src/game/research';
import { valueOf } from '../../src/game/operations.fixture';

test.describe.configure({ mode: 'parallel' });
async function title(page: Page, locale: 'ja' | 'en') {
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript((language) => localStorage.setItem('ministr.locale', language), locale);
  await page.goto('/');
}
async function disclosures(page: Page, selector: string) {
  await page.locator(selector).evaluate((details) => ((details as HTMLDetailsElement).open = true));
}
for (const { width, locale } of [
  { width: 390, locale: 'ja' },
  { width: 1280, locale: 'en' },
] as const) {
  test(`normal two-army play exposes the board immediately ${width}/${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await title(page, locale);
    await page.locator('.title-map-card[data-map-id="skirmish"]').click();
    await page.locator('#begin-operation').click();
    const board = page.locator('#board-viewport');
    await expect(board).toBeFocused();
    const aboveBar = await board.evaluate((element) => {
      const bar = document.querySelector('.mobile-action-bar')!.getBoundingClientRect();
      const bottom = bar.height ? bar.top : innerHeight;
      return bottom - element.getBoundingClientRect().top;
    });
    expect(aboveBar).toBeGreaterThanOrEqual(88);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('#objective-title')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`systems-start-two-army-${width}.png`) });
    await page.locator('#board-viewport .tile .unit.red').first().locator('..').click();
    await expect(page.locator('#unit-brief')).toHaveAttribute('data-unit-id', /.+/);
    await page.locator('#match-options-link').press('Enter');
    await expect(page.locator('#match-options')).toBeFocused();
    await expect(page.locator('#save')).toBeInViewport();
    await expect(page.locator('#sound-muted')).toBeVisible();
    await page.locator('#cpu-speed').selectOption('2');
    await expect(page.locator('#cpu-speed')).toHaveValue('2');

    await expect(page.locator('#classic-hud-menu')).toHaveAttribute('aria-current', 'true');
    await page.locator('#map').selectOption('islands');
    await page.locator('#begin-operation').click();
    await expect(board).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test(`multi-army default start and detailed setup ${width}/${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await title(page, locale);
    await page.locator('.title-map-card[data-map-id="skirmish"]').click();
    await page.locator('#briefing-match-variants label:has(input[value="4"])').click();

    const start = page.locator('#four-start');
    const details = page.locator('#four-setup-options');
    const summary = page.locator('#four-start-summary');
    await expect(start).toBeInViewport({ ratio: 1 });
    await expect(details).toHaveJSProperty('open', false);
    await expect(summary).toContainText(locale === 'ja' ? '第1軍を操作・CPU 3軍' : 'Play as Army 1 · 3 CPUs');
    await page.screenshot({ path: info.outputPath(`systems-start-multi-army-${width}.png`) });
    await start.press('Enter');
    await expect(page.locator('#four-board > button')).toHaveCount(252);
    await expect(page.locator('#four-view')).toHaveValue('army1');
    await expect(page.locator('#four-toggle')).toBeHidden();

    await page.locator('#four-army-screen [data-hud-menu]').click();
    await page.locator('.four-playback-options > summary').click();
    await page.locator('#four-menu').click();
    await expect(page.locator('#four-return')).toBeInViewport();
    await page.locator('#four-setup-summary').press('Enter');
    const map = page.locator('#four-map');
    await map.focus();
    await map.selectOption('outpost');
    await expect(map).toBeFocused();
    await expect(details).toHaveJSProperty('open', true);
    await page.locator('#four-variants label:has(input[value="3"])').click();
    await page.locator('#four-team-mode').check();
    await page.locator('[data-team="army2"]').selectOption('army1');
    await page.locator('#four-mode').selectOption('spectator');
    await expect(summary).toContainText(locale === 'ja' ? 'CPU 3軍で観戦 · 固定チーム · 21ラウンド判定' : 'Watch 3 CPUs · Fixed teams · 21-round decision');
    await page.locator('#four-setup-confirm').click();
    await expect(details).toHaveJSProperty('open', false);
    await expect(start).toBeFocused();
    await start.press('Enter');
    await expect(page.locator('#four-notice')).toContainText(locale === 'ja' ? '2組以上' : 'at least two teams');
    await expect(details).toHaveJSProperty('open', true);
    await page.locator('[data-team="army3"]').selectOption('army2');
    await page.locator('#four-setup-confirm').click();
    await start.press('Enter');
    await expect(page.locator('#four-view')).toHaveValue('all');
    await expect(page.locator('.four-map-heading h2')).toHaveText(locale === 'ja' ? '前哨基地強襲' : 'Outpost Assault');
    await expect(page.locator('#four-army-info > *')).toHaveCount(3);
    await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  test(`multi-army preferences, tile inspection and turn controls ${width}/${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const original = { muted: true, volume: 0.44, fieldTrack: 'dawn', armyTracks: true, blueFieldTrack: 'rock-blue' };
    await page.addInitScript((value) => localStorage.setItem('ministr.music.settings', JSON.stringify(value)), original);
    await title(page, locale);
    await openTitlePanel(page, 'settings');
    await page.locator('#title-cpu-speed').selectOption('4');
    await page.locator('#title-board-zoom').selectOption('150');
    await openTitlePanel(page, 'home');
    await page.locator('.title-map-card[data-map-id="skirmish"]').click();
    await page.locator('#briefing-match-variants label:has(input[value="4"])').click();
    await disclosures(page, '#four-music-settings');
    await expect(page.locator('#four-music-on')).not.toBeChecked();
    await expect(page.locator('#four-music-army4')).toBeDisabled();
    await page.locator('#four-music-by-army').check();
    await page.locator('#four-music-army4').selectOption('mist');
    await page.locator('#four-music-shared').selectOption('drive');
    await page.locator('#four-music-volume').evaluate((e) => {
      (e as HTMLInputElement).value = '30';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#four-setup-summary').click();
    await page.locator('#four-map').selectOption(width === 390 ? 'compact' : 'strait');
    await page.locator('#four-start').click();
    await expect(page.locator('#four-speed')).toHaveValue('4');
    await expect(page.locator('#four-zoom-label')).toHaveText('150%');
    await expect(page.locator('#four-board > button').first()).toHaveCSS('width', '66px');
    await disclosures(page, '#four-terrain-legend');
    await expect(page.locator('#four-terrain-legend')).toContainText(locale === 'ja' ? '森林' : 'Forest');
    await page.locator('#four-board .unit.army1').first().locator('..').click();
    await disclosures(page, '#four-tile-info');
    await expect(page.locator('#four-tile-rows')).toContainText(locale === 'ja' ? '移動コスト' : 'Move cost');
    await expect(page.locator('#four-tile-rows')).toContainText(locale === 'ja' ? '地形防御' : 'Terrain defense');
    if (width === 390) await page.locator('#four-mobile-panel').click();
    await page.locator('#four-tile-info').screenshot({ path: info.outputPath(`systems-v161-tile-${width}.png`), animations: 'disabled' });
    if (width === 390) await page.locator('#four-command-panel [data-hud-close]').click();
    await page.locator('[aria-controls="four-hud-menu"][data-hud-menu]').click();
    await disclosures(page, '#four-music-settings');
    await expect(page.locator('#four-music-army4')).toHaveValue('mist');
    await expect(page.locator('#four-music-volume')).toHaveValue('30');
    await page.locator('#four-music-settings').screenshot({ path: info.outputPath(`systems-v161-music-${width}.png`), animations: 'disabled' });
    if (width === 390) await page.locator('#four-command-panel [data-hud-close]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`systems-v161-controls-${width}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    if (width === 390) {
      const end = page.locator('#four-mobile-host [data-quick-action="endTurn"]');
      await expect(end).toHaveCSS('background-color', 'rgb(201, 68, 55)');
      await freezeSceneClock(page);
      await end.click();
      await expect(page.locator('#four-mobile-toggle')).toHaveClass(/mobile-action-primary/);
      await expect(end).toHaveCount(0);
      await expect(page.locator('#four-mobile-host .mobile-action-primary')).toHaveCount(1);
    }
    await page.reload();
    await page.locator('.title-map-card[data-map-id="skirmish"]').click();
    await page.locator('#briefing-match-variants label:has(input[value="4"])').click();
    await disclosures(page, '#four-music-settings');
    await expect(page.locator('#four-music-by-army')).toBeChecked();
    await expect(page.locator('#four-music-army4')).toHaveValue('mist');
    await expect(page.locator('#four-music-shared')).toHaveValue('drive');
    await expect(page.locator('#four-music-volume')).toHaveValue('30');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.music.settings')!))).toEqual(original);
  });
}

test('visible enemy danger and tile information stay scoped to the viewed army and saved CPU speed', async ({ page }, info) => {
  const fixture = fourArmyBattleFixture('army1');
  await page.setViewportSize({ width: 1280, height: 844 });
  await title(page, 'en');
  await openTitlePanel(page, 'settings');
  await page.locator('#title-cpu-speed').selectOption('0.5');
  await openTitlePanel(page, 'home');
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('#briefing-match-variants label:has(input[value="4"])').click();
  await disclosures(page, '.four-tools');
  await page.locator('#four-file').setInputFiles({ name: 'front.json', mimeType: 'application/json', buffer: Buffer.from(fixture.text) });
  await expect(page.locator('#four-notice')).toHaveText('Loaded and paused.');
  await expect(page.locator('#four-speed')).toHaveValue('4');
  await page.locator('#four-show-threats').check();
  await expect(page.locator('#four-threat-hint')).toBeVisible();
  await expect(page.locator('#four-board .enemy-attack-zone').first()).toBeAttached();
  await expect(page.locator('#four-board .tile.fog .unit')).toHaveCount(0);
  const unseen = page.locator('#four-board .tile.fog').first();
  await unseen.click();
  await disclosures(page, '#four-tile-info');
  await expect(page.locator('#four-tile-rows')).toContainText('Unseen.');
  await expect(page.locator('#four-tile-rows')).not.toContainText('Visible unit');
  await expect(page.locator('#four-tile-rows')).not.toContainText('Capture remaining');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('systems-v161-visible-threat.png'), animations: 'disabled' });
  await page.locator('#four-show-threats').uncheck();
  await expect(page.locator('#four-board .enemy-attack-zone')).toHaveCount(0);
});

test('one map card opens standard and multiplayer variants without replacing the standard briefing on back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await title(page, 'ja');
  const card = page.locator('.title-map-card[data-map-id="outpost"]');
  await expect(card).toContainText('2〜4軍');
  await card.click();
  await expect(page.locator('#briefing-match-variants input[value="standard"]')).toBeChecked();
  await page.locator('#briefing-match-variants label:has(input[value="3"])').click();
  await expect(page.locator('#briefing-title')).toContainText('前哨基地強襲');
  await expect(page.locator('#four-start-summary')).toContainText('21ラウンド判定');
  await page.locator('#four-variants label:has(input[value="standard"])').click();
  await expect(page.locator('#briefing-match-variants input:checked')).toBeFocused();
  await page.locator('#begin-operation').click();
  await expect(page.locator('#board-viewport')).toBeFocused();
  await expect(page.locator('#app .map-turn-status')).toBeVisible();
  await expect(page.locator('#mobile-end')).toBeEnabled();
  await page.locator('#open-title').click();
  await card.click();
  await page.locator('#briefing-match-variants label:has(input[value="2"])').click();
  await page.locator('#four-start').click();
  await expect(page.locator('#four-army-info > *')).toHaveCount(2);
  await expect(page.locator('#four-turn')).toContainText('/20');
  await expect(page.locator('#four-army-screen .mobile-action-primary')).toContainText('ターン終了');
  await page.locator('#four-mobile-panel').click();
  await expect(page.locator('#four-command-panel')).toBeFocused();
  await page.locator('#four-title').click();
  await expect(page.locator('#title-heading')).toBeFocused();
  await page.locator('#title-resume-multiplayer').click();
  await expect(page.locator('#four-army-info > *')).toHaveCount(2);
});

test('the common map list includes water and both large layouts with their supported army counts', async ({ page }) => {
  await title(page, 'en');
  await page.locator('.title-map-card[data-map-id="multiplayer:strait"]').click();
  await expect(page.locator('#four-start-summary')).toContainText('17 × 15');
  await expect(page.locator('#four-variants input')).toHaveCount(3);
  await page.locator('#four-close').click();
  await expect(page.locator('.title-map-card[data-map-id="multiplayer:strait"]')).toBeFocused();
  await page.locator('.title-map-card[data-map-id="multiplayer:wide"]').click();
  await expect(page.locator('#four-start-summary')).toContainText('32 × 32');
  await expect(page.locator('#four-variants input')).toHaveCount(1);
  await page.locator('#four-close').click();
  await page.locator('.title-map-card[data-map-id="multiplayer:frontier"]').click();
  await expect(page.locator('#four-variants input')).toHaveCount(3);
});

test('continue and record import route verified old saves to the right match', async ({ page }) => {
  const normal = normalResearchTestEntries();
  const study = valueOf(await forkResearch(researchReplayFixture(), 0));
  const four = JSON.stringify(fourArmySpectatorFixture(2));
  await page.addInitScript(
    ({ normal, study, four }) => {
      for (const [key, raw] of Object.entries(normal)) localStorage.setItem(key, raw);
      localStorage.setItem('ministr.research.manual', study);
      localStorage.setItem('ministr.fourArmy.save.1', four);
    },
    { normal, study: JSON.stringify(study), four },
  );
  await title(page, 'en');
  const upload = async (raw: string) => {
    await openTitlePanel(page, 'records');
    await page.locator('#title-replay-file').setInputFiles({ name: 'saved.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  };
  await openTitlePanel(page, 'records');
  await expect(page.locator('#title-panel-heading')).toBeFocused();
  await page.locator('[data-multiplayer-save="ministr.fourArmy.save.1"]').click();
  await expect(page.locator('#four-turn')).toContainText('2 commands');
  await expect(page.locator('#four-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#four-title').click();
  await upload(JSON.stringify({ format: 'ministr-four-army-match', schemaVersion: 6 }));
  await expect(page.locator('.title-notice')).not.toContainText('Verifying');
  await openTitlePanel(page, 'home');
  await expect(page.locator('#title-resume-multiplayer')).toBeVisible();
  await upload(four);
  await openTitlePanel(page, 'records');
  await expect(page.locator('#title-record-replay')).toBeEnabled();
  await page.locator('#title-record-replay').click();
  await expect(page.locator('#four-replay-count')).toBeVisible();
  await page.locator('#four-title').click();
  await upload(JSON.stringify(study));
  await expect(page.locator('.research-status')).toBeVisible();
  await page.locator('#open-title').click();
  await upload(normal['ministr.save.manual']!);
  await expect(page.locator('#board-viewport')).toBeVisible();
  await expect(page.locator('.research-status')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ministr.fourArmy.save.1'))).toBe(four);
});
