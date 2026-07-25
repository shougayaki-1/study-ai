#!/usr/bin/env node
// runs/YYYY-MM-DD.md にラン開始を記録する。夜間バッチ固有(内部で契約4bのwriteVaultFileを使う)。
// 使い方: node analysis/helpers/start-run.mjs <dateStr(YYYY-MM-DD)>
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

export function buildRunStartFrontmatter(dateStr, startedAt) {
  return {
    type: 'run-log',
    date: dateStr,
    started_at: startedAt,
    source: 'nightly-batch',
    schema_version: 1,
    updated: startedAt,
  };
}

export function buildRunStartBody(dateStr) {
  return `# ラン記録 ${dateStr}\n\n## 実行中\n\n- 開始しました。完了時にこのセクションを完了報告へ置き換えます。\n`;
}

export async function run([dateStr]) {
  if (!dateStr) throw new Error('使い方: node helpers/start-run.mjs <dateStr>');
  const startedAt = new Date().toISOString();
  const { writeVaultFile } = await import('./vault/index.mjs');
  const frontmatter = buildRunStartFrontmatter(dateStr, startedAt);
  await writeVaultFile(`runs/${dateStr}.md`, frontmatter, buildRunStartBody(dateStr));
  return { path: `runs/${dateStr}.md`, started_at: startedAt };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
