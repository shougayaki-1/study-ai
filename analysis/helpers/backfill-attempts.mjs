#!/usr/bin/env node
// _archive/ 配下の既存原本を遡って attempts.jsonl へ取り込む。

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { ingestArtifact } from './ingest-artifact.mjs';

function vaultRoot() {
  const dir = process.env.STUDY_AI_VAULT_DIR;
  if (!dir) throw new Error('STUDY_AI_VAULT_DIR が未設定です。');
  return dir;
}

async function listPdfs(dirRel) {
  const root = vaultRoot();
  const files = [];
  async function walk(relPath) {
    let entries;
    try {
      entries = await readdir(path.join(root, relPath), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const child = path.join(relPath, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) files.push(child);
    }
  }
  await walk(dirRel);
  return files.sort();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const files = await listPdfs('_archive');
  const results = [];
  const totals = { files: files.length, matched: 0, attempts: 0, added: 0, unchanged: 0, unknownMarks: 0, failed: 0 };

  for (const relPath of files) {
    try {
      const result = await ingestArtifact(relPath, { dryRun });
      results.push({ relPath, ...result });
      if (result.adapter) {
        totals.matched += 1;
        totals.attempts += result.attempts;
        totals.added += result.added;
        totals.unchanged += result.unchanged;
        totals.unknownMarks += result.unknownMarks;
      }
    } catch (error) {
      totals.failed += 1;
      results.push({ relPath, error: error.message });
    }
  }

  console.log(JSON.stringify({ totals, results }, null, 2));
  if (totals.unknownMarks > 0) {
    console.error(`警告: 色判定できなかったマークが ${totals.unknownMarks} 件あります。要確認TODOへ回してください。`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
