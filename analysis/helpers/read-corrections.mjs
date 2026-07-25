#!/usr/bin/env node
// _inbox/corrections.md を読み、CorrectionEntry[]をJSONで返す。契約4b `readCorrections` のCLIラッパー。
// 使い方: node analysis/helpers/read-corrections.mjs
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

export async function run() {
  const { readCorrections } = await import('./vault/index.mjs');
  return readCorrections();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run());
}
