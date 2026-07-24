import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function withVault(fn) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vault-test-'));
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

test('write-vault-file then read-vault-file round-trips frontmatter and body', withVault(async (dir) => {
  const { run: writeRun } = await import('../helpers/write-vault-file.mjs');
  const { run: readRun } = await import('../helpers/read-vault-file.mjs');
  const bodyPath = path.join(dir, '_tmp-body.md');
  writeFileSync(bodyPath, '本文テスト\n');
  await writeRun([
    'subjects/日本史/弱点カルテ.md',
    JSON.stringify({ type: 'karte', subject: '日本史', updated: '2026-07-24T23:40:00+09:00', source: 'nightly-batch', schema_version: 1 }),
    bodyPath,
  ]);
  const result = await readRun(['subjects/日本史/弱点カルテ.md']);
  assert.equal(result.frontmatter.subject, '日本史');
  assert.equal(result.body.trim(), '本文テスト');
}));

test('archive-inbox-photo moves the original out of _inbox into _archive/YYYY/MM', withVault(async (dir) => {
  mkdirSync(path.join(dir, '_inbox'), { recursive: true });
  writeFileSync(path.join(dir, '_inbox', 'photo1.jpg'), 'dummy');
  const { run: archiveRun } = await import('../helpers/archive-inbox-photo.mjs');
  const result = await archiveRun(['_inbox/photo1.jpg', '2026-07-24']);
  assert.equal(result.archivedPath, '_archive/2026/07/photo1.jpg');
  assert.ok(existsSync(path.join(dir, '_archive/2026/07/photo1.jpg')));
  assert.ok(!existsSync(path.join(dir, '_inbox/photo1.jpg')));
}));

test('read-corrections then clear-corrections empties corrections.md', withVault(async (dir) => {
  mkdirSync(path.join(dir, '_inbox'), { recursive: true });
  writeFileSync(
    path.join(dir, '_inbox', 'corrections.md'),
    '## 2026-07-24T08:12:00+09:00\n- report: reports/daily/2026-07-24.md\n- todo: todo-1\n- choice: 世界史\n'
  );
  const { run: readRun } = await import('../helpers/read-corrections.mjs');
  const { run: clearRun } = await import('../helpers/clear-corrections.mjs');
  const entries = await readRun();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].choice, '世界史');
  await clearRun();
  const after = readFileSync(path.join(dir, '_inbox', 'corrections.md'), 'utf8');
  assert.equal(after.trim(), '');
}));
