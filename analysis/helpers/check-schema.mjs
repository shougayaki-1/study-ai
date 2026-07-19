#!/usr/bin/env node
// 夜間処理前の互換性確認。必要カラムを含むselectが成功すればOK。
import { restClient, printJson } from './lib.mjs';

const db = restClient();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastError;
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    await Promise.all([
      db.select('photos', 'select=id,file_hash,original_name,mime_type,byte_size&limit=1'),
      db.select('question_results', 'select=id,subject_id,score_rate,result_granularity,source_ref&limit=1'),
      db.select('review_tasks', 'select=id,subject_id,unit_id&limit=1'),
      db.select('common_test_unit_map', 'select=id&limit=1'),
      db.select('mock_exam_section_timings', 'select=id&limit=1'),
    ]);
    printJson({ schemaCompatible: true, attempts: attempt });
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 6) await wait(5000);
  }
}
throw lastError;
