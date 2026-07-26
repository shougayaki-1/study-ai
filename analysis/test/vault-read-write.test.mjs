import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readVaultFile, writeVaultFile } from '../helpers/vault/read-write.mjs';

test('writeVaultFile creates nested directories and readVaultFile round-trips it', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-rw-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    const frontmatter = {
      type: 'karte',
      subject: '日本史',
      updated: '2026-07-24T23:40:00+09:00',
      source: 'nightly-batch',
      schema_version: 1,
    };
    const body = '# 弱点カルテ\n\n本文...';

    await writeVaultFile('subjects/日本史/弱点カルテ.md', frontmatter, body);

    const raw = await readFile(path.join(vaultDir, 'subjects', '日本史', '弱点カルテ.md'), 'utf8');
    assert.match(raw, /^---\ntype: karte/);

    const result = await readVaultFile('subjects/日本史/弱点カルテ.md');
    assert.deepEqual(result.frontmatter, frontmatter);
    assert.equal(result.body, body);
    assert.equal(result.raw, raw);
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});

test('readVaultFile throws when relPath escapes the vault root', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-rw-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await assert.rejects(
      () => readVaultFile('../outside.md'),
      /escapes vault root/
    );
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});

test('readVaultFile warns but still reads an unknown schema_version', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-rw-schema-'));
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;
  const originalWarn = console.warn;
  const warnings = [];
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  console.warn = (message) => warnings.push(message);
  try {
    await writeVaultFile('future.md', { type: 'schedule', schema_version: 2 }, '## 予定\n');
    const result = await readVaultFile('future.md');
    assert.equal(result.frontmatter.schema_version, 2);
    assert.equal(result.body, '## 予定\n');
    assert.deepEqual(warnings, [
      'Unknown vault schema_version 2 in future.md; attempting a best-effort read',
    ]);
  } finally {
    console.warn = originalWarn;
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  }
});

test('writeVaultFile writes atomically: concurrent writes never produce a torn/mixed file', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-rw-atomic-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    const frontmatter = { type: 'karte', schema_version: 1 };
    const bodyA = 'A'.repeat(2_000_000);
    const bodyB = 'B'.repeat(2_000_000);

    await Promise.all([
      writeVaultFile('race.md', frontmatter, bodyA),
      writeVaultFile('race.md', frontmatter, bodyB),
    ]);

    const raw = await readFile(path.join(vaultDir, 'race.md'), 'utf8');
    const isFullyA = raw.includes(bodyA) && !raw.includes('B');
    const isFullyB = raw.includes(bodyB) && !raw.includes('A');
    assert.ok(isFullyA || isFullyB, 'written file must be entirely one write or the other, never a mix');
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});

test('writeVaultFile leaves no leftover temp files after a successful write', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-rw-tmp-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await writeVaultFile('note.md', { type: 'karte', schema_version: 1 }, 'body');
    const entries = await readdir(vaultDir);
    assert.deepEqual(entries, ['note.md']);
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});
