#!/usr/bin/env node
// weakness_scores を全置換で再計算する (DESIGN.md セクション4の式)
//   score = (1 - 直近30件の正答率) × (1 + log(1 + 経過日数) / 2)
// 経過日数: その単元の最終学習日(study_sessions.started_at の最大値。
//   なければ question_results.created_at の最大値)から今日までの日数。
// 正答率: その単元の question_results を created_at 降順で直近30件に絞って算出。
//   件数が0の場合はスコア計算不能なので0件スキップ(既存レコードは削除される=表示から消える)。
// 使い方: node helpers/recompute-weakness-scores.mjs
import { restClient, printJson } from './lib.mjs';

const db = restClient();

const units = await db.select('units', 'select=id,subject_id');
const results = await db.select(
  'question_results',
  'select=unit_id,is_correct,created_at&unit_id=not.is.null&order=created_at.desc'
);
const sessions = await db.select(
  'study_sessions',
  'select=unit_id,started_at&unit_id=not.is.null&order=started_at.desc'
);
// 完了済みの復習提案も「学習した」信号として扱う(正誤データが伴わない自己申告でも
// 忘却スコアをリセットしてよい、という運用方針による)。
const completedTasks = await db.select(
  'review_tasks',
  'select=unit_id,completed_at&status=eq.completed&completed_at=not.is.null&order=completed_at.desc'
);

const now = Date.now();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const byUnitResults = new Map();
for (const r of results) {
  const list = byUnitResults.get(r.unit_id) || [];
  if (list.length < 30) list.push(r); // 既にcreated_at降順なので先頭30件=直近30件
  byUnitResults.set(r.unit_id, list);
}

// 「最終学習日」は study_sessions / question_results / 完了済み review_tasks の
// 3つの信号のうち最も新しいものを採用する(復習タスク完了は正誤データが無くても
// 忘却の時計をリセットしてよい、という運用方針による)。
const lastStudiedByUnit = new Map();
const considerSignal = (unitId, timestamp) => {
  if (!unitId || !timestamp) return;
  const cur = lastStudiedByUnit.get(unitId);
  if (!cur || new Date(timestamp) > new Date(cur)) lastStudiedByUnit.set(unitId, timestamp);
};
for (const s of sessions) considerSignal(s.unit_id, s.started_at);
for (const r of results) considerSignal(r.unit_id, r.created_at);
for (const t of completedTasks) considerSignal(t.unit_id, t.completed_at);

const rows = [];
for (const unit of units) {
  const list = byUnitResults.get(unit.id);
  if (!list || list.length === 0) continue; // データが無い単元はスコア対象外

  const correctCount = list.filter((r) => r.is_correct === true).length;
  const accuracy = correctCount / list.length;

  const lastStudiedAt = lastStudiedByUnit.get(unit.id) || null;
  const elapsedDays = lastStudiedAt
    ? Math.max(0, (now - new Date(lastStudiedAt).getTime()) / MS_PER_DAY)
    : 999; // 学習記録が無ければ「長期間未学習」扱いで重く見る

  const forgetWeight = 1 + Math.log(1 + elapsedDays) / 2;
  const score = (1 - accuracy) * forgetWeight;

  rows.push({
    unit_id: unit.id,
    score: Math.round(score * 1000) / 1000,
    accuracy: Math.round(accuracy * 1000) / 1000,
    last_studied_at: lastStudiedAt,
    computed_at: new Date().toISOString(),
  });
}

// 全置換: 既存を全削除してから挿入 (仕様: weakness_scoresは夜間バッチが全置換)
await db.remove('weakness_scores', 'id=not.is.null');
const inserted = rows.length ? await db.insert('weakness_scores', rows) : [];
printJson({ recomputed: inserted.length, rows: inserted });
