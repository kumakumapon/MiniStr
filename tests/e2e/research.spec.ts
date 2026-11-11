import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { researchReplayFixture } from '../../src/game/research.fixture';
import { valueOf } from '../../src/game/operations.fixture';
import { createResearchSave, forkResearch, parseResearch, RESEARCH_AUTO_KEY, RESEARCH_MANUAL_KEY, researchSavedMatch } from '../../src/game/research';
import { serializeReplay } from '../../src/game/replay';
import { normalResearchTestEntries, recordableResearchReplay } from './helpers/researchFixtures';

async function seed(page: Page, locale = 'ja', extra: Record<string, string> = {}) {
  const protectedEntries = normalResearchTestEntries();
  await page.addInitScript(
    ({ entries, locale, extra }) => {
      if (!localStorage.getItem('research-test-seeded')) {
        for (const [key, raw] of Object.entries({ ...entries, ...extra })) localStorage.setItem(key, raw);
        localStorage.setItem('ministr.locale', locale);
        localStorage.setItem('research-test-seeded', 'yes');
      }
    },
    { entries: protectedEntries, locale, extra },
  );
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  return protectedEntries;
}
async function importJson(page: Page, text: string, title = false) {
  await page.locator(title ? '#title-replay-file' : '#replay-file').setInputFiles({ name: 'research-test.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}
async function seek(page: Page, index: number) {
  await page.locator('#replay-seek').evaluate((element, index) => {
    (element as HTMLInputElement).value = String(index);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, index);
}
async function protectedData(page: Page, entries: Record<string, string>) {
  const actual = await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), Object.keys(entries));
  expect(actual).toEqual(entries);
}

for (const width of [1280, 390])
  for (const locale of ['ja', 'en']) {
    test(`research branches, saves, resumes and retries at ${width}/${locale}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      const entries = await seed(page, locale);
      await importJson(page, valueOf(serializeReplay(researchReplayFixture())), true);
      await page.locator('#replay-viewpoint').selectOption('all');
      await seek(page, 3);
      await page.locator('#research-policy').selectOption('defensive');
      await page.locator('#research-fork').click();
      await expect(page.locator('.research-status')).toBeVisible();
      await expect(page.locator('.replay-toolbar')).toHaveCount(0);
      expect(await page.locator('.tile.fog').count()).toBeGreaterThan(0);
      const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), RESEARCH_AUTO_KEY);
      expect(initial.origin.branchIndex).toBe(3);
      expect(initial.match.commands).toHaveLength(3);
      expect(initial.match.gameState.turn).toBe(2);
      expect(initial.match.cpuPolicies.blue).toBe('defensive');
      expect(initial.match.schemaVersion).toBeUndefined();
      expect(initial.match.campaignScenarioId).toBeUndefined();
      await page.locator('#save').click();
      await page.locator('.tile[data-x="1"][data-y="1"]').click();
      await page.locator('.tile[data-x="1"][data-y="2"]').click();
      await expect(page.locator('#undo')).toBeEnabled();
      await page.locator('#undo').click();
      await page.locator('#save').click();
      expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).match.commands.length, RESEARCH_MANUAL_KEY)).toBe(3);
      await page.locator('.tile[data-x="1"][data-y="1"]').click();
      await page.locator('.tile[data-x="1"][data-y="2"]').click();
      await page.locator('#save').click();
      await page.screenshot({ path: info.outputPath(`systems-research-${width}-${locale}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await protectedData(page, entries);
      await page.reload();
      await page.locator(`[data-research-resume="${RESEARCH_MANUAL_KEY}"]`).click();
      await expect(page.locator('.research-status')).toBeVisible();
      await expect(page.locator('#undo')).toBeDisabled();
      await page.locator('[data-research-retry]').click();
      const retry = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), RESEARCH_AUTO_KEY);
      expect(retry.origin).toEqual(initial.origin);
      expect(retry.match.commands).toHaveLength(3);
      expect(retry.match.gameState.units[0].position).toEqual({ x: 1, y: 1 });
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-research-export]').click()]);
      const path = await download.path();
      if (!path) throw Error('Missing research download');
      const text = readFileSync(path, 'utf8');
      expect(valueOf(parseResearch(text)).origin).toEqual(initial.origin);
      await importJson(page, text);
      await expect(page.locator('.research-status')).toBeVisible();
      await protectedData(page, entries);
    });
  }

