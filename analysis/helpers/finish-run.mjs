#!/usr/bin/env node
// runs/YYYY-MM-DD.md にラン完了を追記する。start-run.mjsが書いた開始時刻をreadVaultFileで
// 読み戻し、finished_at/processed/needs_confirmation/statusを追加する。
// 使い方: node analysis/helpers/finish-run.mjs <dateStr> <ok|error> <summaryJSON>
//   summaryJSON例: {"processed":5,"needsConfirmation":2,"lines":["写真5件処理(analyzed 4 / failed 1)","要確認TODO 2件"]}
//
// **二重起動ロック**: start-run.mjs が取得した `runs/.lock` を解放する。status が ok / error の
// どちらでも、また完了報告の書き込み自体が失敗しても必ず解放する(解放漏れで以後の実行が
// 止まらないようにするため。万一残っても start-run 側の stale 判定で回収される)。
//
// ロックだけを手動で解放したい場合(バッチがクラッシュして残った等):
//   node analysis/helpers/finish-run.mjs --release-lock
import { fileURLToPath } from 'node:url';
import { printJson } from './lib.mjs';
import { releaseRunLock, RUN_LOCK_REL_PATH } from './start-run.mjs';

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
  const { vaultRoot, readVaultFile, writeVaultFile } = await import('./vault/index.mjs');

  // ロックだけの解放モード(手動復旧用)。
  if (dateStr === '--release-lock') {
    const result = await releaseRunLock(vaultRoot());
    return { lock: RUN_LOCK_REL_PATH, lock_released: result.released };
  }

  if (!dateStr || !['ok', 'error'].includes(status) || !summaryArg) {
    throw new Error('使い方: node helpers/finish-run.mjs <dateStr> <ok|error> <summaryJSON>');
  }
  const summary = JSON.parse(summaryArg);
  const finishedAt = new Date().toISOString();
  const relPath = `runs/${dateStr}.md`;
  try {
    const existing = await readVaultFile(relPath);
    const frontmatter = buildRunFinishFrontmatter(existing.frontmatter, {
      finishedAt,
      processed: summary.processed ?? 0,
      needsConfirmation: summary.needsConfirmation ?? 0,
      status,
    });
    const body = buildRunFinishBody(existing.body, summary.lines ?? []);
    await writeVaultFile(relPath, frontmatter, body);
  } finally {
    // 完了報告の書き込みが失敗しても必ずロックは解放する。
    await releaseRunLock(vaultRoot());
  }
  return { path: relPath, finished_at: finishedAt, status, lock_released: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { loadVaultEnv } = await import('./vault/env.mjs');
  loadVaultEnv();
  printJson(await run(process.argv.slice(2)));
}
