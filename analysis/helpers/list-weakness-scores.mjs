#!/usr/bin/env node
// weakness_scores をスコア降順で取得(単元名・科目名つき)。復習提案の選定に使う。
// 使い方: node helpers/list-weakness-scores.mjs [limit]
import { restClient, printJson } from './lib.mjs';

const limit = Number(process.argv[2]) || 50;

const db = restClient();
const scores = await db.select('weakness_scores', `select=*&order=score.desc&limit=${limit}`);
const units = await db.select('units', 'select=id,subject_id,name');
const subjects = await db.select('subjects', 'select=id,name');

const unitById = new Map(units.map((u) => [u.id, u]));
const subjectById = new Map(subjects.map((s) => [s.id, s]));

printJson(
  scores.map((s) => {
    const unit = unitById.get(s.unit_id);
    const subject = unit ? subjectById.get(unit.subject_id) : null;
    return {
      ...s,
      unit_name: unit?.name || null,
      subject_name: subject?.name || null,
    };
  })
);
