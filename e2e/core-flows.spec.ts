import { expect, test } from "@playwright/test";

test("主要画面を認証済みで表示できる", async ({ page }) => {
  for (const [path, heading] of [
    ["/records", "履歴"],
    ["/stats", "分析"],
    ["/schedule", "予定"],
    ["/settings", "設定"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
});

test("vaultフィクスチャの学習記録が履歴に表示される", async ({ page }) => {
  await page.goto("/records");
  await expect(page.getByText("2026-07-24")).toBeVisible();
  await expect(page.getByText("英語R 60分")).toBeVisible();
  await expect(page.getByText("メモ: 長文2題")).toBeVisible();
});

test("締切予定を作成して編集できる", async ({ page }) => {
  const title = `E2E締切-${crypto.randomUUID()}`;
  const updatedTitle = `${title}-更新`;
  await page.goto("/schedule");
  await page.getByRole("button", { name: /追加/ }).click();
  await page.getByLabel("タイトル").fill(title);
  await page.getByRole("button", { name: "保存" }).click();
  const eventTitle = page.getByText(title, { exact: true });
  await expect(eventTitle).toBeVisible();
  await eventTitle.locator("xpath=../..").getByLabel("予定を編集").click();
  await page.getByLabel("タイトル").fill(updatedTitle);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
});
