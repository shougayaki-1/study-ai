#!/usr/bin/env node
// question_results への挿入
// 使い方: node helpers/insert-question-results.mjs '<JSON配列 または JSONオブジェクト>'
//   例: node helpers/insert-question-results.mjs '[{"photo_id":"...","unit_id":"...","question_label":"大問2(1)","is_correct":false,"error_type":"calc"}]'
// もしくは標準入力からJSONを渡す: cat rows.json | node helpers/insert-question-results.mjs -
import { restClient, printJson } from './lib.mjs';
import { readFileSync } from 'node:fs';

const arg = process.argv[2];
if (!arg) {
  console.error('使い方: node helpers/insert-question-results.mjs \'<JSON配列>\' | -(標準入力)');
  process.exit(1);
}
const raw = arg === '-' ? readFileSync(0, 'utf8') : arg;
const rows = JSON.parse(raw);

const db = restClient();
const inserted = await db.insert('question_results', Array.isArray(rows) ? rows : [rows]);
printJson(inserted);
