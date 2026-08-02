import { test } from 'node:test';
import assert from 'node:assert/strict';

test('computeState は証拠3件未満を insufficient にする', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  assert.equal(computeState([]), 'insufficient');
  assert.equal(computeState(['correct']), 'insufficient');
  assert.equal(computeState(['correct', 'correct']), 'insufficient');
});

test('computeState は直近正答率0.6未満を weak にする', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  assert.equal(computeState(['incorrect', 'incorrect', 'correct']), 'weak');
  assert.equal(computeState(['incorrect', 'incorrect', 'incorrect', 'correct', 'correct']), 'weak');
  assert.equal(computeState(['partial', 'partial', 'partial']), 'weak');
});

test('computeState は切替2回以上を unstable にする', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  assert.equal(computeState(['incorrect', 'correct', 'incorrect', 'correct', 'correct']), 'unstable');
});

test('computeState は安定した正答を stable にする', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  assert.equal(computeState(['correct', 'correct', 'correct']), 'stable');
  assert.equal(computeState(['incorrect', 'correct', 'correct', 'correct', 'correct']), 'stable');
});

test('computeState は直近5件だけを見る', async () => {
  const { computeState } = await import('../helpers/vault/skills.mjs');
  assert.equal(computeState(['incorrect', 'incorrect', 'incorrect', 'correct', 'correct', 'correct', 'correct', 'correct']), 'stable');
});

function attempt(overrides = {}) {
  return {
    subject: '化学基礎', topic_path: ['物質の構成', '化学結合', '分子とその形'],
    material: { name: 'x', question_no: '002' }, result: 'correct', duration_sec: 20,
    occurred_at: '2026-08-01T10:00:00+09:00', occurred_date: '2026-08-01',
    artifact_ref: '_archive/2026/08/a.pdf', record_status: 'active', ...overrides,
  };
}

test('buildSkills は科目・末端単元ごとに集約する', async () => {
  const { buildSkills } = await import('../helpers/vault/skills.mjs');
  const files = buildSkills([
    attempt(), attempt({ result: 'incorrect', duration_sec: 40, occurred_date: '2026-08-02', occurred_at: '2026-08-02T10:00:00+09:00' }),
    attempt({ topic_path: ['物質の構成', '化学結合', '配位結合'] }),
    attempt({ subject: '地理総合', topic_path: ['地図', '地図の活用'] }),
  ], '2026-08-02T03:00:00+09:00');
  assert.deepEqual(Object.keys(files).sort(), ['化学基礎', '地理総合']);
  const topic = files['化学基礎'].topics.find((item) => item.name === '分子とその形');
  assert.equal(topic.attempts, 2);
  assert.equal(topic.correct, 1);
  assert.equal(topic.accuracy, 0.5);
  assert.equal(topic.group, '化学結合');
  assert.equal(topic.key, '物質の構成 > 化学結合 > 分子とその形');
  assert.equal(topic.last_practiced_date, '2026-08-02');
  assert.equal(topic.avg_duration_sec, 30);
  assert.equal(topic.state, 'insufficient');
  assert.deepEqual(topic.recent, ['correct', 'incorrect']);
  assert.equal(topic.recent_attempts.length, 2);
});

test('buildSkills は partial をaccuracy 0.5として数える', async () => {
  const { buildSkills } = await import('../helpers/vault/skills.mjs');
  const topic = buildSkills([attempt({ result: 'partial' }), attempt()], 'x')['化学基礎'].topics[0];
  assert.equal(topic.correct, 1);
  assert.equal(topic.accuracy, 0.75);
});

test('buildSkills は空の科目・単元を未判定へ集める', async () => {
  const { buildSkills } = await import('../helpers/vault/skills.mjs');
  const files = buildSkills([attempt({ subject: '', topic_path: [] })], 'x');
  assert.equal(files['(科目未判定)'].topics[0].name, '(単元未判定)');
});

test('buildSkills は recent_attempts を直近20件に制限する', async () => {
  const { buildSkills } = await import('../helpers/vault/skills.mjs');
  const many = Array.from({ length: 25 }, (_, index) => attempt({
    occurred_date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    occurred_at: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00+09:00`,
  }));
  const topic = buildSkills(many, 'x')['化学基礎'].topics[0];
  assert.equal(topic.attempts, 25);
  assert.equal(topic.recent_attempts.length, 20);
  assert.equal(topic.recent.length, 5);
});
