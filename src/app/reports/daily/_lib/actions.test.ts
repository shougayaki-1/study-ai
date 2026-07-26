import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ConfirmTodo } from "@/lib/vault";
import { performCorrection, submitCorrection } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("performCorrection", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;
  const originalSource = process.env.STUDY_AI_VAULT_SOURCE;
  const todo: ConfirmTodo = { id: "todo-1", q: "q", options: ["日本史", "世界史"], default: "日本史" };
  const correctionsPath = () => path.join(vaultDir, "_inbox", "corrections.md");

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "study-ai-vault-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
    delete process.env.STUDY_AI_VAULT_SOURCE;
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
    if (originalSource === undefined) delete process.env.STUDY_AI_VAULT_SOURCE;
    else process.env.STUDY_AI_VAULT_SOURCE = originalSource;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("appends the chosen correction to _inbox/corrections.md when the source is fs (local, default)", async () => {
    await performCorrection({
      reportPath: "reports/daily/2026-07-20.md",
      todo,
      choice: "世界史",
    });
    const corrections = await readFile(correctionsPath(), "utf-8");
    expect(corrections).toContain("report: reports/daily/2026-07-20.md");
    expect(corrections).toContain("todo: todo-1");
    expect(corrections).toContain("choice: 世界史");
  });

  it("throws and writes no file when STUDY_AI_VAULT_SOURCE=supabase", async () => {
    process.env.STUDY_AI_VAULT_SOURCE = "supabase";
    await expect(
      performCorrection({ reportPath: "reports/daily/2026-07-20.md", todo, choice: "世界史" })
    ).rejects.toThrow(/read-only/);
    await expect(access(correctionsPath())).rejects.toThrow();
  });
});

describe("submitCorrection", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;
  const originalSource = process.env.STUDY_AI_VAULT_SOURCE;
  const todo: ConfirmTodo = { id: "todo-1", q: "q", options: ["日本史", "世界史"], default: "日本史" };
  const correctionsPath = () => path.join(vaultDir, "_inbox", "corrections.md");

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "study-ai-vault-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
    delete process.env.STUDY_AI_VAULT_SOURCE;
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
    if (originalSource === undefined) delete process.env.STUDY_AI_VAULT_SOURCE;
    else process.env.STUDY_AI_VAULT_SOURCE = originalSource;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("appends the chosen correction when the source is fs (local, default)", async () => {
    await submitCorrection({
      reportPath: "reports/daily/2026-07-20.md",
      date: "2026-07-20",
      todo,
      choice: "世界史",
    });
    const corrections = await readFile(correctionsPath(), "utf-8");
    expect(corrections).toContain("choice: 世界史");
  });

  it("throws and writes no file when STUDY_AI_VAULT_SOURCE=supabase", async () => {
    process.env.STUDY_AI_VAULT_SOURCE = "supabase";
    await expect(
      submitCorrection({
        reportPath: "reports/daily/2026-07-20.md",
        date: "2026-07-20",
        todo,
        choice: "世界史",
      })
    ).rejects.toThrow(/read-only/);
    await expect(access(correctionsPath())).rejects.toThrow();
  });
});
