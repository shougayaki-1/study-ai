#!/usr/bin/env node
// 直近生成された knowledge_columns を取得する(重複生成の回避に使う)
// 使い方: node helpers/list-recent-columns.mjs [days=14]
import { restClient, printJson } from './lib.mjs';

const days = Number(process.argv[2] ?? 14);
const since = new Date(Date.now() - days * 86400000).toISOString();

const db = restClient();
const rows = await db.select(
  'knowledge_columns',
  `select=id,subject_id,unit_id,topic_tag,title,created_at&created_at=gte.${since}&order=created_at.desc`
);
printJson(rows);
