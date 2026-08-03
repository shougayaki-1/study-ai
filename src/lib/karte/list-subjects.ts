import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  getVaultFilesClient,
  getVaultRoot,
  getVaultSource,
  type VaultFilesClient,
} from "@/lib/vault";

export async function listKarteSubjectsFromSupabase(
  client: VaultFilesClient,
): Promise<string[]> {
  const [subjectPaths, derivedPaths] = await Promise.all([
    client.selectPathsByPrefix("subjects/"),
    client.selectPathsByPrefix("data/derived/skills-"),
  ]);
  const names = new Set<string>();
  for (const filePath of subjectPaths) {
    const rest = filePath.slice("subjects/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) continue;
    names.add(rest.slice(0, slash));
  }
  for (const filePath of derivedPaths) {
    const match = /^data\/derived\/skills-(.+)\.json$/.exec(filePath);
    if (match) names.add(match[1]);
  }
  return Array.from(names).sort();
}

export async function listKarteSubjects(): Promise<string[]> {
  if (getVaultSource() === "supabase") {
    return listKarteSubjectsFromSupabase(await getVaultFilesClient());
  }
  const root = getVaultRoot();
  let subjectEntries: Dirent[];
  try {
    subjectEntries = await readdir(path.join(root, "subjects"), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") subjectEntries = [];
    else throw error;
  }
  let derivedEntries: Dirent[];
  try {
    derivedEntries = await readdir(path.join(root, "data", "derived"), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") derivedEntries = [];
    else throw error;
  }
  const names = new Set(
    subjectEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  for (const entry of derivedEntries) {
    const match = entry.isFile()
      ? /^skills-(.+)\.json$/.exec(entry.name)
      : null;
    if (match) names.add(match[1]);
  }
  return Array.from(names).sort();
}
