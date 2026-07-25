import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSection, bumpFrontmatterUpdated } from '../helpers/append-vault-section.mjs';

test('appendSection keeps prior content and adds a new heading section', () => {
  const before = '# 弱点カルテ\n\n## 2026-07-20\n\n三角比の符号ミスが継続。\n';
  const after = appendSection(before, '2026-07-24', '三角比: 符号ミスは解消。第2象限の公式暗記が甘い。');
  assert.match(after, /## 2026-07-20/);
  assert.match(after, /符号ミスが継続/);
  assert.match(after, /## 2026-07-24/);
  assert.match(after, /公式暗記が甘い/);
  assert.ok(after.indexOf('## 2026-07-20') < after.indexOf('## 2026-07-24'));
});

test('appendSection handles an empty starting body (new karte file)', () => {
  const after = appendSection('', '2026-07-24', '初回の弱点メモ。');
  assert.equal(after, '## 2026-07-24\n\n初回の弱点メモ。\n');
});

test('bumpFrontmatterUpdated preserves existing fields and applies patch', () => {
  const fm = bumpFrontmatterUpdated(
    { type: 'karte', subject: '数学', schema_version: 1, updated: '2026-07-20T10:00:00+09:00' },
    '2026-07-24T23:40:00+09:00',
    { source: 'nightly-batch' }
  );
  assert.equal(fm.subject, '数学');
  assert.equal(fm.source, 'nightly-batch');
  assert.equal(fm.updated, '2026-07-24T23:40:00+09:00');
});
