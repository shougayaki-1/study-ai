import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { vaultRoot } from './root.mjs';

export async function readVaultFile(relPath) {
  const root = vaultRoot();
  const full = path.resolve(root, relPath);
  if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('relPath escapes vault root: ' + relPath);
  }
  const raw = await readFile(full, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return { frontmatter, body, raw };
}

export async function writeVaultFile(relPath, frontmatter, body) {
  const fullPath = path.join(vaultRoot(), relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const raw = stringifyFrontmatter(frontmatter, body);
  await writeFile(fullPath, raw, 'utf8');
}
