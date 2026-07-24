import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunFinishFrontmatter, buildRunFinishBody } from '../helpers/finish-run.mjs';

test('finish frontmatter keeps started_at and adds completion fields required by run-log schema', () => {
  const existing = { type: 'run-log', date: '2026-07-24', started_at: '2026-07-24T23:30:00.000Z', source: 'nightly-batch', schema_version: 1, updated: '2026-07-24T23:30:00.000Z' };
  const fm = buildRunFinishFrontmatter(existing, { finishedAt: '2026-07-25T00:10:00.000Z', processed: 5, needsConfirmation: 2, status: 'ok' });
  assert.equal(fm.started_at, '2026-07-24T23:30:00.000Z');
  assert.equal(fm.finished_at, '2026-07-25T00:10:00.000Z');
  assert.equal(fm.processed, 5);
  assert.equal(fm.needs_confirmation, 2);
  assert.equal(fm.status, 'ok');
  assert.equal(fm.updated, '2026-07-25T00:10:00.000Z');
});

test('finish body replaces the in-progress section with a completion summary', () => {
  const existingBody = '# ラン記録 2026-07-24\n\n## 実行中\n\n- 開始しました。完了時にこのセクションを完了報告へ置き換えます。\n';
  const body = buildRunFinishBody(existingBody, ['写真5件処理(analyzed 4 / failed 1)', '要確認TODO 2件']);
  assert.doesNotMatch(body, /実行中/);
  assert.match(body, /## 完了/);
  assert.match(body, /写真5件処理/);
  assert.match(body, /要確認TODO 2件/);
});

test('finish body falls back to a no-remarks line when summary has no entries', () => {
  const body = buildRunFinishBody('# ラン記録 2026-07-24\n\n## 実行中\n\n- 開始しました。\n', []);
  assert.match(body, /特記事項なし/);
});
