import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readVaultFile, readVaultFileFromSupabase } from "./read";

describe("readVaultFile", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-read-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  it("reads and parses a vault markdown file", async () => {
    const dir = path.join(vaultDir, "subjects", "日本史");
    await mkdir(dir, { recursive: true });
    const raw = [
      "---",
      "type: karte",
      "subject: 日本史",
      "updated: 2026-07-24T23:40:00+09:00",
      "source: nightly-batch",
      "schema_version: 1",
      "---",
      "",
      "# 弱点カルテ",
      "",
      "本文...",
    ].join("\n");
    await writeFile(path.join(dir, "弱点カルテ.md"), raw, "utf8");

    const result = await readVaultFile("subjects/日本史/弱点カルテ.md");
    expect(result.frontmatter.subject).toBe("日本史");
    expect(result.frontmatter.schema_version).toBe(1);
    expect(result.body).toBe("# 弱点カルテ\n\n本文...");
    expect(result.raw).toBe(raw);
  });

  it("throws when relPath escapes the vault root", async () => {
    await expect(readVaultFile("../outside.md")).rejects.toThrow(
      /escapes vault root/
    );
  });

  it("warns but still reads a file with an unknown schema_version", async () => {
    await writeFile(
      path.join(vaultDir, "future.md"),
      "---\ntype: schedule\nschema_version: 2\n---\n\n## 予定\n",
      "utf8"
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await readVaultFile("future.md");

    expect(result.frontmatter.schema_version).toBe(2);
    expect(result.body).toBe("## 予定\n");
    expect(warn).toHaveBeenCalledWith(
      "Unknown vault schema_version 2 in future.md; attempting a best-effort read"
    );
    warn.mockRestore();
  });
});

describe("readVaultFileFromSupabase", () => {
  function fakeClient(rows: Record<string, string>) {
    return {
      selectByPath: async (p: string) => (p in rows ? { path: p, content: rows[p] } : null),
      selectByPrefix: async () => [],
    };
  }

  it("parses row content the same way readVaultFile parses a local file", async () => {
    const raw = ["---", "type: schedule", "schema_version: 1", "---", "", "## 予定"].join("\n");
    const result = await readVaultFileFromSupabase("schedule.md", fakeClient({ "schedule.md": raw }));
    expect(result.frontmatter.type).toBe("schedule");
    expect(result.body).toBe("## 予定");
    expect(result.raw).toBe(raw);
  });

  it("throws an ENOENT error when the path is not in the mirror", async () => {
    await expect(readVaultFileFromSupabase("missing.md", fakeClient({}))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
