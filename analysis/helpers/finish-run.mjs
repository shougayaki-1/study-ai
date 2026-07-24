#!/usr/bin/env node
// runs/YYYY-MM-DD.md にラン完了を追記する。start-run.mjsが書いた開始時刻をreadVaultFileで
// 読み戻し、finished_at/processed/needs_confirmation/statusを追加する。
// 使い方: node analysis/helpers/finish-run.mjs <dateStr> <ok|error> <summaryJSON>
//   summaryJSON例: {"processed":5,"needsConfirmation":2,"lines":["写真5件処理(analyzed 4 / failed 1)","要確認TODO 2件"]}
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';

export function buildRunFinishFrontmatter(existingFrontmatter, { finishedAt, processed, needsConfirmation, status }) {
  return {
    ...existingFrontmatter,
    finished_at: finishedAt,
    processed,
    needs_confirmation: needsConfirmation,
    status,
    updated: finishedAt,
  };
}

export function buildRunFinishBody(existingBody, summaryLines) {
  const withoutInProgress = existingBody.replace(/## 実行中[\s\S]*$/, '').replace(/\s+$/, '');
  const summary = summaryLines.length
    ? summaryLines.map((line) => `- ${line}`).join('\n')
    : '- 特記事項なし';
  return `${withoutInProgress}\n\n## 完了\n\n${summary}\n`;
}

export async function run([dateStr, status, summaryArg]) {
  if (!dateStr || !['ok', 'error'].includes(status) || !summaryArg) {
    throw new Error('使い方: node helpers/finish-run.mjs <dateStr> <ok|error> <summaryJSON>');
  }
  const summary = JSON.parse(summaryArg);
  const finishedAt = new Date().toISOString();
  const { readVaultFile, writeVaultFile } = await import('./vault/index.mjs');
  const relPath = `runs/${dateStr}.md`;
  const existing = await readVaultFile(relPath);
  const frontmatter = buildRunFinishFrontmatter(existing.frontmatter, {
    finishedAt,
    processed: summary.processed ?? 0,
    needsConfirmation: summary.needsConfirmation ?? 0,
    status,
  });
  const body = buildRunFinishBody(existing.body, summary.lines ?? []);
  await writeVaultFile(relPath, frontmatter, body);
  return { path: relPath, finished_at: finishedAt, status };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
