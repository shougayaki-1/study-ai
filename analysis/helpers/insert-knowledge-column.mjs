#!/usr/bin/env node
// knowledge_columns への挿入(知識系科目の弱点補強コラム)
// 使い方: node helpers/insert-knowledge-column.mjs '<JSONオブジェクト>'
//   例: {"subject_id":"...","unit_id":"...","topic_tag":"EU統合","title":"EU統合の歴史と仕組み",
//        "body_md":"...","trigger_reason":"正答率38%が3週間継続","weakness_score_at_generation":1.2,
//        "analysis_run_id":"..."}
import { restClient, printJson } from './lib.mjs';
import { readFileSync } from 'node:fs';

const arg = process.argv[2];
if (!arg) {
  console.error("使い方: node helpers/insert-knowledge-column.mjs '<JSONオブジェクト>' | -(標準入力)");
  process.exit(1);
}
const raw = arg === '-' ? readFileSync(0, 'utf8') : arg;
const row = JSON.parse(raw);
if (!row.subject_id || !row.title || !row.body_md) {
  throw new Error('knowledge_columnには subject_id, title, body_md が必要です');
}

const db = restClient();
const inserted = await db.insert('knowledge_columns', [row]);
printJson(inserted);
