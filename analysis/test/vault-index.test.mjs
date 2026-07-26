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
  for (const name of ['parseScheduleEvents', 'formatScheduleEventLine', 'nextEventId', 'appendScheduleEvent', 'updateScheduleEvent', 'deleteScheduleEvent', 'parsePlanBlocks', 'formatPlanBlockLine', 'nextPlanId', 'appendPlanBlock', 'updatePlanBlock', 'deletePlanBlock']) assert.equal(typeof vault[name], 'function');
  assert.equal(typeof vault.parseStudySessions, 'function');
  assert.equal(typeof vault.formatStudySessionLine, 'function');
  assert.equal(typeof vault.nextSessionId, 'function');
  assert.equal(typeof vault.appendStudySession, 'function');
  assert.equal(typeof vault.updateStudySession, 'function');
  assert.equal(typeof vault.deleteStudySession, 'function');
});
