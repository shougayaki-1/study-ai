import { describe, expect, it } from "vitest";
import { stripConfirmTodoSection } from "./strip-confirm-todo-section";

describe("stripConfirmTodoSection", () => {
  it("removes the 要確認TODO section but keeps subsequent sections", () => {
    const body = [
      "## 要確認TODO",
      "- [ ] id=todo-1 | q=この写真の科目は？ | options=日本史 / 世界史 / 不明 | default=日本史 | ref=x",
      "",
      "## サマリー",
      "本文",
    ].join("\n");

    const result = stripConfirmTodoSection(body);

    expect(result).not.toContain("この写真の科目は？");
    expect(result).not.toContain("id=todo-1");
    expect(result).toContain("## サマリー");
    expect(result).toContain("本文");
  });

  it("keeps a non-h2 heading (e.g. h1 title) that follows the TODO section", () => {
    const body = [
      "## 要確認TODO",
      "- [ ] id=todo-1 | q=この写真の科目は？ | options=日本史 / 世界史 / 不明 | default=日本史 | ref=x",
      "",
      "# 2026-07-20 日次レポート",
      "",
      "## サマリー",
      "本文",
    ].join("\n");

    const result = stripConfirmTodoSection(body);

    expect(result).toContain("# 2026-07-20 日次レポート");
    expect(result).toContain("## サマリー");
    expect(result).not.toContain("この写真の科目は？");
    expect(result).not.toContain("id=todo-1");
  });

  it("returns the body unchanged when there is no 要確認TODO section", () => {
    const body = ["## サマリー", "本文"].join("\n");

    const result = stripConfirmTodoSection(body);

    expect(result.replace(/^\n+/, "")).toBe(body.replace(/^\n+/, ""));
  });
});
