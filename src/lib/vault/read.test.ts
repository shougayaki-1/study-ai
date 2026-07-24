import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readVaultFile } from "./read";

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
});
