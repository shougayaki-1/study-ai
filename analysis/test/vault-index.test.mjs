import test from 'node:test';
import assert from 'node:assert/strict';
import * as vault from '../helpers/vault/index.mjs';

test('vault barrel re-exports every Foundation helper by its contract name', () => {
  assert.equal(typeof vault.vaultRoot, 'function');
  assert.equal(typeof vault.parseFrontmatter, 'function');
  assert.equal(typeof vault.stringifyFrontmatter, 'function');
  assert.equal(typeof vault.readVaultFile, 'function');
  assert.equal(typeof vault.writeVaultFile, 'function');
  assert.equal(typeof vault.archivePhoto, 'function');
  assert.equal(typeof vault.readCorrections, 'function');
  assert.equal(typeof vault.clearCorrections, 'function');
});
