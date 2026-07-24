import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const vaultDir = path.join(process.cwd(), "e2e", "fixtures", "vault");
const correctionsPath = path.join(vaultDir, "_inbox", "corrections.md");

test.beforeEach(async () => {
  await writeFile(correctionsPath, "", "utf-8");
});

test("要確認TODOをタップ選択するとcorrections.mdに追記される", async ({ page }) => {
  await page.goto("/reports/daily/2026-07-20");
  await expect(page.getByText("この写真の科目は？")).toBeVisible();

  await page.getByRole("button", { name: "世界史", exact: true }).click();
  await expect(page.getByText("「世界史」で訂正を送信しました")).toBeVisible();

  const corrections = await readFile(correctionsPath, "utf-8");
  expect(corrections).toContain("report: reports/daily/2026-07-20.md");
  expect(corrections).toContain("todo: todo-1");
  expect(corrections).toContain("choice: 世界史");
});

test("弱点カルテ一覧から科目を開いて閲覧できる", async ({ page }) => {
  await page.goto("/karte");
  await page.getByRole("link", { name: "日本史" }).click();
  await expect(page.getByRole("heading", { name: "日本史 弱点カルテ" })).toBeVisible();
});

test("ナビゲーションからレポート・カルテを開ける", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "レポート" }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await page.goto("/");
  await page.getByRole("button", { name: "カルテ" }).click();
  await expect(page).toHaveURL(/\/karte$/);
});
