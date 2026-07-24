#!/usr/bin/env node
// vault/ 配下にMarkdownを書き込む(frontmatter+本文)。契約4b `writeVaultFile` のCLIラッパー。
// 使い方: node analysis/helpers/write-vault-file.mjs <relPath> <frontmatterJSON> <bodyFilePath|->
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { printJson } from './lib.mjs';

export async function run([relPath, frontmatterArg, bodyPathOrDash]) {
  if (!relPath || !frontmatterArg || !bodyPathOrDash) {
    throw new Error('使い方: node helpers/write-vault-file.mjs <relPath> <frontmatterJSON> <bodyFilePath|->');
  }
  const frontmatter = JSON.parse(frontmatterArg);
  const body = bodyPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(bodyPathOrDash, 'utf8');
  const { writeVaultFile } = await import('./vault/index.mjs');
  await writeVaultFile(relPath, frontmatter, body);
  return { written: relPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
