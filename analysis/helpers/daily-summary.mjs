#!/usr/bin/env node
// 日次レポート作成のための集計データを取得する(過去1日分の勉強時間・正誤状況など)
// 使い方: node helpers/daily-summary.mjs [sinceISODate]
//   省略時は過去24時間
import { restClient, printJson } from './lib.mjs';

const since = process.argv[2] || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const db = restClient();
const [sessions, results, essays, subjects, units] = await Promise.all([
  db.select('study_sessions', `select=*&started_at=gte.${since}&order=started_at.asc`),
  db.select('question_results', `select=*&created_at=gte.${since}`),
  db.select('essay_reviews', `select=*&created_at=gte.${since}`),
  db.select('subjects', 'select=id,name'),
  db.select('units', 'select=id,subject_id,name'),
]);

const subjectById = new Map(subjects.map((s) => [s.id, s]));
const unitById = new Map(units.map((u) => [u.id, u]));

const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
const bySubject = {};
for (const s of sessions) {
  const name = subjectById.get(s.subject_id)?.name || 'unknown';
  bySubject[name] = (bySubject[name] || 0) + s.minutes;
}

const correctCount = results.filter((r) => r.is_correct === true).length;
const incorrectCount = results.filter((r) => r.is_correct === false).length;

printJson({
  since,
  totalMinutes,
  minutesBySubject: bySubject,
  sessions,
  questionResults: results.map((r) => ({
    ...r,
    unit_name: unitById.get(r.unit_id)?.name || null,
  })),
  correctCount,
  incorrectCount,
  essayReviews: essays,
});
