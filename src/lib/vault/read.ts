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
  return { frontmatter, body, raw };
}
