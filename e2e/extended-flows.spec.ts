import { expect, test } from "@playwright/test";

test("履歴の記録を編集して削除できる", async ({ page }) => {
  const memo = `E2E履歴-${crypto.randomUUID()}`;
  await page.goto("/record");
  await page.getByLabel("コメント・メモ（任意）").fill(memo);
  await page.getByRole("button", { name: "1件をまとめて保存" }).click();
  await expect(page.getByRole("heading", { name: "今日の頑張り" })).toBeVisible();

  await page.goto("/records");
  const row = page.getByText(`メモ: ${memo}`, { exact: true }).locator("..");
  await expect(row).toBeVisible();
  await row.getByLabel("記録を編集").click();
  await page.getByLabel("学習時間（分）").fill("65");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(row.getByText("65分", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByLabel("記録を削除").click();
  await expect(page.getByText(`メモ: ${memo}`, { exact: true })).toHaveCount(0);
});

test("繰り返し時間割を作成できる", async ({ page }) => {
  const memo = `E2E時間割-${crypto.randomUUID()}`;
  // plan_blocks are only rendered for the currently selected date, and the
  // recurring plan only creates rows on the chosen weekdays starting today.
  // Pick today's weekday chip so the first generated block lands on the
  // already-selected date (today) and is visible without navigating.
  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
  const todayLabel = weekdayLabels[new Date().getDay()];

  await page.goto("/schedule");
  await page.getByRole("button", { name: "時間割" }).click();
  await page.getByRole("button", { name: "追加" }).click();
  await page.getByRole("button", { name: "毎週繰り返し" }).click();
  await page.getByText(todayLabel, { exact: true }).last().click();
  await page.getByLabel("メモ（任意）").fill(memo);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(memo, { exact: true }).first()).toBeVisible();
});

test("週の学習時間を保存できる", async ({ page }) => {
  await page.goto("/stats");
  await page.getByLabel("週合計（分）").fill("345");
  await page.getByRole("button", { name: "保存" }).first().click();
  await expect(page.getByText("週次振り返り・来週の重点")).toBeVisible();
});
