// Imports the game and CPU modules on the Node side to build a real finished
// replay. They must stay free of Vite-only features (import.meta.env, asset imports).
import { expect, test, type Page } from '@playwright/test';
import { chooseCpuAction, type CpuDifficulty } from '../../src/ai';
import { applyGameCommand, createReplay, createScenarioInitialState, scenarioById, serializeReplay, type GameCommand } from '../../src/game';

/** Plays a built-in map CPU against CPU to the end, as a finished spectated match would. */
function spectatedReplayJson(red: CpuDifficulty | undefined, blue: CpuDifficulty): string {
  const map = scenarioById('industrial');
  if (!map) throw new Error('industrial map is missing');
  const initialState = createScenarioInitialState(map);
  let state = initialState;
  const commands: GameCommand[] = [];
  for (let step = 0; step < 20_000 && !state.winner; step += 1) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? (red ?? blue) : blue);
    const result = applyGameCommand(state, command);
    if (!result.ok) throw new Error(result.error);
    state = result.value;
    commands.push(command);
  }
  const replay = createReplay({
    mapId: map.id,
    difficulty: blue,
    ...(red ? { redDifficulty: red } : {}),
    initialState,
    commands,
  });
  if (!replay.ok) throw new Error(replay.error);
  const serialized = serializeReplay(replay.value);
  if (!serialized.ok) throw new Error(serialized.error);
  return serialized.value;
}

async function importReplay(page: Page, json: string): Promise<void> {
  await page.goto('/');
  // Imported from the title screen (#143).
  await page.locator('#title-replay-file').setInputFiles({
    name: 'replay.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  await expect(page.locator('.replay-toolbar')).toBeVisible();
}

test('shows both recorded CPU difficulties when replaying a spectated match (#137)', async ({ page }) => {
  await importReplay(page, spectatedReplayJson('easy', 'hard'));
  await expect(page.locator('#red-difficulty')).toHaveValue('easy');
  await expect(page.locator('#red-difficulty')).toBeDisabled();
  await expect(page.locator('#difficulty')).toHaveValue('hard');
  await expect(page.locator('#difficulty')).toBeDisabled();
  await expect(page.locator('.command-bar')).toContainText('赤軍CPU');
  await expect(page.locator('.command-bar')).toContainText('青軍CPU');
});

test('keeps the single difficulty for replays without a red difficulty (#137)', async ({ page }) => {
  await importReplay(page, spectatedReplayJson(undefined, 'normal'));
  await expect(page.locator('#red-difficulty')).toHaveCount(0);
  await expect(page.locator('#difficulty')).toHaveValue('normal');
  await expect(page.locator('.command-bar')).not.toContainText('赤軍CPU');
});

test('returns to the title after a replay imported there ends (#143)', async ({ page }) => {
  await importReplay(page, spectatedReplayJson('easy', 'hard'));
  await page.locator('#replay-exit').click();
  await expect(page.locator('.title-overlay')).toBeVisible();
});
