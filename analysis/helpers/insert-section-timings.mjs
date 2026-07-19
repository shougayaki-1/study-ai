#!/usr/bin/env node
// 模試の大問別実施時間・目標時間を冪等保存する。
// JSON: [{"mock_exam_score_id":"...","section":"大問1","actual_seconds":720,"target_seconds":600,"source_photo_id":"..."}]
import { readFileSync } from 'node:fs';
import { restClient, printJson } from './lib.mjs';

const arg = process.argv[2];
if (!arg) throw new Error('JSON配列または - を指定してください');
const parsed = JSON.parse(arg === '-' ? readFileSync(0, 'utf8') : arg);
const rows = Array.isArray(parsed) ? parsed : [parsed];
for (const row of rows) {
  if (!row.mock_exam_score_id || !row.section) throw new Error('mock_exam_score_id と section は必須です');
  if (row.actual_seconds == null && row.target_seconds == null) throw new Error('actual_seconds または target_seconds が必要です');
}
const inserted = await restClient().upsert('mock_exam_section_timings', rows.map((row) => ({ ...row, updated_at: new Date().toISOString() })), 'mock_exam_score_id,section');
printJson(inserted);
