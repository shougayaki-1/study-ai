#!/usr/bin/env node
// 単元マスタ一覧(科目名つき)を取得する。unit_id の名寄せに使う。
// 使い方: node helpers/list-units.mjs
import { restClient, printJson } from './lib.mjs';

const db = restClient();
const subjects = await db.select('subjects', 'select=id,name,color,sort_order&order=sort_order.asc');
const units = await db.select('units', 'select=id,subject_id,name,sort_order&order=subject_id,sort_order.asc');
const bySubject = new Map(subjects.map((s) => [s.id, s.name]));
printJson(
  units.map((u) => ({ ...u, subject_name: bySubject.get(u.subject_id) || null }))
);
