import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendCorrection } from "./corrections";

describe("appendCorrection", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-corrections-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  it("appends the exact contract §3b block for the first entry", async () => {
    await appendCorrection({
      timestamp: "2026-07-24T08:12:00+09:00",
      report: "reports/daily/2026-07-24.md",
      todo: "todo-1",
      choice: "世界史",
      note: "実は世界史でした",
    });
    const raw = await readFile(path.join(vaultDir, "_inbox", "corrections.md"), "utf8");
    expect(raw).toBe(
      [
        "## 2026-07-24T08:12:00+09:00",
        "- report: reports/daily/2026-07-24.md",
        "- todo: todo-1",
        "- choice: 世界史",
        "- note: 実は世界史でした",
        "",
      ].join("\n")
    );
  });

  it("appends a second entry separated by a blank line, omitting note when absent", async () => {
    await appendCorrection({
      timestamp: "2026-07-24T08:12:00+09:00",
      report: "reports/daily/2026-07-24.md",
      todo: "todo-1",
      choice: "世界史",
      note: "実は世界史でした",
    });
    await appendCorrection({
      timestamp: "2026-07-24T09:00:00+09:00",
      report: "reports/daily/2026-07-24.md",
      todo: "todo-2",
      choice: "不明",
    });
    const raw = await readFile(path.join(vaultDir, "_inbox", "corrections.md"), "utf8");
    expect(raw).toBe(
      [
        "## 2026-07-24T08:12:00+09:00",
        "- report: reports/daily/2026-07-24.md",
        "- todo: todo-1",
        "- choice: 世界史",
        "- note: 実は世界史でした",
        "",
        "## 2026-07-24T09:00:00+09:00",
        "- report: reports/daily/2026-07-24.md",
        "- todo: todo-2",
        "- choice: 不明",
        "",
      ].join("\n")
    );
  });
});
