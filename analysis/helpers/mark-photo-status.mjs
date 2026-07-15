#!/usr/bin/env node
// photos.status / analyzed_at / result_json を更新する
// 使い方: node helpers/mark-photo-status.mjs <photo_id> <analyzed|failed> ['<result_json>']
import { restClient, printJson } from './lib.mjs';

const [, , photoId, status, resultJsonArg] = process.argv;
if (!photoId || !['analyzed', 'failed'].includes(status)) {
  console.error('使い方: node helpers/mark-photo-status.mjs <photo_id> <analyzed|failed> [\'<result_json>\']');
  process.exit(1);
}

const patch = {
  status,
  analyzed_at: new Date().toISOString(),
};
if (resultJsonArg) {
  patch.result_json = JSON.parse(resultJsonArg);
}

const db = restClient();
const updated = await db.update('photos', patch, `id=eq.${photoId}`);
printJson(updated);
