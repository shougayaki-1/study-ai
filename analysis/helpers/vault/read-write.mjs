import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { vaultRoot } from './root.mjs';

export async function readVaultFile(relPath) {
  const fullPath = path.join(vaultRoot(), relPath);
  const raw = await readFile(fullPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return { frontmatter, body, raw };
}

export async function writeVaultFile(relPath, frontmatter, body) {
  const fullPath = path.join(vaultRoot(), relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const raw = stringifyFrontmatter(frontmatter, body);
  await writeFile(fullPath, raw, 'utf8');
}
