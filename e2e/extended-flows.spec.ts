import { expect, test } from "@playwright/test";

test("繰り返し時間割を作成できる", async ({ page }) => {
  const memo = `E2E時間割-${crypto.randomUUID()}`;
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
