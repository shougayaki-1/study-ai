import { readdir } from "node:fs/promises";
import path from "node:path";
import { getVaultRoot } from "@/lib/vault";

export async function listKarteSubjects(): Promise<string[]> {
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
