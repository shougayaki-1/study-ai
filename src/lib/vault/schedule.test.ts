import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScheduleEvents, formatScheduleEventLine, type ScheduleEvent } from "./schedule";

export const SCHEDULE_FIXTURE_BODY = readFileSync(
  path.join(process.cwd(), "analysis/test/fixtures/schedule.md"),
  "utf8"
);

describe("parseScheduleEvents", () => {
  it("parses checkbox state and fields in the fixed key order", () => {
    expect(parseScheduleEvents(SCHEDULE_FIXTURE_BODY)).toEqual([
      { id: "ev-1", kind: "mock_exam", title: "第2回模試", due: "2026-08-01", done: false },
      { id: "ev-2", kind: "assignment", title: "英語課題", due: "2026-07-20", done: true },
    ]);
  });

  it("returns an empty array when there are no event lines", () => {
    expect(parseScheduleEvents("## 予定\n")).toEqual([]);
  });
});

describe("formatScheduleEventLine", () => {
  it("formats an undone event with the [ ] prefix", () => {
    const event: ScheduleEvent = { id: "ev-1", kind: "mock_exam", title: "第2回模試", due: "2026-08-01", done: false };
    expect(formatScheduleEventLine(event)).toBe(
      "- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01"
    );
  });

  it("formats a done event with the [x] prefix", () => {
    const event: ScheduleEvent = { id: "ev-2", kind: "assignment", title: "英語課題", due: "2026-07-20", done: true };
    expect(formatScheduleEventLine(event)).toBe(
      "- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20"
    );
  });

  it("throws when a field value contains the ' | ' delimiter", () => {
    const event: ScheduleEvent = { id: "ev-1", kind: "mock_exam", title: "第2回模試 | 会場未定", due: "2026-08-01", done: false };
    expect(() => formatScheduleEventLine(event)).toThrow();
  });

  it("throws when a field value contains a newline", () => {
    const event: ScheduleEvent = { id: "ev-1", kind: "mock_exam", title: "第2回模試\n会場未定", due: "2026-08-01", done: false };
    expect(() => formatScheduleEventLine(event)).toThrow();
  });
});
