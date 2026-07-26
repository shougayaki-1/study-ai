import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendPlanBlock, deletePlanBlock, formatPlanBlockLine, nextPlanId, parsePlanBlocks, updatePlanBlock } from '../helpers/vault/plan.mjs';

const BODY = readFileSync(path.join(process.cwd(), 'analysis/test/fixtures/study-plan.md'), 'utf8');
test('parsePlanBlocks parses the shared fixture', () => assert.deepEqual(parsePlanBlocks(BODY), [
  { id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '長文演習' },
  { id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'done', memo: '' },
]));
test('parsePlanBlocks returns empty with no lines', () => assert.deepEqual(parsePlanBlocks('## 計画\n'), []));
test('formatPlanBlockLine formats and rejects unsafe values', () => {
  assert.equal(formatPlanBlockLine({ id: 'p-2', start: '11:00', end: '12:00', subject: '数学IA', status: 'done', memo: '' }), '- id=p-2 | start=11:00 | end=12:00 | subject=数学IA | status=done | memo=');
  assert.throws(() => formatPlanBlockLine({ id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: 'a | b' }));
  assert.throws(() => formatPlanBlockLine({ id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: 'a\nb' }));
});
test('nextPlanId allocates after the maximum ID', () => { assert.equal(nextPlanId([]), 'p-1'); assert.equal(nextPlanId(parsePlanBlocks(BODY)), 'p-3'); });

function withVault(fn) { return async () => { const dir = await mkdtemp(path.join(tmpdir(), 'vault-plan-')); const prev = process.env.STUDY_AI_VAULT_DIR; process.env.STUDY_AI_VAULT_DIR = dir; try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR; else process.env.STUDY_AI_VAULT_DIR = prev; } }; }
const first = { id: 'p-1', start: '09:00', end: '10:30', subject: '英語R', status: 'planned', memo: '' };
test('appendPlanBlock creates and updates/deletes target blocks', withVault(async (dir) => {
  await appendPlanBlock('2026-07-26', first);
  await appendPlanBlock('2026-07-26', { ...first, id: 'p-2', subject: '数学IA', start: '11:00', end: '12:00' });
  await updatePlanBlock('2026-07-26', 'p-1', { status: 'done' });
  await deletePlanBlock('2026-07-26', 'p-2');
  const raw = await readFile(path.join(dir, 'plans', '2026-07-26.md'), 'utf8');
  assert.match(raw, /id=p-1.*status=done/); assert.doesNotMatch(raw, /id=p-2/);
}));
test('appendPlanBlock inserts before a following handwritten heading', withVault(async (dir) => {
  const file = path.join(dir, 'plans', '2026-07-26.md'); await (await import('node:fs/promises')).mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, ['---', 'type: study-plan', '---', '', '## 計画', '', '### 手書きメモ', '準備', ''].join('\n'));
  await appendPlanBlock('2026-07-26', first); const raw = await readFile(file, 'utf8'); assert.ok(raw.indexOf('id=p-1') < raw.indexOf('### 手書きメモ'));
}));