for (const kind of ['operation', 'daily', 'campaign'] as const) {
  test(`finished ${kind} research never writes normal results on import or resume`, async ({ page }) => {
    const source = recordableResearchReplay(kind);
    const branch = valueOf(await forkResearch(source, 0));
    const terminal = valueOf(createResearchSave(branch.origin, { ...researchSavedMatch(branch), commands: source.commands, gameState: source.finalState }));
    const entries = await seed(page, 'en');
    await importJson(page, JSON.stringify(terminal), true);
    await expect(page.locator('.game-over .research-status')).toBeVisible();
    await expect(page.locator('#view-replay')).toHaveCount(0);
    await expect(page.locator('#export-replay')).toHaveCount(0);
    await protectedData(page, entries);
    await page.locator('[data-research-save]').click();
    await page.reload();
    await page.locator(`[data-research-resume="${RESEARCH_MANUAL_KEY}"]`).click();
    await expect(page.locator('.game-over .research-status')).toBeVisible();
    await protectedData(page, entries);
    await page.locator('#restart').click();
    await expect(page.locator('.game-over')).toHaveCount(0);
    await expect(page.locator('.research-status')).toBeVisible();
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).origin.branchIndex, RESEARCH_AUTO_KEY)).toBe(0);
    await protectedData(page, entries);
  });
}

test('returning to an ordinary save clears the research classification explicitly', async ({ page }) => {
  const entries = await seed(page);
  await importJson(page, valueOf(serializeReplay(researchReplayFixture())), true);
  await page.locator('#research-fork').click();
  await page.locator('#save').click();
  const study = await page.evaluate((key) => localStorage.getItem(key), RESEARCH_MANUAL_KEY);
  await page.locator('#continue').click();
  await expect(page.locator('.research-status')).toHaveCount(0);
  await page.locator('.tile[data-x="0"][data-y="1"]').click();
  await page.locator('.tile[data-x="0"][data-y="2"]').click();
  await page.locator('#save').click();
  const normal = await page.evaluate(() => JSON.parse(localStorage.getItem('ministr.save.manual')!));
  expect(normal.schemaVersion).toBe(4);
  expect(normal.commands).toHaveLength(1);
  expect(normal.format).toBeUndefined();
  expect(await page.evaluate((key) => localStorage.getItem(key), RESEARCH_MANUAL_KEY)).toBe(study);
  expect(entries['ministr.save.manual']).not.toBe(JSON.stringify(normal));
});

test('unknown or corrupt research preserves the original slots and can be exported before deletion', async ({ page }) => {
  const raw = '{"format":"ministr-research","schemaVersion":99}';
  const entries = await seed(page, 'ja', { [RESEARCH_AUTO_KEY]: raw });
  await importJson(page, valueOf(serializeReplay(researchReplayFixture())), true);
  await page.locator('#research-fork').click();
  await expect(page.locator('.research-status')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), RESEARCH_AUTO_KEY)).toBe(raw);
  await page.locator('#save').click();
  await importJson(page, raw);
  await expect(page.locator('.research-status')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-research-raw="${RESEARCH_AUTO_KEY}"]`).click()]);
  const path = await download.path();
  if (!path) throw Error('Missing raw export');
  expect(readFileSync(path, 'utf8')).toBe(raw);
  await page.locator(`[data-research-delete="${RESEARCH_AUTO_KEY}"]`).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), RESEARCH_AUTO_KEY)).toBeNull();
  await protectedData(page, entries);
});

test('a changed replay cursor cancels an asynchronous fork without replacing the match', async ({ page }) => {
  await page.addInitScript(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = (...args) => new Promise<void>((resolve) => setTimeout(resolve, 300)).then(() => original(...args));
  });
  const entries = await seed(page);
  await importJson(page, valueOf(serializeReplay(researchReplayFixture())), true);
  await seek(page, 3);
  await page.locator('#research-fork').click();
  await seek(page, 1);
  await expect(page.locator('.research-status')).toHaveCount(0);
  await page.waitForTimeout(400);
  await seek(page, 3);
  await expect(page.locator('#research-fork')).toBeEnabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), RESEARCH_AUTO_KEY)).toBeNull();
  await protectedData(page, entries);
});
