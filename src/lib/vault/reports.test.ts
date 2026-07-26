import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listReports, listReportsFromSupabase } from "./reports";

function dailyRaw(date: string, confirmTodos: number) {
  return [
    "---",
    "type: daily-report",
    `date: ${date}`,
    `confirm_todos: ${confirmTodos}`,
    "updated: 2026-07-24T23:40:00+09:00",
    "source: nightly-batch",
    "schema_version: 1",
    "---",
    "",
    "本文",
  ].join("\n");
}

describe("listReports", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-reports-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  it("lists daily reports sorted by date descending", async () => {
    const dir = path.join(vaultDir, "reports", "daily");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-07-22.md"), dailyRaw("2026-07-22", 0), "utf8");
    await writeFile(path.join(dir, "2026-07-24.md"), dailyRaw("2026-07-24", 2), "utf8");

    const reports = await listReports("daily");
    expect(reports.map((r) => r.path)).toEqual([
      "reports/daily/2026-07-24.md",
      "reports/daily/2026-07-22.md",
    ]);
    expect(reports[0].date).toBe("2026-07-24");
    expect(reports[0].frontmatter.confirm_todos).toBe(2);
  });

  it("returns an empty array when the reports directory does not exist", async () => {
    expect(await listReports("weekly")).toEqual([]);
  });
});

describe("listReportsFromSupabase", () => {
  it("filters by reports/<kind>/ prefix and sorts by date descending", async () => {
    const client = {
      selectByPath: async () => null,
      selectPathsByPrefix: async () => [],
      selectByPrefix: async (prefix: string) => {
        expect(prefix).toBe("reports/daily/");
        return [
          { path: "reports/daily/2026-07-22.md", content: dailyRaw("2026-07-22", 0) },
          { path: "reports/daily/2026-07-24.md", content: dailyRaw("2026-07-24", 2) },
        ];
      },
    };
    const reports = await listReportsFromSupabase("daily", client);
    expect(reports.map((r) => r.path)).toEqual([
      "reports/daily/2026-07-24.md",
      "reports/daily/2026-07-22.md",
    ]);
    expect(reports[0].date).toBe("2026-07-24");
    expect(reports[0].frontmatter.confirm_todos).toBe(2);
  });
});
