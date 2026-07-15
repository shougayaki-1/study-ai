#!/usr/bin/env node
// 教材マスタ一覧を取得する。review_tasks の material_id 選定に使う。
// 使い方: node helpers/list-materials.mjs
import { restClient, printJson } from './lib.mjs';

const db = restClient();
const rows = await db.select('materials', 'select=id,subject_id,name,kind&order=subject_id');
printJson(rows);
