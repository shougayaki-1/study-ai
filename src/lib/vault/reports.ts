import { readdir } from "node:fs/promises";
import path from "node:path";
import { parseVaultFileContent, readVaultFile } from "./read";
import { getVaultRoot } from "./root";
import { getVaultSource } from "./source";
import { getVaultFilesClient, type VaultFilesClient } from "./supabase-client";

export type ReportMeta = { path: string; date: string; frontmatter: Record<string, unknown> };

export async function listReportsFromSupabase(
  kind: "daily" | "weekly",
  client: VaultFilesClient
): Promise<ReportMeta[]> {
  const dirRelPath = path.posix.join("reports", kind);
  const rows = await client.selectByPrefix(`${dirRelPath}/`);
  const dateKey = kind === "daily" ? "date" : "week";
  const reports: ReportMeta[] = rows
    .filter((row) => row.path.endsWith(".md"))
    .map((row) => {
      const { frontmatter } = parseVaultFileContent(row.path, row.content);
      return { path: row.path, date: String(frontmatter[dateKey]), frontmatter };
    });
  reports.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return reports;
}

export async function listReports(kind: "daily" | "weekly"): Promise<ReportMeta[]> {
  if (getVaultSource() === "supabase") {
    return listReportsFromSupabase(kind, await getVaultFilesClient());
  }
  const dirRelPath = path.posix.join("reports", kind);
  const dirFullPath = path.join(getVaultRoot(), "reports", kind);
  let entries: string[];
  try {
    entries = await readdir(dirFullPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const dateKey = kind === "daily" ? "date" : "week";
  const reports: ReportMeta[] = [];
  for (const fileName of entries) {
    if (!fileName.endsWith(".md")) continue;
    const relPath = path.posix.join(dirRelPath, fileName);
    const { frontmatter } = await readVaultFile(relPath);
    reports.push({ path: relPath, date: String(frontmatter[dateKey]), frontmatter });
  }
  reports.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return reports;
}
