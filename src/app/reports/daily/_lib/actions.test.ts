import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ConfirmTodo } from "@/lib/vault";
import { performCorrection } from "./actions";

describe("performCorrection", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "study-ai-vault-"));
    await mkdir(path.join(vaultDir, "_inbox"), { recursive: true });
    await writeFile(path.join(vaultDir, "_inbox", "corrections.md"), "", "utf-8");
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    process.env.STUDY_AI_VAULT_DIR = originalEnv;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("appends the chosen correction to _inbox/corrections.md", async () => {
    const todo: ConfirmTodo = { id: "todo-1", q: "q", options: ["日本史", "世界史"], default: "日本史" };
    await performCorrection({
      reportPath: "reports/daily/2026-07-20.md",
      todo,
      choice: "世界史",
    });
    const corrections = await readFile(path.join(vaultDir, "_inbox", "corrections.md"), "utf-8");
    expect(corrections).toContain("report: reports/daily/2026-07-20.md");
    expect(corrections).toContain("todo: todo-1");
    expect(corrections).toContain("choice: 世界史");
  });
});
