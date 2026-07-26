import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listKarteSubjects, listKarteSubjectsFromSupabase } from "./list-subjects";

describe("listKarteSubjects", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "study-ai-vault-"));
    await mkdir(path.join(vaultDir, "subjects", "日本史"), { recursive: true });
    await mkdir(path.join(vaultDir, "subjects", "世界史"), { recursive: true });
    await writeFile(path.join(vaultDir, "subjects", "not-a-subject.md"), "stray file", "utf-8");
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    process.env.STUDY_AI_VAULT_DIR = originalEnv;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("lists subject directory names, ignoring stray files", async () => {
    expect(await listKarteSubjects()).toEqual(["世界史", "日本史"]);
  });

  it("returns an empty array when the subjects directory does not exist", async () => {
    await rm(path.join(vaultDir, "subjects"), { recursive: true, force: true });
    expect(await listKarteSubjects()).toEqual([]);
  });
});

describe("listKarteSubjectsFromSupabase", () => {
  it("extracts unique subject directory names from subjects/ prefixed paths", async () => {
    const client = {
      selectByPath: async () => null,
      selectByPrefix: async (prefix: string) => {
        expect(prefix).toBe("subjects/");
        return [
          { path: "subjects/日本史/弱点カルテ.md", content: "" },
          { path: "subjects/日本史/誤答ログ.md", content: "" },
          { path: "subjects/世界史/弱点カルテ.md", content: "" },
          { path: "subjects/not-a-subject.md", content: "" },
        ];
      },
    };
    expect(await listKarteSubjectsFromSupabase(client)).toEqual(["世界史", "日本史"]);
  });
});
