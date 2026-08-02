import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readVaultFile, readVaultFileFromSupabase } from "./read";
import { listStudyRecordDates, listStudyRecordDatesFromSupabase } from "./study-sessions";
import { listReports, listReportsFromSupabase } from "./reports";
import type { VaultFilesClient } from "./supabase-client";

const RECORD_RAW = [
  "---",
  "type: study-record",
  "date: 2026-07-25",
  "schema_version: 1",
  "---",
  "",
  "## セッション",
  "- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題",
].join("\n");

function fakeClient(rows: Record<string, string>): VaultFilesClient {
  return {
    selectByPath: async (p) => (p in rows ? { path: p, content: rows[p] } : null),
    selectByPrefix: async (prefix) =>
      Object.entries(rows)
        .filter(([p]) => p.startsWith(prefix))
        .map(([p, content]) => ({ path: p, content })),
    selectPathsByPrefix: async (prefix) => Object.keys(rows).filter((p) => p.startsWith(prefix)),
  };
}

describe("fs/supabase parity", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-parity-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  it("readVaultFile: fs and Supabase return the same structure for the same content", async () => {
    await mkdir(path.join(vaultDir, "records"), { recursive: true });
    await writeFile(path.join(vaultDir, "records", "2026-07-25.md"), RECORD_RAW, "utf8");

    const fsResult = await readVaultFile("records/2026-07-25.md");
    const supabaseResult = await readVaultFileFromSupabase(
      "records/2026-07-25.md",
      fakeClient({ "records/2026-07-25.md": RECORD_RAW })
    );
    expect(supabaseResult).toEqual(fsResult);
  });

  it("listStudyRecordDates: fs and Supabase agree on the sorted date list", async () => {
    await mkdir(path.join(vaultDir, "records"), { recursive: true });
    await writeFile(path.join(vaultDir, "records", "2026-07-25.md"), RECORD_RAW, "utf8");
    await writeFile(path.join(vaultDir, "records", "2026-07-20.md"), RECORD_RAW, "utf8");

    const fsResult = await listStudyRecordDates();
    const supabaseResult = await listStudyRecordDatesFromSupabase(
      fakeClient({ "records/2026-07-25.md": RECORD_RAW, "records/2026-07-20.md": RECORD_RAW })
    );
    expect(supabaseResult).toEqual(fsResult);
  });

  it("listReports: fs and Supabase agree on daily report metadata", async () => {
    const dailyRaw = ["---", "type: daily-report", "date: 2026-07-24", "schema_version: 1", "---", "", "本文"].join(
      "\n"
    );
    await mkdir(path.join(vaultDir, "reports", "daily"), { recursive: true });
    await writeFile(path.join(vaultDir, "reports", "daily", "2026-07-24.md"), dailyRaw, "utf8");

    const fsResult = await listReports("daily");
    const supabaseResult = await listReportsFromSupabase(
      "daily",
      fakeClient({ "reports/daily/2026-07-24.md": dailyRaw })
    );
    expect(supabaseResult).toEqual(fsResult);
  });

  it("readVaultFile: fs and Supabase return the same derived skills JSON", async () => {
    const relPath = "data/derived/skills-化学基礎.json";
    const raw = JSON.stringify({
      schema_version: 1,
      subject: "化学基礎",
      generated_at: "2026-08-02T03:00:00+09:00",
      topics: [],
    });
    await mkdir(path.join(vaultDir, "data", "derived"), { recursive: true });
    await writeFile(path.join(vaultDir, relPath), raw, "utf8");
    const fsResult = await readVaultFile(relPath);
    const supabaseResult = await readVaultFileFromSupabase(relPath, fakeClient({ [relPath]: raw }));
    expect(supabaseResult).toEqual(fsResult);
  });
});
