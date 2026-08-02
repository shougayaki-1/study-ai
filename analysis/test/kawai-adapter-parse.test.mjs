import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(here, 'fixtures/kawai-tokumo-words.json'), 'utf8'));
const wrapped = JSON.parse(readFileSync(path.join(here, 'fixtures/kawai-tokumo-wrapped-words.json'), 'utf8'));

test('detectFromText は河合の学習履歴だけを判定する', async () => {
  const { detectFromText } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  assert.equal(detectFromText('学習履歴 解答終了日時 正誤 解答時間 問題名 区分 科目'), true);
  assert.equal(detectFromText('英検準1級 Reading 大問1'), false);
  assert.equal(detectFromText(''), false);
});

test('parseRows は行を座標から復元する', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.durationSec), [18, 25]);
  assert.deepEqual(rows.map((r) => r.questionNo), ['010', '002']);
  assert.equal(rows[0].at, '2026/08/01 16:05');
  assert.equal(rows[0].subjectRaw, '化学基礎');
  assert.equal(rows[0].index, 0);
});

test('parseRows は分割された区分セルを組み立てる', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const rows = parseRows(fixture.words);
  assert.deepEqual(rows[0].topicParts, ['金属結合・金属結晶', '化学結合', '物質の構成']);
  assert.equal(rows[0].topicRaw, '金属結合・金属結晶 ＜ 化学結合 ＜ 物質の構成');
  assert.deepEqual(rows[1].topicParts, ['分子とその形', '化学結合', '物質の構成']);
});

test('parseRows は折り返した単元と科目をサブ行順に連結する', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const [row] = parseRows(wrapped.words);
  assert.deepEqual(row.topicParts, ['平面図形と様々な点の位置ベクトル', '平面図形とベクトル', '平面ベクトル']);
  assert.equal(row.subjectRaw, '数学C');
  assert.equal(row.questionNo, '008');
  assert.equal(row.durationSec, 47);
  assert.equal(row.at, '2026/07/31 10:43');
});

test('markRect は最後の正誤ヘッダを使う', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const [row] = parseRows(fixture.words);
  assert.ok(Math.abs(row.markRect.x0 - 200.511423) < 0.001);
  assert.ok(Math.abs(row.markRect.x1 - 215.25654) < 0.001);
  assert.ok(row.markRect.y0 < 204.038402 && row.markRect.y1 > 214.706494);
});

test('ヘッダが1回だけでも動き、必要なヘッダ欠落なら空配列', async () => {
  const { parseRows } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  assert.equal(parseRows(fixture.words.filter((w) => w.y0 > 160)).length, 2);
  assert.deepEqual(parseRows([{ x0: 1, y0: 1, x1: 2, y1: 2, t: '正誤' }]), []);
  assert.deepEqual(parseRows([]), []);
});

test('classifyMark は背景を無視して色で○△✕を判定する', async () => {
  const { classifyMark } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const fill = (r, g, b) => Array.from({ length: 40 }, () => ({ r, g, b }));
  assert.equal(classifyMark(fill(68, 176, 47)), 'correct');
  assert.equal(classifyMark(fill(240, 150, 30)), 'partial');
  assert.equal(classifyMark(fill(220, 50, 60)), 'incorrect');
  assert.equal(classifyMark(fill(255, 255, 255)), 'unknown');
  assert.equal(classifyMark([]), 'unknown');
  assert.equal(classifyMark([...fill(255, 255, 255), ...fill(68, 176, 47)]), 'correct');
});

test('toAttempts はスキーマどおりのレコードを作る', async () => {
  const { parseRows, toAttempts } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const attempts = toAttempts({
    rows: parseRows(fixture.words), marks: ['correct', 'incorrect'], page: 1,
    artifactRef: '_archive/2026/08/20260801-tokuMo-Chemics-1.pdf', artifactSha256: 'deadbeef',
    ingestedAt: '2026-08-02T02:10:00+09:00',
  });
  const first = attempts[0];
  assert.equal(first.schema_version, 1);
  assert.equal(first.source_system, 'kawai');
  assert.equal(first.result, 'correct');
  assert.equal(first.duration_sec, 18);
  assert.equal(first.occurred_at, '2026-08-01T16:05:00+09:00');
  assert.equal(first.occurred_date, '2026-08-01');
  assert.deepEqual(first.topic_path, ['物質の構成', '化学結合', '金属結合・金属結晶']);
  assert.equal(first.material.question_no, '010');
  assert.equal(first.confidence, 1);
  assert.equal(first.record_status, 'active');
  assert.match(first.id, /^[0-9a-f]{16}$/);
  assert.notEqual(attempts[1].id, first.id);
});

test('toAttempts は error_type を推測せず、unknown も保持する', async () => {
  const { parseRows, toAttempts } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  const attempts = toAttempts({ rows: parseRows(fixture.words), marks: ['unknown', 'incorrect'], page: 1,
    artifactRef: '_archive/x.pdf', artifactSha256: 'deadbeef', ingestedAt: '2026-08-02T02:10:00+09:00' });
  assert.equal(attempts[0].result, 'unknown');
  assert.ok(attempts.every((attempt) => attempt.error_type === null));
});

test('toAttempts は rows と marks の件数不一致を拒否する', async () => {
  const { parseRows, toAttempts } = await import('../helpers/adapters/kawai-tokumo-history.mjs');
  assert.throws(() => toAttempts({ rows: parseRows(fixture.words), marks: ['correct'], page: 1,
    artifactRef: '_archive/x.pdf', artifactSha256: 'deadbeef', ingestedAt: '2026-08-02T02:10:00+09:00' }), /一致しません/);
});
