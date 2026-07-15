const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { LogService, classifyLog, manualLogName } = require('../lib/log-service');

test('classifyLog classifies empty, successful, and failed output', () => {
  assert.equal(classifyLog(''), 'unknown');
  assert.equal(classifyLog('analysis completed\n3 reports inserted'), 'success');
  assert.equal(classifyLog('Fatal: command not found'), 'failure');
});

test('manualLogName uses the requested timestamp format', () => {
  assert.equal(manualLogName(new Date('2026-07-16T14:30:45Z')), 'manual-20260716-233045.log');
});

test('LogService lists only supported logs newest first and safely reads them', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-ai-logs-'));
  await fs.writeFile(path.join(directory, 'nightly-20260715.log'), 'completed');
  await fs.writeFile(path.join(directory, 'ignore.txt'), 'ignored');
  await new Promise((resolve) => setTimeout(resolve, 10));
  await fs.writeFile(path.join(directory, 'manual-20260716-233045.log'), 'Error: failed');
  const service = new LogService(directory);

  const logs = await service.list();
  assert.deepEqual(logs.map((log) => log.name), ['manual-20260716-233045.log', 'nightly-20260715.log']);
  assert.equal(logs[0].status, 'failure');
  assert.equal((await service.read(logs[1].name)).content, 'completed');
  await assert.rejects(() => service.read('../nightly-20260715.log'), /不正/);
});
