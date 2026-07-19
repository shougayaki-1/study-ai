#!/usr/bin/env node
// pending写真の一覧を取得する
// 使い方: node helpers/list-pending-photos.mjs
import { restClient, printJson } from './lib.mjs';

const db = restClient();
const rows = await db.select(
  'photos',
  'status=eq.pending&select=id,session_id,storage_path,original_name,kind,created_at&order=created_at.asc'
);
const sessionIds = [...new Set(rows.map((row) => row.session_id).filter(Boolean))];
const sessions = sessionIds.length
  ? await db.select('study_sessions', `select=id,subject_id& id=in.(${sessionIds.join(',')})`.replace('& ', '&'))
  : [];
const subjectBySession = new Map(sessions.map((row) => [row.id, row.subject_id]));
printJson(rows.map((row) => ({ ...row, subject_id: subjectBySession.get(row.session_id) ?? null })));
