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
const parsed = JSON.parse(raw);
const rows = Array.isArray(parsed) ? parsed : [parsed];

const db = restClient();
const units = await db.select('units', 'select=id,subject_id');
const subjectByUnit = new Map(units.map((row) => [row.id, row.subject_id]));
const photoIds = [...new Set(rows.map((row) => row.photo_id).filter(Boolean))];
const photos = photoIds.length ? await db.select('photos', `select=id,session_id&id=in.(${photoIds.join(',')})`) : [];
const sessionIds = [...new Set(photos.map((row) => row.session_id).filter(Boolean))];
const sessions = sessionIds.length ? await db.select('study_sessions', `select=id,subject_id&id=in.(${sessionIds.join(',')})`) : [];
const sessionById = new Map(sessions.map((row) => [row.id, row]));
const photoById = new Map(photos.map((row) => [row.id, row]));
const normalized = rows.map((row, index) => ({
  ...row,
  subject_id: row.subject_id ?? subjectByUnit.get(row.unit_id) ?? sessionById.get(photoById.get(row.photo_id)?.session_id)?.subject_id ?? null,
  result_granularity: row.result_granularity ?? 'question',
  source: row.source ?? 'photo',
  source_ref: row.source_ref ?? `${row.photo_id}:${index}:${row.question_label ?? ''}`,
}));
for (const photoId of photoIds) await db.remove('question_results', `photo_id=eq.${photoId}`);
const inserted = await db.insert('question_results', normalized);
printJson(inserted);
