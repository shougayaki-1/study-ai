import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
  const dir = path.dirname(fullPath);
  await mkdir(dir, { recursive: true });
  const raw = stringifyFrontmatter(frontmatter, body);
  const tmpPath = path.join(dir, `.${path.basename(fullPath)}.tmp-${randomUUID()}`);
  await writeFile(tmpPath, raw, 'utf8');
  try {
    await rename(tmpPath, fullPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}
