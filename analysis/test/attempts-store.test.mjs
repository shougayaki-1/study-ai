import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function withVault(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'attempts-'));
  mkdirSync(path.join(dir, 'data'), { recursive: true });
  const prev = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = dir;
  return Promise.resolve(fn(dir)).finally(() => {
    if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = prev;
  });
}

function sample(overrides = {}) {
  return {
    id: 'aaaaaaaaaaaaaaaa', schema_version: 1,
    occurred_at: '2026-08-01T16:05:00+09:00', occurred_date: '2026-08-01',
    ingested_at: '2026-08-02T02:10:00+09:00', source_system: 'kawai',
    artifact_ref: '_archive/2026/08/x.pdf', artifact_sha256: 'deadbeef',
    extractor: { name: 'kawai-tokumo-history', version: '1.0.0', method: 'deterministic' },
    subject: '化学基礎', subject_raw: '化学基礎',
    topic_path: ['物質の構成', '化学結合', '分子とその形'],
    topic_path_raw: '分子とその形 ＜ 化学結合 ＜ 物質の構成',
    material: { name: '河合 学習履歴 / 範囲選択', question_no: '002' },
    result: 'correct', duration_sec: 25, error_type: null, confidence: 1,
    confirmation_status: 'unreviewed', record_status: 'active', supersedes: null, note: null,
    ...overrides,
  };
}

test('attemptId は同じ入力に対して安定した16桁hexを返す', async () => {
  const { attemptId } = await import('../helpers/vault/attempts.mjs');
  const a = attemptId('deadbeef', 1, 0);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, attemptId('deadbeef', 1, 0));
  assert.notEqual(a, attemptId('deadbeef', 1, 1));
  assert.notEqual(a, attemptId('deadbeee', 1, 0));
});

test('appendAttempts は追記し readAttempts で読み戻せる', async () => {
  await withVault(async () => {
    const { appendAttempts, readAttempts } = await import('../helpers/vault/attempts.mjs');
    const r = await appendAttempts([sample()]);
    assert.equal(r.added, 1);
    const rows = await readAttempts();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].subject, '化学基礎');
  });
});

test('同じ内容を再追記してもファイルが増えず active 件数も変わらない（冪等）', async () => {
  await withVault(async (dir) => {
    const { appendAttempts, readAttempts } = await import('../helpers/vault/attempts.mjs');
    await appendAttempts([sample(), sample({ id: 'bbbbbbbbbbbbbbbb' })]);
    const before = readFileSync(path.join(dir, 'data', 'attempts.jsonl'), 'utf8');
    const r = await appendAttempts([sample({ ingested_at: '2026-08-03T00:00:00+09:00' }), sample({ id: 'bbbbbbbbbbbbbbbb' })]);
    assert.equal(r.added, 0);
    assert.equal(r.unchanged, 2);
    const after = readFileSync(path.join(dir, 'data', 'attempts.jsonl'), 'utf8');
    assert.equal(after, before);
    assert.equal((await readAttempts()).length, 2);
  });
});

test('同じ id で内容が変われば追記され、最後の行が採用される', async () => {
  await withVault(async () => {
    const { appendAttempts, readAttempts } = await import('../helpers/vault/attempts.mjs');
    await appendAttempts([sample({ result: 'incorrect' })]);
    await appendAttempts([sample({ result: 'correct' })]);
    const rows = await readAttempts();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].result, 'correct');
  });
});

test('supersedeAttempt は旧行を superseded にし、新行を active で追加する', async () => {
  await withVault(async () => {
    const { appendAttempts, readAttempts, supersedeAttempt } = await import('../helpers/vault/attempts.mjs');
    await appendAttempts([sample()]);
    const next = await supersedeAttempt('aaaaaaaaaaaaaaaa', { subject: '化学' }, '2026-08-05T09:00:00+09:00');
    const active = await readAttempts();
    assert.equal(active.length, 1);
    assert.equal(active[0].id, next.id);
    assert.equal(active[0].subject, '化学');
    assert.equal(active[0].supersedes, 'aaaaaaaaaaaaaaaa');
    assert.equal(active[0].confirmation_status, 'user_confirmed');
    assert.equal(active[0].extractor.method, 'user');
    const all = await readAttempts({ includeInactive: true });
    assert.equal(all.length, 2);
    const old = all.find((r) => r.id === 'aaaaaaaaaaaaaaaa');
    assert.equal(old.record_status, 'superseded');
    assert.equal(old.subject, '化学基礎', '訂正前の値は保持される');
  });
});

test('STUDY_AI_VAULT_DIR 未設定ならエラーになる', async () => {
  const prev = process.env.STUDY_AI_VAULT_DIR;
  delete process.env.STUDY_AI_VAULT_DIR;
  try {
    const { readAttempts } = await import('../helpers/vault/attempts.mjs');
    await assert.rejects(() => readAttempts(), /STUDY_AI_VAULT_DIR/);
  } finally {
    if (prev !== undefined) process.env.STUDY_AI_VAULT_DIR = prev;
  }
});
