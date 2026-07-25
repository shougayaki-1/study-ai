import { describe, expect, it } from "vitest";
import { parseConfirmTodos } from "./confirm-todos";

const BODY = [
  "## 要確認TODO",
  "- [ ] id=todo-1 | q=この写真の科目は？ | options=日本史 / 世界史 / 不明 | default=日本史 | ref=_archive/2026/07/abc.jpg",
  "- [ ] id=todo-2 | q=単元は？ | options=中世 / 近世 | default=中世",
  "",
  "本文が続く...",
].join("\n");

describe("parseConfirmTodos", () => {
  it("parses TODO lines including the optional ref field", () => {
    const todos = parseConfirmTodos(BODY);
    expect(todos).toEqual([
      {
        id: "todo-1",
        q: "この写真の科目は？",
        options: ["日本史", "世界史", "不明"],
        default: "日本史",
        ref: "_archive/2026/07/abc.jpg",
      },
      {
        id: "todo-2",
        q: "単元は？",
        options: ["中世", "近世"],
        default: "中世",
        ref: undefined,
      },
    ]);
  });

  it("returns an empty array when there are no TODO lines", () => {
    expect(parseConfirmTodos("本文だけ\n")).toEqual([]);
  });
});
