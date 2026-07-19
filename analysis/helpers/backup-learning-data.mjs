#!/usr/bin/env node
// 学習派生データをanalysis/tmp/backupsへ退避する。Git管理対象外であること。
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { restClient, printJson, TMP_DIR } from './lib.mjs';

const db = restClient();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(TMP_DIR, 'backups', stamp);
mkdirSync(outputDir, { recursive: true });

const tables = ['question_results', 'mock_exams', 'mock_exam_scores', 'review_tasks', 'unit_state_snapshots'];
const counts = {};
for (const table of tables) {
  const rows = await db.select(table, 'select=*');
  writeFileSync(path.join(outputDir, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  counts[table] = rows.length;
}
printJson({ outputDir, counts });
