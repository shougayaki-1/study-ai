#!/usr/bin/env node
// vault 内の原本1件を attempts.jsonl へ取り込む。

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendAttempts } from './vault/attempts.mjs';
import * as kawai from './adapters/kawai-tokumo-history.mjs';

export const ADAPTERS = [kawai];

function vaultRoot() {
  const dir = process.env.STUDY_AI_VAULT_DIR;
  if (!dir) throw new Error('STUDY_AI_VAULT_DIR が未設定です。');
  return path.resolve(dir);
}

function nowJst() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}+09:00`;
}

export async function ingestArtifact(relPath, { ingestedAt = nowJst(), dryRun = false } = {}) {
  const root = vaultRoot();
  const file = path.resolve(root, relPath);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    throw new Error(`relPath が vault の外を指しています: ${relPath}`);
  }
  if (!existsSync(file)) throw new Error(`ファイルが見つかりません: ${relPath}`);
  if (path.extname(file).toLowerCase() !== '.pdf') {
    return { adapter: null, reason: 'not-a-pdf', attempts: 0, added: 0, unchanged: 0, unknownMarks: 0 };
  }

  for (const adapter of ADAPTERS) {
    let matched = false;
    try {
      matched = adapter.detect(file);
    } catch {
      matched = false;
    }
    if (!matched) continue;

    const { attempts, unknownMarks } = await adapter.extract({ file, artifactRef: relPath, ingestedAt });
    const result = dryRun ? { added: 0, unchanged: 0 } : await appendAttempts(attempts);
    return {
      adapter: adapter.ADAPTER.name,
      attempts: attempts.length,
      added: result.added,
      unchanged: result.unchanged,
      unknownMarks,
      ...(dryRun ? { dryRun: true } : {}),
    };
  }

  return { adapter: null, reason: 'no-matching-adapter', attempts: 0, added: 0, unchanged: 0, unknownMarks: 0 };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const relPath = process.argv[2];
  if (!relPath) {
    console.error('使い方: node analysis/helpers/ingest-artifact.mjs <vault相対パス>');
    process.exit(1);
  }
  ingestArtifact(relPath)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
