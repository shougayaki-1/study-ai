import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendStudySession,
  deleteStudySession,
  formatStudySessionLine,
  nextSessionId,
  parseStudySessions,
  updateStudySession,
} from '../helpers/vault/study-sessions.mjs';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const body = readFileSync(path.join(fixtureDir, 'fixtures', 'study-record.md'), 'utf8');

test('parseStudySessions parses the shared fixture', () => {
  assert.deepEqual(parseStudySessions(body), [
    { id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '長文2題' },
    { id: 's-2', subject: '数学IA', minutes: 90, kind: 'common_test', year: 2025, section: '第3問', understanding: 'uncertain', memo: '' },
  ]);
});
test('parseStudySessions returns [] for a body with no session lines', () => assert.deepEqual(parseStudySessions('本文だけ\n'), []));
test('parseStudySessions skips missing required key', () => assert.deepEqual(parseStudySessions('- id=s-9 | subject=英語R | kind=material | understanding=understood | memo='), []));
test('formatStudySessionLine formats material', () => assert.equal(formatStudySessionLine({ id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '長文2題' }), '- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題'));
test('formatStudySessionLine formats common_test', () => assert.equal(formatStudySessionLine({ id: 's-2', subject: '数学IA', minutes: 90, kind: 'common_test', year: 2025, section: '第3問', understanding: 'uncertain', memo: '' }), '- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo='));
test('formatter rejects delimiter', () => assert.throws(() => formatStudySessionLine({ id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: 'a | b' })));
test('formatter rejects newline', () => assert.throws(() => formatStudySessionLine({ id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: 'a\nb' })));
test('formatter allows equals', () => assert.match(formatStudySessionLine({ id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: 'y=mx+b' }), /memo=y=mx\+b/));
test('nextSessionId allocates after max valid ID', () => { assert.equal(nextSessionId([]), 's-1'); assert.equal(nextSessionId([{ id: 's-1' }, { id: 's-2' }]), 's-3'); });

function withVault(fn) {
  return async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vault-study-sessions-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

test('appendStudySession creates records/<date>.md when it does not exist', withVault(async (dir) => {
  await appendStudySession('2026-07-25', { id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '長文2題' });
  const raw = await readFile(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /type: study-record/);
  assert.match(raw, /date: 2026-07-25/);
  assert.match(raw, /## セッション/);
  assert.match(raw, /- id=s-1 \| subject=英語R \| minutes=60 \| kind=material \| understanding=understood \| memo=長文2題/);
}));

test('appendStudySession appends a second session without losing the first', withVault(async (dir) => {
  await appendStudySession('2026-07-25', { id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '' });
  await appendStudySession('2026-07-25', { id: 's-2', subject: '数学IA', minutes: 90, kind: 'common_test', year: 2025, section: '第3問', understanding: 'uncertain', memo: '' });
  const raw = await readFile(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /id=s-1/);
  assert.match(raw, /id=s-2/);
}));

test('updateStudySession rewrites only the targeted line', withVault(async (dir) => {
  await appendStudySession('2026-07-25', { id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '' });
  await appendStudySession('2026-07-25', { id: 's-2', subject: '数学IA', minutes: 90, kind: 'material', understanding: 'uncertain', memo: '' });
  await updateStudySession('2026-07-25', 's-2', { minutes: 120, understanding: 'understood' });
  const raw = await readFile(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.match(raw, /id=s-1 \| subject=英語R \| minutes=60/);
  assert.match(raw, /id=s-2 \| subject=数学IA \| minutes=120 \| kind=material \| understanding=understood/);
}));

test('deleteStudySession removes only the targeted line', withVault(async (dir) => {
  await appendStudySession('2026-07-25', { id: 's-1', subject: '英語R', minutes: 60, kind: 'material', understanding: 'understood', memo: '' });
  await appendStudySession('2026-07-25', { id: 's-2', subject: '数学IA', minutes: 90, kind: 'material', understanding: 'uncertain', memo: '' });
  await deleteStudySession('2026-07-25', 's-1');
  const raw = await readFile(path.join(dir, 'records', '2026-07-25.md'), 'utf8');
  assert.doesNotMatch(raw, /id=s-1/);
  assert.match(raw, /id=s-2/);
}));

test('appendStudySession preserves unparseable lines and inserts before a handwritten heading', withVault(async (dir) => {
  const recordsDir = path.join(dir, 'records');
  await mkdir(recordsDir, { recursive: true });
  await writeFile(path.join(recordsDir, '2026-07-25.md'), [
    '---', 'type: study-record', 'date: 2026-07-25', 'source: dialogue', 'schema_version: 1', 'updated: 2026-07-25T00:00:00+09:00', '---', '',
    '## セッション',
    '- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=',
    '- id=s-broken | subject=英語R', '', '### 手書きメモ', '今日は集中できた。', '',
  ].join('\n'), 'utf8');
  await appendStudySession('2026-07-25', { id: 's-2', subject: '数学IA', minutes: 90, kind: 'material', understanding: 'uncertain', memo: '' });
  const raw = await readFile(path.join(recordsDir, '2026-07-25.md'), 'utf8');
  assert.match(raw, /- id=s-broken \| subject=英語R/);
  assert.match(raw, /### 手書きメモ/);
  assert.match(raw, /今日は集中できた。/);
  const lines = raw.split('\n');
  assert.ok(lines.findIndex((line) => line.includes('id=s-2')) < lines.findIndex((line) => line.includes('### 手書きメモ')), 'new session stays in the session section before handwritten notes');
}));

test('updateStudySession preserves lines it cannot parse when rewriting a target line', withVault(async (dir) => {
  const recordsDir = path.join(dir, 'records');
  await mkdir(recordsDir, { recursive: true });
  await writeFile(path.join(recordsDir, '2026-07-25.md'), [
    '---', 'type: study-record', 'date: 2026-07-25', 'source: dialogue', 'schema_version: 1', 'updated: 2026-07-25T00:00:00+09:00', '---', '',
    '## セッション', '- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=', '- id=s-broken | subject=英語R', '',
  ].join('\n'), 'utf8');
  await updateStudySession('2026-07-25', 's-1', { minutes: 90 });
  const raw = await readFile(path.join(recordsDir, '2026-07-25.md'), 'utf8');
  assert.match(raw, /id=s-1 \| subject=英語R \| minutes=90/);
  assert.match(raw, /- id=s-broken \| subject=英語R/);
}));
