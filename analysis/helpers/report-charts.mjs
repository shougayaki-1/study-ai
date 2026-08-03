// sections[].chart から見出しごとのグラフデータを抽出し、レポート本体とは別の
// JSONサイドカーファイル(<report>.chart.json)として書き出す。
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vaultRoot } from './vault/root.mjs';

export function extractReportCharts(sections) {
  const charts = {};
  for (const section of sections) {
    if (section.chart) charts[section.heading] = section.chart;
  }
  return charts;
}

export function reportChartRelPath(reportRelPath) {
  return reportRelPath.replace(/\.md$/, '.chart.json');
}

export async function writeReportChartFile(reportRelPath, sections) {
  const charts = extractReportCharts(sections);
  const relPath = reportChartRelPath(reportRelPath);
  const fullPath = path.join(vaultRoot(), relPath);
  if (Object.keys(charts).length === 0) {
    await unlink(fullPath).catch(() => {});
    return null;
  }
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(charts, null, 2)}\n`, 'utf8');
  return relPath;
}
