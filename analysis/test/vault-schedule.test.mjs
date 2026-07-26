import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseScheduleEvents, formatScheduleEventLine, nextEventId } from '../helpers/vault/schedule.mjs';

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
