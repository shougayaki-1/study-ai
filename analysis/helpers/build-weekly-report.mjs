#!/usr/bin/env node
// reports/weekly/YYYY-Www.md を生成し書き出す(日曜のみnightly.mdから呼ばれる)。夜間バッチ固有。
// 使い方: node analysis/helpers/build-weekly-report.mjs <weekStr(YYYY-Www)> <reportDataJSONFile|->
//   reportDataJSON: {"sections":[{"heading":"学習時間推移","body":"..."}, ...]}
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { printJson } from './lib.mjs';

export function buildWeeklyReportBody({ week, sections }) {
  const parts = [`# ${week} 週次レポート`];
  for (const section of sections) {
    parts.push('', `## ${section.heading}`, '', section.body.trim());
  }
  return `${parts.join('\n').trimEnd()}\n`;
}

export function buildWeeklyReportFrontmatter(week, updatedAt) {
  return {
    type: 'weekly-report',
    week,
    source: 'nightly-batch',
    schema_version: 1,
    updated: updatedAt,
  };
}

export async function run([weekStr, dataPathOrDash]) {
  if (!weekStr || !dataPathOrDash) {
    throw new Error('使い方: node helpers/build-weekly-report.mjs <weekStr> <reportDataJSONFile|->');
  }
  const raw = dataPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(dataPathOrDash, 'utf8');
  const data = JSON.parse(raw);
  const sections = data.sections ?? [];
  const updatedAt = new Date().toISOString();
  const frontmatter = buildWeeklyReportFrontmatter(weekStr, updatedAt);
  const body = buildWeeklyReportBody({ week: weekStr, sections });
  const { writeVaultFile } = await import('./vault/index.mjs');
  const relPath = `reports/weekly/${weekStr}.md`;
  await writeVaultFile(relPath, frontmatter, body);
  return { path: relPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  printJson(await run(process.argv.slice(2)));
}
