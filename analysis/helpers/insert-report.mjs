#!/usr/bin/env node
// reports への挿入(日次/週次レポート)
// 使い方: node helpers/insert-report.mjs <daily|weekly> <本文Markdownファイルパス>
//   もしくは: node helpers/insert-report.mjs <daily|weekly> - (標準入力からMarkdownを読む)
import { restClient, printJson } from './lib.mjs';
import { readFileSync } from 'node:fs';

const [, , kind, bodyPathOrDash, analysisRunId] = process.argv;
if (!['daily', 'weekly'].includes(kind) || !bodyPathOrDash) {
  console.error('使い方: node helpers/insert-report.mjs <daily|weekly> <mdファイルパス|->');
  process.exit(1);
}
const body_md = bodyPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(bodyPathOrDash, 'utf8');

const db = restClient();
const inserted = await db.insert('reports', [{ kind, body_md, analysis_run_id: analysisRunId || null }]);
printJson(inserted);
