import { expect, test } from "@playwright/test";
test("主要画面を認証済みで表示できる",async({page})=>{for(const [path,heading] of [["/records","履歴"],["/stats","分析"],["/schedule","予定"],["/settings","設定"]] as const){await page.goto(path);await expect(page.getByRole("heading",{name:heading}).first()).toBeVisible()}});
test("vaultフィクスチャの学習記録が履歴に表示される",async({page})=>{await page.goto("/records");await expect(page.getByText("2026-07-24")).toBeVisible();await expect(page.getByText("英語R ・ 60分")).toBeVisible();await expect(page.getByText("メモ: 長文2題")).toBeVisible()});
