import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function withVault(fn) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vault-session-cli-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

test('record-session appends a session and assigns the next id', withVault(async (dir) => {
  const { run } = await import('../helpers/record-session.mjs');
  const result = await run(['2026-07-25', '英語R', '60', 'material', 'understood', '長文2題']);
  assert.equal(result.session.id, 's-1');
  const raw = readFileSync(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /id=s-1 \| subject=英語R \| minutes=60 \| kind=material \| understanding=understood \| memo=長文2題/);
}));

test('record-session records year/section only for kind=common_test', withVault(async (dir) => {
  const { run } = await import('../helpers/record-session.mjs');
  await run(['2026-07-25', '数学IA', '90', 'common_test', 'uncertain', '', '2025', '第3問']);
  const raw = readFileSync(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /kind=common_test \| year=2025 \| section=第3問/);
}));

test('edit-session rewrites only the targeted session via a JSON patch', withVault(async (dir) => {
  const { run: recordRun } = await import('../helpers/record-session.mjs');
  const { run: editRun } = await import('../helpers/edit-session.mjs');
  await recordRun(['2026-07-25', '英語R', '60', 'material', 'understood', '']);
  await editRun(['2026-07-25', 's-1', JSON.stringify({ minutes: 90, memo: 'やり直し' })]);
  const raw = readFileSync(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /minutes=90/);
  assert.match(raw, /memo=やり直し/);
}));

test('delete-session removes the targeted session', withVault(async (dir) => {
  const { run: recordRun } = await import('../helpers/record-session.mjs');
  const { run: deleteRun } = await import('../helpers/delete-session.mjs');
  await recordRun(['2026-07-25', '英語R', '60', 'material', 'understood', '']);
  await deleteRun(['2026-07-25', 's-1']);
  const raw = readFileSync(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.doesNotMatch(raw, /id=s-1/);
}));

test('record-session throws for an unknown subject', withVault(async () => {
  const { run } = await import('../helpers/record-session.mjs');
  await assert.rejects(() => run(['2026-07-25', '英語Ｒ', '60', 'material', 'understood', '']), /subject/);
}));

test('record-session throws for an invalid date', withVault(async () => {
  const { run } = await import('../helpers/record-session.mjs');
  await assert.rejects(() => run(['2026/07/25', '英語R', '60', 'material', 'understood', '']), /date/);
}));

test('record-session throws when memo contains the field delimiter', withVault(async () => {
  const { run } = await import('../helpers/record-session.mjs');
  await assert.rejects(() => run(['2026-07-25', '英語R', '60', 'material', 'understood', '長文2題 | 時間切れ']), / \| /);
}));

test('edit-session throws when the patch contains an unknown kind', withVault(async () => {
  const { run: recordRun } = await import('../helpers/record-session.mjs');
  const { run: editRun } = await import('../helpers/edit-session.mjs');
  await recordRun(['2026-07-25', '英語R', '60', 'material', 'understood', '']);
  await assert.rejects(() => editRun(['2026-07-25', 's-1', JSON.stringify({ kind: 'unknown' })]), /kind/);
}));

for (const minutes of ['0', '-1', 'not-a-number']) {
  test(`record-session rejects invalid minutes: ${minutes}`, withVault(async () => {
    const { run } = await import('../helpers/record-session.mjs');
    await assert.rejects(() => run(['2026-07-25', '英語R', minutes, 'material', 'understood', '']), /minutes/);
  }));
}
