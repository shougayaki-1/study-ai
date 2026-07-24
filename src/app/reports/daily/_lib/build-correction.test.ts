import { describe, expect, it } from "vitest";
import type { ConfirmTodo } from "@/lib/vault";
import { buildCorrectionEntry } from "./build-correction";

describe("buildCorrectionEntry", () => {
  it("builds a CorrectionEntry from a chosen todo option", () => {
    const todo: ConfirmTodo = {
      id: "todo-1",
      q: "この写真の科目は？",
      options: ["日本史", "世界史", "不明"],
      default: "日本史",
      ref: "_archive/2026/07/abc.jpg",
    };
    const entry = buildCorrectionEntry({
      reportPath: "reports/daily/2026-07-20.md",
      todo,
      choice: "世界史",
      now: new Date("2026-07-23T23:12:00.000Z"),
    });
    expect(entry).toEqual({
      timestamp: "2026-07-24T08:12:00+09:00",
      report: "reports/daily/2026-07-20.md",
      todo: "todo-1",
      choice: "世界史",
    });
  });

  it("includes an optional note when provided", () => {
    const todo: ConfirmTodo = { id: "todo-2", q: "q", options: ["a", "b"], default: "a" };
    const entry = buildCorrectionEntry({
      reportPath: "reports/daily/2026-07-20.md",
      todo,
      choice: "b",
      note: "手書きメモ",
      now: new Date("2026-07-23T23:12:00.000Z"),
    });
    expect(entry.note).toBe("手書きメモ");
  });
});
