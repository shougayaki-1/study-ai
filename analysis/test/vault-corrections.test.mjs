import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clearCorrections, readCorrections } from '../helpers/vault/corrections.mjs';

// NOTE: src/lib/vault/corrections.test.ts の appendCorrection 2件テストが
//       生成するファイル内容と一字一句同一 (契約: TS版とNode版でパース結果を完全一致させる)
const FIXTURE_RAW = [
  '## 2026-07-24T08:12:00+09:00',
  '- report: reports/daily/2026-07-24.md',
  '- todo: todo-1',
  '- choice: 世界史',
  '- note: 実は世界史でした',
  '',
  '## 2026-07-24T09:00:00+09:00',
  '- report: reports/daily/2026-07-24.md',
  '- todo: todo-2',
  '- choice: 不明',
  '',
].join('\n');

test('readCorrections parses both entries, note optional', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-corrections-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await mkdir(path.join(vaultDir, '_inbox'), { recursive: true });
    await writeFile(path.join(vaultDir, '_inbox', 'corrections.md'), FIXTURE_RAW, 'utf8');

    const entries = await readCorrections();
    assert.deepEqual(entries, [
      {
        timestamp: '2026-07-24T08:12:00+09:00',
        report: 'reports/daily/2026-07-24.md',
        todo: 'todo-1',
        choice: '世界史',
        note: '実は世界史でした',
      },
      {
        timestamp: '2026-07-24T09:00:00+09:00',
        report: 'reports/daily/2026-07-24.md',
        todo: 'todo-2',
        choice: '不明',
        note: undefined,
      },
    ]);
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});

test('readCorrections returns [] when corrections.md does not exist', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-corrections-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    assert.deepEqual(await readCorrections(), []);
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});

test('clearCorrections empties the file after consumption', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-corrections-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await mkdir(path.join(vaultDir, '_inbox'), { recursive: true });
    await writeFile(path.join(vaultDir, '_inbox', 'corrections.md'), FIXTURE_RAW, 'utf8');

    await clearCorrections();

    const raw = await readFile(path.join(vaultDir, '_inbox', 'corrections.md'), 'utf8');
    assert.equal(raw, '');
    assert.deepEqual(await readCorrections(), []);
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});
