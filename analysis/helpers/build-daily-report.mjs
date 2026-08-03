#!/usr/bin/env node
// reports/daily/YYYY-MM-DD.md の雛形(要確認TODO節を含む)を生成し書き出す。
// 契約3aの要確認TODO行書式を厳守する(WebのparseConfirmTodosが行単位でパースする)。
// 使い方: node analysis/helpers/build-daily-report.mjs <dateStr> <reportDataJSONFile|->
//   reportDataJSON: {"confirmTodos":[{"id":"todo-1","q":"...","options":["日本史","世界史"],"default":"日本史","ref":"_archive/..."}],
//                     "sections":[{"heading":"今日の学習時間","body":"..."}, ...]}
import { fileURLToPath } from 'node:url';
import { loadVaultEnv } from './vault/env.mjs';
import { readFileSync } from 'node:fs';
import { printJson } from './lib.mjs';

export function formatConfirmTodoLine(todo) {
  const parts = [
    `id=${todo.id}`,
    `q=${todo.q}`,
    `options=${todo.options.join(' / ')}`,
    `default=${todo.default}`,
  ];
  if (todo.ref) parts.push(`ref=${todo.ref}`);
  return `- [ ] ${parts.join(' | ')}`;
}

export function buildConfirmTodoSection(todos) {
  if (!todos.length) {
    return ['## 要確認TODO', '', '(今回は要確認事項なし)'].join('\n');
  }
  return ['## 要確認TODO', '', ...todos.map(formatConfirmTodoLine)].join('\n');
}

export function buildDailyReportBody({ date, confirmTodos, sections }) {
  const parts = [buildConfirmTodoSection(confirmTodos), '', `# ${date} 日次レポート`];
  for (const section of sections) {
    parts.push('', `## ${section.heading}`, '', section.body.trim());
  }
  return `${parts.join('\n').trimEnd()}\n`;
}

export function buildDailyReportFrontmatter(date, confirmTodos, updatedAt) {
  return {
    type: 'daily-report',
    date,
    confirm_todos: confirmTodos.length,
    source: 'nightly-batch',
    schema_version: 1,
    updated: updatedAt,
  };
}

export async function run([dateStr, dataPathOrDash]) {
  if (!dateStr || !dataPathOrDash) {
    throw new Error('使い方: node helpers/build-daily-report.mjs <dateStr> <reportDataJSONFile|->');
  }
  const raw = dataPathOrDash === '-' ? readFileSync(0, 'utf8') : readFileSync(dataPathOrDash, 'utf8');
  const data = JSON.parse(raw);
  const confirmTodos = data.confirmTodos ?? [];
  const sections = data.sections ?? [];
  const updatedAt = new Date().toISOString();
  const frontmatter = buildDailyReportFrontmatter(dateStr, confirmTodos, updatedAt);
  const body = buildDailyReportBody({ date: dateStr, confirmTodos, sections });
  const { writeVaultFile } = await import('./vault/index.mjs');
  const { writeReportChartFile } = await import('./report-charts.mjs');
  const relPath = `reports/daily/${dateStr}.md`;
  await writeVaultFile(relPath, frontmatter, body);
  const chartPath = await writeReportChartFile(relPath, sections);
  return { path: relPath, confirm_todos: confirmTodos.length, chartPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadVaultEnv();
  printJson(await run(process.argv.slice(2)));
}
