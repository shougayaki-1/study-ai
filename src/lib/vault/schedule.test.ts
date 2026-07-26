import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseScheduleEvents, formatScheduleEventLine, readSchedule, setScheduleEventDone, type ScheduleEvent } from "./schedule";
import { writeVaultFileAtomic } from "./write";

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

describe("readSchedule / setScheduleEventDone", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-schedule-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  const SCHEDULE_RAW = [
    "---",
    "type: schedule",
    "schema_version: 1",
    "updated: 2026-07-25T22:10:00+09:00",
    "---",
    "",
    SCHEDULE_FIXTURE_BODY,
  ].join("\n");

  it("readSchedule returns [] when schedule.md does not exist", async () => {
    expect(await readSchedule()).toEqual([]);
  });

  it("readSchedule parses the existing schedule.md", async () => {
    await writeFile(path.join(vaultDir, "schedule.md"), SCHEDULE_RAW, "utf8");
    expect(await readSchedule()).toEqual([
      { id: "ev-1", kind: "mock_exam", title: "第2回模試", due: "2026-08-01", done: false },
      { id: "ev-2", kind: "assignment", title: "英語課題", due: "2026-07-20", done: true },
    ]);
  });

  it("setScheduleEventDone flips only the target line's checkbox", async () => {
    await writeFile(path.join(vaultDir, "schedule.md"), SCHEDULE_RAW, "utf8");

    await setScheduleEventDone("ev-1", true);

    const raw = await readFile(path.join(vaultDir, "schedule.md"), "utf8");
    expect(raw).toContain("- [x] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01");
    expect(raw).toContain("- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20");
  });

  it("writeVaultFileAtomic leaves one complete write and no temporary files after concurrent writes", async () => {
    const fullPath = path.join(vaultDir, "atomic.md");
    const contentA = "A".repeat(1_000_000);
    const contentB = "B".repeat(1_000_000);

    await Promise.all([
      writeVaultFileAtomic(fullPath, contentA),
      writeVaultFileAtomic(fullPath, contentB),
    ]);

    const written = await readFile(fullPath, "utf8");
    expect([contentA, contentB]).toContain(written);
    expect(await readdir(vaultDir)).toEqual(["atomic.md"]);
  });
});

describe("TS/Node parity", () => {
  it("parseScheduleEvents produces the same structure in TS and Node", async () => {
    const nodeModulePath = path.join(process.cwd(), "analysis/helpers/vault/schedule.mjs");
    const nodeModule = (await import(pathToFileURL(nodeModulePath).href)) as {
      parseScheduleEvents: typeof parseScheduleEvents;
    };
    expect(JSON.stringify(nodeModule.parseScheduleEvents(SCHEDULE_FIXTURE_BODY))).toBe(
      JSON.stringify(parseScheduleEvents(SCHEDULE_FIXTURE_BODY))
    );
  });
});
