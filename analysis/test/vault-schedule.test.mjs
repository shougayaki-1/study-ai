import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendScheduleEvent, deleteScheduleEvent, parseScheduleEvents, formatScheduleEventLine, nextEventId, updateScheduleEvent } from '../helpers/vault/schedule.mjs';

const SCHEDULE_FIXTURE_BODY = readFileSync(
  path.join(process.cwd(), 'analysis/test/fixtures/schedule.md'),
  'utf8'
);

test('parseScheduleEvents parses checkbox state and fields in the fixed key order', () => {
  assert.deepEqual(parseScheduleEvents(SCHEDULE_FIXTURE_BODY), [
    { id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false },
    { id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: true },
  ]);
});

test('parseScheduleEvents returns [] when there are no event lines', () => {
  assert.deepEqual(parseScheduleEvents('## 予定\n'), []);
});

test('formatScheduleEventLine formats undone/done events with the correct prefix', () => {
  assert.equal(
    formatScheduleEventLine({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false }),
    '- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01'
  );
  assert.equal(
    formatScheduleEventLine({ id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: true }),
    '- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20'
  );
});

test('nextEventId returns ev-<max+1>, and ev-1 when there are no events', () => {
  assert.equal(nextEventId([]), 'ev-1');
  assert.equal(nextEventId(parseScheduleEvents(SCHEDULE_FIXTURE_BODY)), 'ev-3');
});

test('formatScheduleEventLine throws when a field value contains the " | " delimiter', () => {
  assert.throws(() =>
    formatScheduleEventLine({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試 | 会場未定', due: '2026-08-01', done: false })
  );
});

test('formatScheduleEventLine throws when a field value contains a newline', () => {
  assert.throws(() =>
    formatScheduleEventLine({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試\n会場未定', due: '2026-08-01', done: false })
  );
});

function withVault(fn) {
  return async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vault-schedule-'));
    const prev = process.env.STUDY_AI_VAULT_DIR;
    process.env.STUDY_AI_VAULT_DIR = dir;
    try { await fn(dir); } finally {
      await rm(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.STUDY_AI_VAULT_DIR;
      else process.env.STUDY_AI_VAULT_DIR = prev;
    }
  };
}

test('appendScheduleEvent creates schedule.md and preserves existing events', withVault(async (dir) => {
  await appendScheduleEvent({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false });
  await appendScheduleEvent({ id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: false });
  const raw = await readFile(path.join(dir, 'schedule.md'), 'utf8');
  assert.match(raw, /## 予定/);
  assert.equal(parseScheduleEvents(raw).length, 2);
}));

test('appendScheduleEvent inserts before a following handwritten heading', withVault(async (dir) => {
  await writeFile(path.join(dir, 'schedule.md'), ['---', 'type: schedule', '---', '', '## 予定', '- [ ] id=ev-1 | kind=exam | title=本番 | due=2026-08-01', '', '### 手書きメモ', '忘れ物なし', ''].join('\n'));
  await appendScheduleEvent({ id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: false });
  const raw = await readFile(path.join(dir, 'schedule.md'), 'utf8');
  assert.ok(raw.indexOf('id=ev-2') < raw.indexOf('### 手書きメモ'));
}));

test('updateScheduleEvent and deleteScheduleEvent change only the target line', withVault(async (dir) => {
  await appendScheduleEvent({ id: 'ev-1', kind: 'mock_exam', title: '第2回模試', due: '2026-08-01', done: false });
  await appendScheduleEvent({ id: 'ev-2', kind: 'assignment', title: '英語課題', due: '2026-07-20', done: false });
  await updateScheduleEvent('ev-1', { due: '2026-08-15' });
  await deleteScheduleEvent('ev-2');
  const raw = await readFile(path.join(dir, 'schedule.md'), 'utf8');
  assert.match(raw, /id=ev-1.*due=2026-08-15/);
  assert.doesNotMatch(raw, /id=ev-2/);
}));
