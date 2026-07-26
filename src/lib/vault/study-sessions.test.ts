import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listStudyRecordDates, listStudyRecordDatesFromSupabase, parseStudySessions, formatStudySessionLine, readStudyRecord, type StudySession } from "./study-sessions";

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

describe("readStudyRecord / listStudyRecordDates", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;
  beforeEach(async () => { vaultDir = await mkdtemp(path.join(tmpdir(), "vault-study-sessions-")); process.env.STUDY_AI_VAULT_DIR = vaultDir; });
  afterEach(async () => { await rm(vaultDir, { recursive: true, force: true }); if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR; else process.env.STUDY_AI_VAULT_DIR = originalEnv; });
  it("reads sessions for a date that has a record file", async () => {
    const dir = path.join(vaultDir, "records"); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-07-25.md"), "---\ntype: study-record\ndate: 2026-07-25\nsource: dialogue\nschema_version: 1\nupdated: 2026-07-25T22:10:00+09:00\n---\n\n## セッション\n- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題\n", "utf8");
    const day = await readStudyRecord("2026-07-25"); expect(day.date).toBe("2026-07-25"); expect(day.sessions).toHaveLength(1); expect(day.sessions[0].subject).toBe("英語R");
  });
  it("returns an empty sessions array when the date has no file", async () => { expect(await readStudyRecord("2026-01-01")).toEqual({ date: "2026-01-01", sessions: [] }); });
  it("lists record dates in descending order", async () => {
    const dir = path.join(vaultDir, "records"); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-07-20.md"), "", "utf8"); await writeFile(path.join(dir, "2026-07-25.md"), "", "utf8");
    expect(await listStudyRecordDates()).toEqual(["2026-07-25", "2026-07-20"]);
  });
  it("returns an empty array when the records directory does not exist", async () => { expect(await listStudyRecordDates()).toEqual([]); });
  it("ignores files whose name does not match YYYY-MM-DD.md (e.g. Google Drive conflict copies)", async () => {
    const dir = path.join(vaultDir, "records"); await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-07-25.md"), "", "utf8"); await writeFile(path.join(dir, "2026-07-25 (1).md"), "", "utf8"); await writeFile(path.join(dir, "notes.txt"), "", "utf8");
    expect(await listStudyRecordDates()).toEqual(["2026-07-25"]);
  });
});

describe("TS/Node parity", () => {
  it("parses the shared study-record fixture identically in both implementations", async () => {
    const nodeModulePath = path.join(REPO_ROOT, "analysis/helpers/vault/study-sessions.mjs");
    const nodeModule = await import(pathToFileURL(nodeModulePath).href);
    expect(JSON.stringify(nodeModule.parseStudySessions(BODY))).toBe(JSON.stringify(parseStudySessions(BODY)));
  });
});

describe("listStudyRecordDatesFromSupabase", () => {
  it("filters to records/YYYY-MM-DD.md and sorts dates descending", async () => {
    const client = {
      selectByPath: async () => null,
      selectByPrefix: async (prefix: string) => {
        expect(prefix).toBe("records/");
        return [
          { path: "records/2026-07-20.md", content: "" },
          { path: "records/2026-07-25.md", content: "" },
          { path: "records/not-a-date.md", content: "" },
        ];
      },
    };
    expect(await listStudyRecordDatesFromSupabase(client)).toEqual(["2026-07-25", "2026-07-20"]);
  });
});
