import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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
