import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { getVaultRoot } from "./root";
import { getVaultSource } from "./source";
import { getVaultFilesClient, type VaultFilesClient } from "./supabase-client";

export function parseVaultFileContent(
  relPath: string,
  content: string
): { frontmatter: Record<string, unknown>; body: string; raw: string } {
  if (relPath.endsWith(".json")) {
    return { frontmatter: {}, body: content, raw: content };
  }
  const { frontmatter, body } = parseFrontmatter(content);
  const schemaVersion = frontmatter.schema_version;
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    console.warn(
      `Unknown vault schema_version ${String(schemaVersion)} in ${relPath}; attempting a best-effort read`
    );
  }
  return { frontmatter, body, raw: content };
}

export async function readVaultFileFromSupabase(
  relPath: string,
  client: VaultFilesClient
): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }> {
  const row = await client.selectByPath(relPath);
  if (!row) {
    const error = new Error(`vault file not found in Supabase mirror: ${relPath}`) as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
  return parseVaultFileContent(relPath, row.content);
}

export async function readVaultFile(
  relPath: string
): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }> {
  if (getVaultSource() === "supabase") {
    return readVaultFileFromSupabase(relPath, await getVaultFilesClient());
  }
  const root = getVaultRoot();
  const full = path.resolve(root, relPath);
  if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) {
    throw new Error("relPath escapes vault root: " + relPath);
  }
  const raw = await readFile(full, "utf8");
  return parseVaultFileContent(relPath, raw);
}
