#!/usr/bin/env node
// mock_exams(模試サマリ) + mock_exam_scores(科目別得点)への挿入
// 使い方: node helpers/insert-mock-exam.mjs '<模試サマリJSON>' '<科目別得点JSON配列>'
//   模試サマリJSON例:
//     {"photo_id":"...","exam_title":"2024年 大学入学共通テスト 地理","taken_date":"2026-05-09","total_score":81,"total_deviation":null,"judgments_json":null}
//   科目別得点JSON配列例:
//     [{"subject_id":"...","score":81,"max_score":100,"score_rate":81.0,"deviation_value":null,"national_avg_score":null,"rank":null,"total_test_takers":null}]
import { restClient, printJson } from './lib.mjs';

const [, , examArg, scoresArg] = process.argv;
if (!examArg || !scoresArg) {
  console.error("使い方: node helpers/insert-mock-exam.mjs '<模試サマリJSON>' '<科目別得点JSON配列>'");
  process.exit(1);
}
const examRow = JSON.parse(examArg);
const scoreRows = JSON.parse(scoresArg);

const db = restClient();
const [exam] = await db.insert('mock_exams', [examRow]);
const scoresWithExamId = scoreRows.map((row) => ({ ...row, mock_exam_id: exam.id }));
const scores = await db.insert('mock_exam_scores', scoresWithExamId);
printJson({ exam, scores });
