#!/usr/bin/env node
// pending写真の一覧を取得する
// 使い方: node helpers/list-pending-photos.mjs
import { restClient, printJson } from './lib.mjs';

const db = restClient();
const rows = await db.select(
  'photos',
  'status=eq.pending&select=id,session_id,storage_path,kind,created_at&order=created_at.asc'
);
printJson(rows);
