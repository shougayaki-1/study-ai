#!/usr/bin/env node
// Notionの「模試マスター」DB群(模試マスター/科目別成績/設問・失点分析ログ)から取得した
// JSONを mock_exams / mock_exam_scores / question_results に変換して投入する。
//
// NotionのMCPはOAuth認証のため、このスクリプト単体ではNotionから直接データを取得できない。
// 対話セッションでNotionのMCPツール(notion-query-data-sources等)を使って3つのJSONファイルを
// 作成した上で、このスクリプトを実行する想定。
//
// 使い方:
//   node helpers/import-notion-mock-exams.mjs <exams.json> <scores.json> <logs.json> <placeholder_photo_id>
//
// 入力ファイルの形式は analysis/tmp/notion-exams.json 等を参照。
import { restClient, printJson } from './lib.mjs';
import { readFileSync } from 'node:fs';

const [, , examsPath, scoresPath, logsPath, photoId] = process.argv;
if (!examsPath || !scoresPath || !logsPath || !photoId) {
  console.error('使い方: node helpers/import-notion-mock-exams.mjs <exams.json> <scores.json> <logs.json> <placeholder_photo_id>');
  process.exit(1);
}

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
// 高い確度でunit名が確定できる場合のみマッピングする(それ以外はunit_idをnullのままにする)
const UNIT_MAP = {
  '地学基礎': { '第1問': '地球の姿', '第2問': '大気と海洋', '第3問': '地球の歴史', '第4問': '宇宙の構成' },
  '現代文': { '第1問_論理': '評論文読解', '第2問_小説': '小説読解' },
};

const db = restClient();
const subjects = await db.select('subjects', 'select=id,name');
const units = await db.select('units', 'select=id,subject_id,name');
const subjectIdByName = new Map(subjects.map((s) => [s.name, s.id]));
const unitIdByKey = new Map(units.map((u) => [`${u.subject_id}:${u.name}`, u.id]));

function findUnitId(subjectName, notionSubjectLabelOrDaimon) {
  const subjectId = subjectIdByName.get(subjectName);
  if (!subjectId) return null;
  const table = UNIT_MAP[subjectName];
  if (!table) return null;
  const unitName = table[notionSubjectLabelOrDaimon];
  if (!unitName) return null;
  return unitIdByKey.get(`${subjectId}:${unitName}`) ?? null;
}

// 1. mock_exams 挿入
const examIdByUrl = new Map();
for (const exam of notionExams) {
  const [row] = await db.insert('mock_exams', [{
    photo_id: photoId,
    provider: PROVIDER_MAP[exam['主催']] ?? 'toshin',
    exam_title: exam.exam_title,
    taken_date: exam.taken_date,
    total_deviation: exam.total_deviation ?? null,
  }]);
  examIdByUrl.set(exam.url, row.id);
}
console.error(`mock_exams: ${examIdByUrl.size}件挿入`);

// 2. mock_exam_scores 挿入(国語=複数科目の合算のため、単一科目に紐付けできずスキップ)
const scoreIdToInfo = new Map(); // score_url -> { subjectName, mockExamId }
const scoreRows = [];
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
  scoreRows.push({
    mock_exam_id: mockExamId,
    subject_id: subjectId,
    score: score['得点'] ?? null,
    deviation_value: score['偏差値'] ?? null,
  });
}
if (scoreRows.length) await db.insert('mock_exam_scores', scoreRows);
console.error(`mock_exam_scores: ${scoreRows.length}件挿入(国語${skippedKokugo}件は科目複合のためスキップ)`);

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
  // 得点率は大問単位の部分点率であり単一設問の正誤ではないため、70%以上を「おおむね正解」として扱う
  // (このアプリの他の確信度しきい値と合わせた基準)
  const isCorrect = scoreRate == null ? null : scoreRate >= 70;
  const causes = log['失点原因'] ?? [];
  const errorType = causes.includes('知識・基礎力不足') ? 'knowledge'
    : causes.includes('読解・思考プロセスミス') ? 'reading'
    : causes.includes('戦略・時間配分ミス') ? 'logic'
    : causes.includes('ケアレスミス') ? 'calc'
    : null;
  const unitKey = subjectName === '地学基礎' ? log['大問番号'] : subjectName === '現代文' ? label : null;
  const unitId = findUnitId(subjectName, unitKey);
  questionRows.push({
    photo_id: photoId,
    unit_id: unitId,
    question_label: label,
    is_correct: isCorrect,
    error_type: isCorrect === false ? errorType : null,
    source: 'notion_import',
    confidence: unitId ? 0.85 : 0.4,
    raw_topic_tags: { 分析項目: label, 大問番号: log['大問番号'], 失点原因の分類: causes, 復習状況: log['復習'] },
    mock_exam_id: info.mockExamId,
  });
}
// PostgRESTの一括insertは全行で同じキー集合が必要なため、バッチに分けて投入する
const BATCH = 50;
let inserted = 0;
for (let i = 0; i < questionRows.length; i += BATCH) {
  const batch = questionRows.slice(i, i + BATCH);
  await db.insert('question_results', batch);
  inserted += batch.length;
}
console.error(`question_results: ${inserted}件挿入`);

printJson({ exams: examIdByUrl.size, scores: scoreRows.length, questionResults: inserted });
