#!/usr/bin/env node
// 訂正消化後に corrections.md を空にする。契約4b `clearCorrections` のCLIラッパー。
// 使い方: node analysis/helpers/clear-corrections.mjs
import { fileURLToPath } from 'node:url';
import { loadVaultEnv } from './vault/env.mjs';
import { printJson } from './lib.mjs';

export async function run() {
  const { clearCorrections } = await import('./vault/index.mjs');
  await clearCorrections();
  return { cleared: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  printJson(await run());
}
