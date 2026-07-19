#!/usr/bin/env node
// Notionの「模試マスター」DB群(模試マスター/科目別成績/設問・失点分析ログ)から取得した
// JSONを mock_exams / mock_exam_scores / question_results に変換して投入する。
//
// NotionのMCPはOAuth認証のため、このスクリプト単体ではNotionから直接データを取得できない。
// 対話セッションでNotionのMCPツール(notion-query-data-sources等)を使って3つのJSONファイルを
// 作成した上で、このスクリプトを実行する想定。
//
// 使い方:
//   node helpers/import-notion-mock-exams.mjs <exams.json> <scores.json> <logs.json> [placeholder_photo_id] [--replace-legacy]
//
// 入力ファイルの形式は analysis/tmp/notion-exams.json 等を参照。
import { restClient, printJson } from './lib.mjs';
import { readFileSync } from 'node:fs';

const [, , examsPath, scoresPath, logsPath, photoIdArg, ...flags] = process.argv;
if (!examsPath || !scoresPath || !logsPath) {
  console.error('使い方: node helpers/import-notion-mock-exams.mjs <exams.json> <scores.json> <logs.json> [placeholder_photo_id] [--replace-legacy]');
  process.exit(1);
}
const replaceLegacy = flags.includes('--replace-legacy') || photoIdArg === '--replace-legacy';

const notionExams = JSON.parse(readFileSync(examsPath, 'utf8'));
const notionScores = JSON.parse(readFileSync(scoresPath, 'utf8'));
const notionLogs = JSON.parse(readFileSync(logsPath, 'utf8'));

const PROVIDER_MAP = { '東進': 'toshin', '河合塾': 'kawai' };
// Notionの科目名 -> このアプリのsubjects.name
const SUBJECT_MAP = {
  '情報1': '情報', '地学基礎': '地学基礎', '化学基礎': '化学基礎', '政治経済': '政治経済',
  '地理': '地理', '英語L': '英語L', '英語R': '英語R', '数学2BC': '数学2BC', '数学1A': '数学IA',
};
// 国語の分析項目(大問の呼び名)から実際の科目を判定する
function kokugoSubjectFromLabel(label) {
  if (label.includes('古文')) return '古文';
  if (label.includes('漢文')) return '漢文';
  return '現代文'; // 論理・小説・実用的 はいずれも現代文
}
const db = restClient();
const subjects = await db.select('subjects', 'select=id,name');
const maps = await db.select('common_test_unit_map', 'select=subject_id,exam_year,section,unit_id,confidence');
const photos = await db.select('photos', 'select=id,kind&kind=eq.notion_import&limit=1');
const photoId = photoIdArg && photoIdArg !== '--replace-legacy' ? photoIdArg : photos[0]?.id;
if (!photoId) throw new Error('notion_import用のplaceholder_photo_idが見つかりません');
const subjectIdByName = new Map(subjects.map((s) => [s.name, s.id]));

function normalizeSection(value) {
  const match = String(value ?? '').match(/(?:第|大問)(\d+)問?/);
  return match ? `大問${match[1]}` : String(value ?? '');
}

function findUnitId(subjectName, section, examYear) {
  const subjectId = subjectIdByName.get(subjectName);
  if (!subjectId) return null;
  const candidates = maps.filter((row) => row.subject_id === subjectId && row.section === normalizeSection(section) && Number(row.confidence) >= 0.8);
  return candidates.find((row) => row.exam_year === examYear)?.unit_id
    ?? candidates.find((row) => row.exam_year == null)?.unit_id
    ?? null;
}

// 1. mock_exams を参照URLで冪等化。旧行はタイトル+日付で引き継ぐ。
const existingExams = await db.select('mock_exams', 'select=id,exam_title,taken_date,source,source_ref');
const examIdByUrl = new Map();
for (const exam of notionExams) {
  const payload = {
    photo_id: photoId, provider: PROVIDER_MAP[exam['主催']] ?? 'toshin', exam_title: exam.exam_title,
    taken_date: exam.taken_date, total_deviation: exam.total_deviation ?? null,
    source: 'notion_import', source_ref: exam.url,
  };
  const existing = existingExams.find((row) => row.source_ref === exam.url || (row.exam_title === exam.exam_title && row.taken_date === exam.taken_date));
  const [row] = existing
    ? await db.update('mock_exams', payload, `id=eq.${existing.id}`)
    : await db.upsert('mock_exams', [payload], 'source,source_ref');
  examIdByUrl.set(exam.url, row.id);
}
console.error(`mock_exams: ${examIdByUrl.size}件挿入`);

