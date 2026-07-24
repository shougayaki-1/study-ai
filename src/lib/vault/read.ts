import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { getVaultRoot } from "./root";

export async function readVaultFile(
  relPath: string
): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }> {
  const fullPath = path.join(getVaultRoot(), relPath);
  const raw = await readFile(fullPath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  return { frontmatter, body, raw };
}
