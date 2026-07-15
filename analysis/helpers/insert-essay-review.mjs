#!/usr/bin/env node
// essay_reviews への挿入
// 使い方: node helpers/insert-essay-review.mjs '<JSONオブジェクト>'
//   例: node helpers/insert-essay-review.mjs '{"photo_id":"...","structure_comment":"...","logic_comment":"...","vocab_comment":"...","overall":"..."}'
import { restClient, printJson } from './lib.mjs';
import { readFileSync } from 'node:fs';

const arg = process.argv[2];
if (!arg) {
  console.error('使い方: node helpers/insert-essay-review.mjs \'<JSONオブジェクト>\' | -(標準入力)');
  process.exit(1);
}
const raw = arg === '-' ? readFileSync(0, 'utf8') : arg;
const row = JSON.parse(raw);

const db = restClient();
const inserted = await db.insert('essay_reviews', [row]);
printJson(inserted);
