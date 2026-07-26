import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePlanBlocks, formatPlanBlockLine, readPlan, type PlanBlock } from "./plan";

export const PLAN_FIXTURE_BODY = readFileSync(
  path.join(process.cwd(), "analysis/test/fixtures/study-plan.md"),
  "utf8"
);

describe("parsePlanBlocks", () => {
  it("parses blocks in the fixed key order, memo can be empty", () => {
    expect(parsePlanBlocks(PLAN_FIXTURE_BODY)).toEqual([
      { id: "p-1", start: "09:00", end: "10:30", subject: "英語R", status: "planned", memo: "長文演習" },
      { id: "p-2", start: "11:00", end: "12:00", subject: "数学IA", status: "done", memo: "" },
    ]);
  });

  it("returns an empty array when there are no block lines", () => {
    expect(parsePlanBlocks("## 計画\n")).toEqual([]);
  });
});

describe("formatPlanBlockLine", () => {
  it("formats a block with all fields including empty memo", () => {
    const block: PlanBlock = { id: "p-2", start: "11:00", end: "12:00", subject: "数学IA", status: "done", memo: "" };
    expect(formatPlanBlockLine(block)).toBe(
      "- id=p-2 | start=11:00 | end=12:00 | subject=数学IA | status=done | memo="
    );
  });

  it("throws when a field value contains the ' | ' delimiter", () => {
    const block: PlanBlock = { id: "p-1", start: "09:00", end: "10:30", subject: "英語R", status: "planned", memo: "長文 | 演習" };
    expect(() => formatPlanBlockLine(block)).toThrow();
  });

  it("throws when a field value contains a newline", () => {
    const block: PlanBlock = { id: "p-1", start: "09:00", end: "10:30", subject: "英語R", status: "planned", memo: "長文\n演習" };
    expect(() => formatPlanBlockLine(block)).toThrow();
  });
});

describe("readPlan", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-plan-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  it("returns [] when plans/<date>.md does not exist", async () => {
    expect(await readPlan("2026-07-26")).toEqual([]);
  });

  it("parses an existing plans/<date>.md", async () => {
    await mkdir(path.join(vaultDir, "plans"), { recursive: true });
    await writeFile(
      path.join(vaultDir, "plans", "2026-07-26.md"),
      [
        "---",
        "type: study-plan",
        "date: 2026-07-26",
        "schema_version: 1",
        "updated: 2026-07-25T22:10:00+09:00",
        "---",
        "",
        PLAN_FIXTURE_BODY,
      ].join("\n"),
      "utf8"
    );
    expect(await readPlan("2026-07-26")).toEqual([
      { id: "p-1", start: "09:00", end: "10:30", subject: "英語R", status: "planned", memo: "長文演習" },
      { id: "p-2", start: "11:00", end: "12:00", subject: "数学IA", status: "done", memo: "" },
    ]);
  });
});
