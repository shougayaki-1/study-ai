import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildRunStartFrontmatter,
  buildRunStartBody,
  acquireRunLock,
  releaseRunLock,
  readRunLock,
  isStaleLock,
  run as startRun,
  RUN_LOCK_REL_PATH,
  STALE_LOCK_MS,
} from '../helpers/start-run.mjs';

function withVault(fn) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vault-run-lock-'));
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

function writeLock(dir, info) {
  mkdirSync(path.join(dir, 'runs'), { recursive: true });
  writeFileSync(path.join(dir, RUN_LOCK_REL_PATH), JSON.stringify(info), 'utf8');
}

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

test('start-run acquires runs/.lock and writes the run log', withVault(async (dir) => {
  const result = await startRun(['2026-07-26']);
  assert.equal(result.path, 'runs/2026-07-26.md');
  assert.equal(result.took_over_stale_lock, null);
  assert.ok(existsSync(path.join(dir, RUN_LOCK_REL_PATH)), 'ロックが作られていること');
  const lock = JSON.parse(readFileSync(path.join(dir, RUN_LOCK_REL_PATH), 'utf8'));
  assert.equal(lock.pid, process.pid);
  assert.equal(lock.date, '2026-07-26');
  assert.ok(existsSync(path.join(dir, 'runs', '2026-07-26.md')));
}));

test('start-run fails without writing anything when a live lock exists (even for a different date)', withVault(async (dir) => {
  writeLock(dir, {
    pid: 4242,
    host: 'other-mac',
    date: '2026-07-26',
    started_at: new Date(Date.now() - 60 * 1000).toISOString(),
  });

  await assert.rejects(() => startRun(['2026-07-25']), /別の夜間バッチが実行中/);

  // 日付が違っても弾かれ、runs/ にはロック以外何も増えていない。
  assert.deepEqual(readdirSync(path.join(dir, 'runs')), ['.lock']);
  assert.equal(existsSync(path.join(dir, 'runs', '2026-07-25.md')), false);
  // 既存ロックは奪われていない。
  const lock = JSON.parse(readFileSync(path.join(dir, RUN_LOCK_REL_PATH), 'utf8'));
  assert.equal(lock.pid, 4242);
}));

test('the lock-held error names who holds it and when', withVault(async (dir) => {
  const startedAt = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  writeLock(dir, { pid: 4242, host: 'other-mac', date: '2026-07-26', started_at: startedAt });
  await assert.rejects(() => startRun(['2026-07-25']), (error) => {
    assert.match(error.message, /pid=4242/);
    assert.match(error.message, /other-mac/);
    assert.ok(error.message.includes(startedAt), '開始時刻が含まれること');
    assert.match(error.message, /4分前/);
    assert.match(error.message, /date=2026-07-26/);
    return true;
  });
}));

test('start-run takes over a stale lock and warns', withVault(async (dir) => {
  const staleStart = new Date(Date.now() - STALE_LOCK_MS - 60 * 1000).toISOString();
  writeLock(dir, { pid: 4242, host: 'other-mac', date: '2026-07-20', started_at: staleStart });

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const result = await startRun(['2026-07-26']);
    assert.equal(result.took_over_stale_lock.pid, 4242);
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(warnings.some((line) => /古いロックを奪います/.test(line)), '警告が出ていること');

  const lock = JSON.parse(readFileSync(path.join(dir, RUN_LOCK_REL_PATH), 'utf8'));
  assert.equal(lock.pid, process.pid);
  assert.ok(existsSync(path.join(dir, 'runs', '2026-07-26.md')));
}));

test('start-run --force takes over a live lock', withVault(async (dir) => {
  writeLock(dir, { pid: 4242, host: 'other-mac', date: '2026-07-26', started_at: new Date().toISOString() });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await startRun(['2026-07-26', '--force']);
    assert.equal(result.took_over_stale_lock.pid, 4242);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(JSON.parse(readFileSync(path.join(dir, RUN_LOCK_REL_PATH), 'utf8')).pid, process.pid);
}));

test('acquireRunLock is exclusive: a second acquire on a live lock throws', withVault(async (dir) => {
  const now = new Date();
  await acquireRunLock(dir, { dateStr: '2026-07-26', now });
  await assert.rejects(
    () => acquireRunLock(dir, { dateStr: '2026-07-25', now }),
    /別の夜間バッチが実行中/,
  );
}));

test('releaseRunLock removes the lock and is idempotent', withVault(async (dir) => {
  await acquireRunLock(dir, { dateStr: '2026-07-26' });
  assert.deepEqual(await releaseRunLock(dir), { released: true });
  assert.equal(await readRunLock(dir), null);
  assert.deepEqual(await releaseRunLock(dir), { released: false });
  // 解放後は再取得できる。
  await acquireRunLock(dir, { dateStr: '2026-07-26' });
  assert.ok((await readRunLock(dir)).started_at);
}));

test('isStaleLock uses the 2h threshold and treats unreadable locks as stale', () => {
  const now = Date.parse('2026-07-26T10:00:00.000Z');
  assert.equal(isStaleLock({ started_at: '2026-07-26T09:50:00.000Z' }, now), false); // 10分 = 実測9分半のラン
  assert.equal(isStaleLock({ started_at: '2026-07-26T08:01:00.000Z' }, now), false); // 1時間59分
  assert.equal(isStaleLock({ started_at: '2026-07-26T07:59:00.000Z' }, now), true); // 2時間超
  assert.equal(isStaleLock({}, now), true);
  assert.equal(isStaleLock({ started_at: 'not-a-date' }, now), true);
  assert.equal(isStaleLock(null, now), true);
});

test('a corrupt lock file is treated as stale and can be taken over', withVault(async (dir) => {
  mkdirSync(path.join(dir, 'runs'), { recursive: true });
  writeFileSync(path.join(dir, RUN_LOCK_REL_PATH), 'not json at all', 'utf8');
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await startRun(['2026-07-26']);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(JSON.parse(readFileSync(path.join(dir, RUN_LOCK_REL_PATH), 'utf8')).pid, process.pid);
}));
