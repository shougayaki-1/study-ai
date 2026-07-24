import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReportBody, buildWeeklyReportFrontmatter } from '../helpers/build-weekly-report.mjs';

test('buildWeeklyReportFrontmatter uses the week field per contract weekly-report schema', () => {
  const fm = buildWeeklyReportFrontmatter('2026-W30', '2026-07-26T23:50:00+09:00');
  assert.equal(fm.type, 'weekly-report');
  assert.equal(fm.week, '2026-W30');
  assert.equal(fm.schema_version, 1);
});

test('buildWeeklyReportBody renders each section under its own heading', () => {
  const body = buildWeeklyReportBody({
    week: '2026-W30',
    sections: [
      { heading: '学習時間推移', body: '平均105分/日' },
      { heading: '来週の重点科目', body: '数学・日本史' },
    ],
  });
  assert.match(body, /^# 2026-W30 週次レポート/);
  assert.match(body, /## 学習時間推移/);
  assert.match(body, /平均105分\/日/);
  assert.match(body, /## 来週の重点科目/);
});
