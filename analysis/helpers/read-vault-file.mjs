#!/usr/bin/env node
// vault/ 配下のMarkdownファイルを読み、frontmatterと本文をJSONで返す。
// 契約4b `readVaultFile` のCLIラッパー(ヘッドレスCLIのシェル実行から呼べるようにする)。
// 使い方: node analysis/helpers/read-vault-file.mjs <relPath>
import { fileURLToPath } from 'node:url';
import { loadVaultEnv } from './vault/env.mjs';
import { printJson } from './lib.mjs';

export async function run([relPath]) {
  if (!relPath) {
    throw new Error('使い方: node helpers/read-vault-file.mjs <relPath>');
  }
  const { readVaultFile } = await import('./vault/index.mjs');
  return readVaultFile(relPath);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  printJson(await run(process.argv.slice(2)));
}
