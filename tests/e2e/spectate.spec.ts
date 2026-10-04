import { expect, test } from "@playwright/test";

test("spectates a CPU-versus-CPU match with pause and resume (#129)", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await expect(page.locator(".briefing-overlay")).toContainText(
    "赤軍の勝利条件",
  );
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();

  // Red's CPU starts on its own; the viewer cannot issue commands.
  await expect(page.locator(".turn-indicator strong")).toHaveText(
    "赤軍 CPU 行動中",
  );
  await expect(page.locator("#end")).toBeDisabled();
  // Saving waits for a pause (#135): pressing save while a CPU plays asks nothing and writes nothing.
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.locator("#save").click();
  expect(dialogs).toEqual([]);
  expect(
    await page.evaluate(() => [
      localStorage.getItem("ministr.save.manual"),
      localStorage.getItem("ministr.save.slots"),
    ]),
  ).toEqual([null, null]);

  // Turns alternate without any input until blue's CPU is playing.
  await expect(page.locator(".turn-indicator strong")).toHaveText(
    "青軍 CPU 行動中",
    { timeout: 20_000 },
  );

  // Pausing stops the loop and hands the menus back.
  await page.locator("#spectate-toggle").click();
  await expect(page.locator("#spectate-toggle")).toHaveText("観戦を再開");
  await expect(page.locator(".status-message")).toContainText(
    "観戦を一時停止しました",
  );
  await expect(page.locator("#skip-cpu")).toHaveCount(0);
  await expect(page.locator("#map")).toBeEnabled();
  const pausedTurn = await page.locator(".turn-indicator strong").textContent();
  await page.waitForTimeout(1_500);
  await expect(page.locator(".turn-indicator strong")).toHaveText(
    pausedTurn ?? "",
  );
  await expect(page.locator("#end")).toBeDisabled();

  // Resuming continues from the same board and returns to red afterwards.
  await page.locator("#spectate-toggle").click();
  await expect(page.locator("#spectate-toggle")).toHaveText("観戦を一時停止");
  await expect(page.locator(".turn-indicator strong")).toHaveText(
    "赤軍 CPU 行動中",
    { timeout: 20_000 },
  );
});

test("spectating never autosaves over the player’s saves and keeps alternating after a skip (#129)", async ({
  page,
}) => {
  const saveKeys = ["ministr.save.auto", "ministr.save.manual"];
  await page.goto("/");
  await page.evaluate(
    (keys) =>
      keys.forEach((key) => localStorage.setItem(key, `sentinel:${key}`)),
    saveKeys,
  );
  await page.reload();
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();

  // Skipping finishes red's turn at once; blue then plays on its own and hands back to red.
  await page.locator("#skip-cpu").click();
  await expect(page.locator(".turn-indicator strong")).toHaveText(
    "青軍 CPU 行動中",
    { timeout: 20_000 },
  );
  await expect(page.locator(".turn-indicator strong")).toHaveText(
    "赤軍 CPU 行動中",
    { timeout: 20_000 },
  );

  const stored = await page.evaluate(
    (keys) => keys.map((key) => localStorage.getItem(key)),
    saveKeys,
  );
  expect(stored).toEqual(saveKeys.map((key) => `sentinel:${key}`));
});

test("sets each side’s CPU difficulty for spectating (#131)", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await expect(page.locator("#briefing-red-difficulty")).toHaveCount(0);
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  // A keyboard user changes a focused control; it keeps focus instead of jumping to the start button.
  await page.locator("#briefing-red-difficulty").focus();
  await page.locator("#briefing-red-difficulty").selectOption("easy");
  await expect(page.locator("#briefing-red-difficulty")).toBeFocused();
  await page.locator("#briefing-blue-difficulty").selectOption("hard");
  await expect(page.locator(".briefing-meta")).toContainText(
    "観戦・赤軍易しい / 青軍難しい",
  );
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();

  // The header shows both sides; changes are refused while a CPU turn runs.
  await expect(page.locator("#red-difficulty")).toHaveValue("easy");
  await expect(page.locator("#difficulty")).toHaveValue("hard");
  await expect(page.locator("#skip-cpu")).toBeVisible();
  await page.locator("#red-difficulty").selectOption("hard");
  await expect(page.locator("#red-difficulty")).toHaveValue("easy");

  // Red can be changed while paused.
  await page.locator("#spectate-toggle").click();
  await expect(page.locator("#spectate-toggle")).toHaveText("観戦を再開");
  await page.locator("#red-difficulty").selectOption("normal");
  await expect(page.locator("#red-difficulty")).toHaveValue("normal");
  await expect(page.locator("#difficulty")).toHaveValue("hard");
});

test("shows the whole board without fog while spectating, and only then (#133)", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();

  // The acting side's fog is the default view.
  const toggle = page.locator("#spectate-whole-board");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".tile.fog").first()).toBeVisible();

  // Switching works while the CPUs keep playing and removes every fogged tile.
  await expect(page.locator("#skip-cpu")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".tile.fog")).toHaveCount(0);
  await expect(page.locator(".map-legend")).not.toContainText("未索敵");
  await expect(page.locator(".unit.red").first()).toBeVisible();
  await expect(page.locator(".unit.blue").first()).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".tile.fog").first()).toBeVisible();

  // A CPU match never offers it, even with the setting left on from spectating.
  await page.locator("#spectate-whole-board").click();
  await page.locator("#spectate-toggle").click();
  await expect(page.locator("#map")).toBeEnabled();
  await page.locator("#map").selectOption({ index: 0 });
  await page.locator('input[name="match-mode"][value="cpu"]').check();
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();
  await expect(page.locator("#spectate-whole-board")).toHaveCount(0);
  await expect(page.locator(".tile.fog").first()).toBeVisible();
});

