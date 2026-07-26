import { readdir } from "node:fs/promises";
import path from "node:path";
import { getVaultFilesClient, getVaultRoot, getVaultSource, type VaultFilesClient } from "@/lib/vault";

export async function listKarteSubjectsFromSupabase(client: VaultFilesClient): Promise<string[]> {
  const paths = await client.selectPathsByPrefix("subjects/");
  const names = new Set<string>();
  for (const filePath of paths) {
    const rest = filePath.slice("subjects/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) continue;
    names.add(rest.slice(0, slash));
  }
  return Array.from(names).sort();
}

export async function listKarteSubjects(): Promise<string[]> {
  if (getVaultSource() === "supabase") {
    return listKarteSubjectsFromSupabase(await getVaultFilesClient());
  }
  const subjectsDir = path.join(getVaultRoot(), "subjects");
  let entries;
  try {
    entries = await readdir(subjectsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
