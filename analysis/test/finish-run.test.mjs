import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildRunFinishFrontmatter, buildRunFinishBody, run as finishRun } from '../helpers/finish-run.mjs';
import { run as startRun, RUN_LOCK_REL_PATH } from '../helpers/start-run.mjs';

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

function withVault(fn) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vault-finish-run-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try {
      await fn(dir);
    } finally {
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

const SUMMARY = JSON.stringify({ processed: 5, needsConfirmation: 1, lines: ['Inbox 5件処理'] });

test('finish-run releases the lock on a successful run', withVault(async (dir) => {
  await startRun(['2026-07-26']);
  assert.ok(existsSync(path.join(dir, RUN_LOCK_REL_PATH)));

  const result = await finishRun(['2026-07-26', 'ok', SUMMARY]);

  assert.equal(result.status, 'ok');
  assert.equal(result.lock_released, true);
  assert.equal(existsSync(path.join(dir, RUN_LOCK_REL_PATH)), false, 'ロックが解放されていること');
  // 解放後は次のランが問題なく開始できる。
  await startRun(['2026-07-27']);
}));

test('finish-run releases the lock when the run ended with an error status', withVault(async (dir) => {
  await startRun(['2026-07-26']);
  await finishRun(['2026-07-26', 'error', JSON.stringify({ lines: ['回復不能なエラー'] })]);
  assert.equal(existsSync(path.join(dir, RUN_LOCK_REL_PATH)), false);
}));

test('finish-run releases the lock even when writing the completion report fails', withVault(async (dir) => {
  await startRun(['2026-07-26']);
  // runs/2026-07-99.md は存在しないので readVaultFile が throw する。
  await assert.rejects(() => finishRun(['2026-07-99', 'ok', SUMMARY]));
  assert.equal(existsSync(path.join(dir, RUN_LOCK_REL_PATH)), false, '異常終了でも解放されること');
}));

test('finish-run --release-lock releases a leftover lock without touching run logs', withVault(async (dir) => {
  await startRun(['2026-07-26']);
  const result = await finishRun(['--release-lock']);
  assert.equal(result.lock_released, true);
  assert.equal(existsSync(path.join(dir, RUN_LOCK_REL_PATH)), false);
  assert.deepEqual(readdirSync(path.join(dir, 'runs')), ['2026-07-26.md']);
  // 二重呼び出しでもエラーにしない。
  assert.equal((await finishRun(['--release-lock'])).lock_released, false);
}));
