#!/usr/bin/env node
// _inbox/の原本を _archive/YYYY/MM/ へ移動する。契約4b `archivePhoto` のCLIラッパー。
// 使い方: node analysis/helpers/archive-inbox-photo.mjs <srcRelPath> <dateStr(YYYY-MM-DD)>
import { fileURLToPath } from 'node:url';
import { loadVaultEnv } from './vault/env.mjs';
import { printJson } from './lib.mjs';

export async function run([srcRelPath, dateStr]) {
  if (!srcRelPath || !dateStr) {
    throw new Error('使い方: node helpers/archive-inbox-photo.mjs <srcRelPath> <dateStr>');
  }
  const { archivePhoto } = await import('./vault/index.mjs');
  const archivedPath = await archivePhoto(srcRelPath, dateStr);
  return { archivedPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  printJson(await run(process.argv.slice(2)));
}
