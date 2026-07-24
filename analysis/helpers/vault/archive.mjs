import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { vaultRoot } from './root.mjs';

export async function archivePhoto(srcRelPath, dateStr) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateStr);
  if (!match) {
    throw new Error(`archivePhoto: invalid dateStr "${dateStr}", expected YYYY-MM-DD`);
  }
  const [, year, month] = match;
  const destRelPath = path.posix.join('_archive', year, month, path.basename(srcRelPath));

  const root = vaultRoot();
  const srcFullPath = path.join(root, srcRelPath);
  const destFullPath = path.join(root, destRelPath);
  await mkdir(path.dirname(destFullPath), { recursive: true });
  try {
    await rename(srcFullPath, destFullPath);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await copyFile(srcFullPath, destFullPath);
    await unlink(srcFullPath);
  }
  return destRelPath;
}
