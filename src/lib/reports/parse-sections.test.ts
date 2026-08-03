import { describe, expect, it } from "vitest";
import { parseReportSections } from "./parse-sections";

describe("parseReportSections", () => {
  it("##見出しごとにセクションへ分割する", () => {
    const body = [
      "# 2026-08-01 日次レポート",
      "",
      "## 今日の学習",
      "",
      "合計117分。",
      "",
      "## 次に取り組むこと",
      "",
      "英語の誤答を復習する。",
    ].join("\n");
    expect(parseReportSections(body)).toEqual([
      { heading: "今日の学習", body: "合計117分。" },
      {
        heading: "次に取り組むこと",
        body: "英語の誤答を復習する。",
      },
    ]);
  });

  it("##見出しが無ければ空配列を返す", () => {
    expect(parseReportSections("# タイトルのみ\n\n本文だけ")).toEqual([]);
  });

  it("セクション内の### など下位見出しは分割しない", () => {
    const body = ["## 見出し", "", "### 小見出し", "", "本文"].join(
      "\n",
    );
    expect(parseReportSections(body)).toEqual([
      { heading: "見出し", body: "### 小見出し\n\n本文" },
    ]);
  });
});
