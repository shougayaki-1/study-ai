#!/usr/bin/env node
// 直近で判読不能(status=failed)になった写真の一覧。日次レポートへの報告用。
// 使い方: node helpers/list-failed-photos.mjs [sinceISODate]
import { restClient, printJson } from './lib.mjs';

const since = process.argv[2] || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const db = restClient();
const rows = await db.select(
  'photos',
  `status=eq.failed&analyzed_at=gte.${since}&select=id,storage_path,kind,analyzed_at,result_json`
);
printJson(rows);
