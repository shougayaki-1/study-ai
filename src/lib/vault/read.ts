import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { getVaultRoot } from "./root";

export async function readVaultFile(
  relPath: string
): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }> {
  const root = getVaultRoot();
  const full = path.resolve(root, relPath);
  if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) {
    throw new Error("relPath escapes vault root: " + relPath);
  }
  const raw = await readFile(full, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const schemaVersion = frontmatter.schema_version;
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    console.warn(
      `Unknown vault schema_version ${String(schemaVersion)} in ${relPath}; attempting a best-effort read`
    );
  }
  return { frontmatter, body, raw };
}