// 2. mock_exam_scores 挿入(国語=複数科目の合算のため、単一科目に紐付けできずスキップ)
const scoreIdToInfo = new Map(); // score_url -> { subjectName, mockExamId }
const existingScores = await db.select('mock_exam_scores', 'select=id,mock_exam_id,subject_id,source_ref');
let savedScores = 0;
let skippedKokugo = 0;
for (const score of notionScores) {
  const mockExamId = examIdByUrl.get(score.exam_url);
  if (!mockExamId) continue;
  if (score['科目名'] === '国語') {
    // 現代文/古文/漢文の合算のため mock_exam_scores には入れない(question_results側で分解する)
    scoreIdToInfo.set(score.url, { subjectName: null, mockExamId });
    skippedKokugo++;
    continue;
  }
  const subjectName = SUBJECT_MAP[score['科目名']] ?? score['科目名'];
  const subjectId = subjectIdByName.get(subjectName);
  scoreIdToInfo.set(score.url, { subjectName, mockExamId });
  if (!subjectId) continue;
  const payload = {
    mock_exam_id: mockExamId,
    subject_id: subjectId,
    score: score['得点'] ?? null,
    deviation_value: score['偏差値'] ?? null,
    source_ref: score.url,
  };
  const existing = existingScores.find((row) => row.source_ref === score.url || (row.mock_exam_id === mockExamId && row.subject_id === subjectId));
  if (existing) await db.update('mock_exam_scores', payload, `id=eq.${existing.id}`);
  else await db.upsert('mock_exam_scores', [payload], 'source_ref');
  savedScores++;
}
console.error(`mock_exam_scores: ${savedScores}件保存(国語${skippedKokugo}件は科目複合のためスキップ)`);

// 3. question_results 挿入
const questionRows = [];
for (const log of notionLogs) {
  const info = scoreIdToInfo.get(log.score_url);
  if (!info) continue;
  const label = log['分析項目'];
  const subjectName = info.subjectName ?? kokugoSubjectFromLabel(label);
  const subjectId = subjectIdByName.get(subjectName);
  if (!subjectId) continue;
  const scoreRate = log['得点率'];
  const causes = log['失点原因'] ?? [];
  const errorType = causes.includes('知識・基礎力不足') ? 'knowledge'
    : causes.includes('読解・思考プロセスミス') ? 'reading'
    : causes.includes('戦略・時間配分ミス') ? 'logic'
    : causes.includes('ケアレスミス') ? 'calc'
    : null;
  const exam = notionExams.find((row) => row.url === notionScores.find((score) => score.url === log.score_url)?.exam_url);
  const unitId = findUnitId(subjectName, log['大問番号'], exam?.taken_date ? Number(exam.taken_date.slice(0, 4)) : null);
  questionRows.push({
    photo_id: photoId,
    subject_id: subjectId,
    unit_id: unitId,
    question_label: label,
    is_correct: null,
    score_rate: scoreRate ?? null,
    result_granularity: 'section',
    error_type: scoreRate != null && scoreRate < 70 ? errorType : null,
    source: 'notion_import',
    source_ref: log.url,
    confidence: unitId ? 0.85 : 0.4,
    corrected_at: log['復習'] ? new Date().toISOString() : null,
    raw_topic_tags: { 分析項目: label, 大問番号: log['大問番号'], 得点率: scoreRate, 失点原因の分類: causes, 復習状況: log['復習'], corrected_at_is_migration_time: Boolean(log['復習']) },
    mock_exam_id: info.mockExamId,
  });
}
// PostgRESTの一括insertは全行で同じキー集合が必要なため、バッチに分けて投入する
const BATCH = 50;
let inserted = 0;
for (let i = 0; i < questionRows.length; i += BATCH) {
  const batch = questionRows.slice(i, i + BATCH);
  await db.upsert('question_results', batch, 'source,source_ref');
  inserted += batch.length;
}
console.error(`question_results: ${inserted}件挿入`);

if (inserted !== notionLogs.length) throw new Error(`再取込件数が一致しません: expected=${notionLogs.length}, actual=${inserted}`);
if (replaceLegacy) {
  const removed = await db.remove('question_results', 'source=eq.notion_import&source_ref=is.null');
  console.error(`legacy question_results: ${removed.length}件削除`);
}

printJson({ exams: examIdByUrl.size, scores: savedScores, questionResults: inserted, legacyReplaced: replaceLegacy });