test("saves a paused spectated match to a slot and resumes it paused with both difficulties (#135, #139)", async ({
  page,
}) => {
  const saveKeys = ["ministr.save.auto", "ministr.save.manual"];
  await page.goto("/");
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  // The player's own saves must survive spectating (#139).
  await page.evaluate(
    (keys) =>
      keys.forEach((key) => localStorage.setItem(key, `sentinel:${key}`)),
    saveKeys,
  );
  await page.reload();
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  page.on("dialog", (dialog) => dialog.accept("観戦テスト"));
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.locator("#briefing-red-difficulty").selectOption("easy");
  await page.locator("#briefing-blue-difficulty").selectOption("hard");
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();

  // Blue's first turn is reached, then the viewer pauses and saves to a named slot.
  await expect(page.locator(".turn-indicator strong")).toHaveText(
    "青軍 CPU 行動中",
    { timeout: 20_000 },
  );
  await page.locator("#spectate-toggle").click();
  await expect(page.locator("#spectate-toggle")).toHaveText("観戦を再開");
  await expect(page.locator("#save")).toHaveText("スロットにセーブ");
  await page.locator("#save").click();
  await expect(page.locator(".status-message")).toContainText(
    "「観戦テスト」にセーブしました",
  );
  const stored = await page.evaluate(
    (keys) => keys.map((key) => localStorage.getItem(key)),
    saveKeys,
  );
  expect(stored).toEqual(saveKeys.map((key) => `sentinel:${key}`));

  // A fresh page resumes the spectated match paused, with both difficulties restored.
  await page.reload();
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();
  const slot = page.locator(".save-slot-manager li", { hasText: "観戦テスト" });
  await expect(slot).toContainText("/ 観戦");
  await slot.locator(".load-save-slot").click();
  await expect(page.locator(".status-message")).toContainText(
    "一時停止した状態で読み込みました",
  );
  await expect(page.locator("#spectate-toggle")).toHaveText("観戦を再開");
  await expect(page.locator("#red-difficulty")).toHaveValue("easy");
  await expect(page.locator("#difficulty")).toHaveValue("hard");
  await expect(page.locator("#skip-cpu")).toHaveCount(0);

  await page.locator("#spectate-toggle").click();
  await expect(page.locator("#spectate-toggle")).toHaveText("観戦を一時停止");
  await expect(page.locator(".turn-indicator strong")).toContainText(
    "CPU 行動中",
  );
});

test("cannot delete the player’s match saves while spectating, but can delete slots (#141)", async ({
  page,
}) => {
  const saveKeys = ["ministr.save.auto", "ministr.save.manual"];
  await page.goto("/");
  await page.evaluate(
    (keys) =>
      keys.forEach((key) => localStorage.setItem(key, `sentinel:${key}`)),
    saveKeys,
  );
  await page.reload();
  await page.locator('.title-map-card[data-map-id="skirmish"]').click();
  // Outside spectating the button is usable for these (invalid) stored saves.
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();
  await expect(page.locator("#delete-save")).toBeEnabled();
  await expect(page.locator('.scenario-warning[role="status"]')).toContainText(
    "対局セーブ削除で削除して新規対局を開始できます",
  );

  await page.locator("#map").selectOption({ index: 0 });
  page.on("dialog", (dialog) => dialog.accept("削除テスト"));
  await page.locator('input[name="match-mode"][value="spectate"]').check();
  await page.getByRole("button", { name: /単体作戦を開始/ }).click();
  await page.locator("#spectate-toggle").click();
  await expect(page.locator("#spectate-toggle")).toHaveText("観戦を再開");

  // Paused, menus work, yet match-save deletion stays off and explains why.
  await expect(page.locator("#delete-save")).toBeDisabled();
  await expect(page.locator("#delete-save")).toHaveAttribute(
    "title",
    "観戦中は対局セーブを削除できません",
  );
  await expect(page.locator('.scenario-warning[role="status"]')).toContainText(
    "CPU対戦か2人対戦を選んでから",
  );
  // The handler refuses too: re-enable the button in the page and click it.
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>("#delete-save")!;
    button.disabled = false;
    button.click();
  });
  const stored = await page.evaluate(
    (keys) => keys.map((key) => localStorage.getItem(key)),
    saveKeys,
  );
  expect(stored).toEqual(saveKeys.map((key) => `sentinel:${key}`));

  // Named slots can still be tidied up one by one.
  await page.locator("#save").click();
  const slot = page.locator(".save-slot-manager li", { hasText: "削除テスト" });
  await expect(slot).toBeVisible();
  await slot.locator(".delete-save-slot").click();
  await expect(page.locator(".status-message")).toContainText(
    "セーブスロットを削除しました",
  );
  await expect(slot).toHaveCount(0);
});
