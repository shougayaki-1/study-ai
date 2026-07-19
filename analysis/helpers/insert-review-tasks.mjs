#!/usr/bin/env node
// review_tasks への挿入(3〜5件)
// 使い方: node helpers/insert-review-tasks.mjs '<JSON配列>'
//   例: [{"unit_id":"...","material_id":"...","range_text":"青チャート 例題40〜43","reason":"正答率52%、5日未学習","due_date":"2026-07-16"}]
import { restClient, printJson } from './lib.mjs';
import { readFileSync } from 'node:fs';

const arg = process.argv[2];
if (!arg) {
  console.error('使い方: node helpers/insert-review-tasks.mjs \'<JSON配列>\' | -(標準入力)');
  process.exit(1);
}
const raw = arg === '-' ? readFileSync(0, 'utf8') : arg;
const rows = JSON.parse(raw);
const arr = Array.isArray(rows) ? rows : [rows];
if (arr.length < 3 || arr.length > 5) {
  console.error(`警告: review_tasksは3〜5件を想定していますが ${arr.length}件です。DESIGN.md セクション6を確認してください。`);
}

const db = restClient();
for (const row of arr) {
  if (!row.reason || !row.range_text || !row.estimated_minutes || !row.source_kind) {
    throw new Error('各review_taskには reason, range_text, estimated_minutes, source_kind が必要です');
  }
  if (!row.unit_id && !row.subject_id) throw new Error('各review_taskには unit_id または subject_id が必要です');
}
const inserted = await db.insert('review_tasks', arr);
printJson(inserted);
