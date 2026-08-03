import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  extractReportCharts,
  reportChartRelPath,
  writeReportChartFile,
} from '../helpers/report-charts.mjs';

test('extractReportCharts collects chart fields keyed by heading, skipping sections without one', () => {
  const charts = extractReportCharts([
    {
      heading: 'A',
      body: 'x',
      chart: {
        type: 'bar',
        unit: '分',
        series: [{ label: 'L', value: 1 }],
      },
    },
    { heading: 'B', body: 'y' },
  ]);
  assert.deepEqual(charts, {
    A: {
      type: 'bar',
      unit: '分',
      series: [{ label: 'L', value: 1 }],
    },
  });
});

test('reportChartRelPath swaps the .md extension for .chart.json', () => {
  assert.equal(
    reportChartRelPath('reports/weekly/2026-W31.md'),
    'reports/weekly/2026-W31.chart.json',
  );
});

test('writeReportChartFile writes a sidecar file and returns its path when charts exist', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'study-ai-vault-'));
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    const relPath = await writeReportChartFile(
      'reports/weekly/2026-W31.md',
      [
        {
          heading: '学習時間推移',
          body: 'x',
          chart: {
            type: 'bar',
            unit: '分',
            series: [{ label: '英語R', value: 90 }],
          },
        },
      ],
    );
    assert.equal(relPath, 'reports/weekly/2026-W31.chart.json');
    const written = JSON.parse(
      await readFile(path.join(vaultDir, relPath), 'utf8'),
    );
    assert.deepEqual(written, {
      学習時間推移: {
        type: 'bar',
        unit: '分',
        series: [{ label: '英語R', value: 90 }],
      },
    });
  } finally {
    delete process.env.STUDY_AI_VAULT_DIR;
  }
});

test('writeReportChartFile removes a stale sidecar file and returns null when no section has a chart', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'study-ai-vault-'));
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await mkdir(path.join(vaultDir, 'reports', 'daily'), { recursive: true });
    await writeFile(
      path.join(vaultDir, 'reports', 'daily', '2026-08-01.chart.json'),
      '{}',
      'utf8',
    );
    const result = await writeReportChartFile(
      'reports/daily/2026-08-01.md',
      [{ heading: 'A', body: 'x' }],
    );
    assert.equal(result, null);
    await assert.rejects(
      access(
        path.join(vaultDir, 'reports', 'daily', '2026-08-01.chart.json'),
      ),
    );
  } finally {
    delete process.env.STUDY_AI_VAULT_DIR;
  }
});
