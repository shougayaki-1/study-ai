import test from 'node:test';
import assert from 'node:assert/strict';
import { vaultRoot } from '../helpers/vault/root.mjs';

test('vaultRoot returns the configured vault root', () => {
  const original = process.env.STUDY_AI_VAULT_DIR;
  process.env.STUDY_AI_VAULT_DIR = '/tmp/vault';
  try {
    assert.equal(vaultRoot(), '/tmp/vault');
  } finally {
    if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = original;
  }
});

test('vaultRoot throws when STUDY_AI_VAULT_DIR is not set', () => {
  const original = process.env.STUDY_AI_VAULT_DIR;
  delete process.env.STUDY_AI_VAULT_DIR;
  try {
    assert.throws(() => vaultRoot(), /STUDY_AI_VAULT_DIR is not set/);
  } finally {
    if (original !== undefined) process.env.STUDY_AI_VAULT_DIR = original;
  }
});
