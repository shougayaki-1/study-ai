import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStudySessions, formatStudySessionLine, type StudySession } from "./study-sessions";

const REPO_ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const BODY = readFileSync(path.join(REPO_ROOT, "analysis/test/fixtures/study-record.md"), "utf8");

describe("parseStudySessions", () => {
  it("parses session lines including the common_test-only year/section", () => {
    expect(parseStudySessions(BODY)).toEqual([
      { id: "s-1", subject: "英語R", minutes: 60, kind: "material", understanding: "understood", memo: "長文2題" },
      { id: "s-2", subject: "数学IA", minutes: 90, kind: "common_test", year: 2025, section: "第3問", understanding: "uncertain", memo: "" },
    ]);
  });

  it("returns an empty array when there are no session lines", () => {
    expect(parseStudySessions("本文だけ\n")).toEqual([]);
  });

  it("skips a line missing a required key", () => {
    expect(parseStudySessions("- id=s-9 | subject=英語R | kind=material | understanding=understood | memo=")).toEqual([]);
  });
});

describe("formatStudySessionLine", () => {
  it("formats a material session without year/section", () => {
    const session: StudySession = { id: "s-1", subject: "英語R", minutes: 60, kind: "material", understanding: "understood", memo: "長文2題" };
    expect(formatStudySessionLine(session)).toBe("- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題");
  });

  it("formats a common_test session with year/section", () => {
    const session: StudySession = { id: "s-2", subject: "数学IA", minutes: 90, kind: "common_test", year: 2025, section: "第3問", understanding: "uncertain", memo: "" };
    expect(formatStudySessionLine(session)).toBe("- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo=");
  });

  it("throws when a field value contains the ' | ' delimiter", () => {
    const session: StudySession = { id: "s-1", subject: "英語R", minutes: 60, kind: "material", understanding: "understood", memo: "長文2題 | 時間切れ" };
    expect(() => formatStudySessionLine(session)).toThrow();
  });

  it("throws when a field value contains a newline", () => {
    const session: StudySession = { id: "s-1", subject: "英語R", minutes: 60, kind: "material", understanding: "understood", memo: "1行目\n2行目" };
    expect(() => formatStudySessionLine(session)).toThrow();
  });

  it("allows '=' in a field value", () => {
    const session: StudySession = { id: "s-1", subject: "英語R", minutes: 60, kind: "material", understanding: "understood", memo: "y=mx+b" };
    expect(formatStudySessionLine(session)).toContain("memo=y=mx+b");
  });
});
