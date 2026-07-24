import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { archivePhoto } from '../helpers/vault/archive.mjs';

test('archivePhoto moves an inbox photo into _archive/YYYY/MM and returns the new relPath', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-archive-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await mkdir(path.join(vaultDir, '_inbox'), { recursive: true });
    await writeFile(path.join(vaultDir, '_inbox', 'abc.jpg'), 'dummy-image-bytes', 'utf8');

    const destRelPath = await archivePhoto('_inbox/abc.jpg', '2026-07-24');

    assert.equal(destRelPath, '_archive/2026/07/abc.jpg');
    const moved = await readFile(path.join(vaultDir, '_archive', '2026', '07', 'abc.jpg'), 'utf8');
    assert.equal(moved, 'dummy-image-bytes');
    await assert.rejects(() => readFile(path.join(vaultDir, '_inbox', 'abc.jpg')));
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});

test('archivePhoto rejects a malformed dateStr', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-archive-'));
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = vaultDir;
  try {
    await assert.rejects(
      () => archivePhoto('_inbox/abc.jpg', '2026/07/24'),
      /invalid dateStr/
    );
  } finally {
    await rm(vaultDir, { recursive: true, force: true });
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});
