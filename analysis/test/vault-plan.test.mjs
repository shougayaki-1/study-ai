import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatPlanBlockLine, nextPlanId, parsePlanBlocks } from '../helpers/vault/plan.mjs';

const BODY = readFileSync(path.join(process.cwd(), 'analysis/test/fixtures/study-plan.md'), 'utf8');
test('parsePlanBlocks parses the shared fixture', () => assert.deepEqual(parsePlanBlocks(BODY), [
  { id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '長文演習' },
  { id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'done', memo: '' },
]));
test('parsePlanBlocks returns empty with no lines', () => assert.deepEqual(parsePlanBlocks('## 計画\n'), []));
test('formatPlanBlockLine formats and rejects unsafe values', () => {
  assert.equal(formatPlanBlockLine({ id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'done', memo: '' }), '- id=p-2 | start=11:00 | end=12:00 | subject=数学IA | status=done | memo=');
  assert.throws(() => formatPlanBlockLine({ id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: 'a | b' }));
  assert.throws(() => formatPlanBlockLine({ id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: 'a\nb' }));
});
test('nextPlanId allocates after the maximum ID', () => { assert.equal(nextPlanId([]), 'p-1'); assert.equal(nextPlanId(parsePlanBlocks(BODY)), 'p-3'); });
