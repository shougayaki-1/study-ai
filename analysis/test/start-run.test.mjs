import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunStartFrontmatter, buildRunStartBody } from '../helpers/start-run.mjs';

test('run-log start frontmatter matches contract run-log schema fields available at start', () => {
  const fm = buildRunStartFrontmatter('2026-07-24', '2026-07-24T23:30:00.000Z');
  assert.equal(fm.type, 'run-log');
  assert.equal(fm.date, '2026-07-24');
  assert.equal(fm.started_at, '2026-07-24T23:30:00.000Z');
  assert.equal(fm.source, 'nightly-batch');
  assert.equal(fm.schema_version, 1);
});

test('run-log start body marks the run as in progress', () => {
  const body = buildRunStartBody('2026-07-24');
  assert.match(body, /^# ラン記録 2026-07-24/);
  assert.match(body, /実行中/);
});
