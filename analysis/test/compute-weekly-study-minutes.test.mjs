import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWeeklyStudyMinutes,
  datesInWeek,
  isoWeekToMonday,
} from '../helpers/compute-weekly-study-minutes.mjs';

test('isoWeekToMonday returns the Monday of the given ISO week', () => {
  assert.equal(isoWeekToMonday('2026-W31'), '2026-07-27');
});

test('datesInWeek returns 7 consecutive dates starting from Monday', () => {
  assert.deepEqual(datesInWeek('2026-W31'), [
    '2026-07-27',
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
  ]);
});

test('computeWeeklyStudyMinutes sums minutes per subject across days, sorted descending', () => {
  const result = computeWeeklyStudyMinutes([
    {
      date: '2026-07-27',
      sessions: [
        { subject: '英語R', minutes: 60 },
        { subject: '数学2BC', minutes: 30 },
      ],
    },
    {
      date: '2026-07-28',
      sessions: [{ subject: '英語R', minutes: 30 }],
    },
  ]);
  assert.deepEqual(result, {
    type: 'bar',
    unit: '分',
    series: [
      { label: '英語R', value: 90 },
      { label: '数学2BC', value: 30 },
    ],
  });
});

test('computeWeeklyStudyMinutes returns an empty series when there are no sessions', () => {
  assert.deepEqual(
    computeWeeklyStudyMinutes([{ date: '2026-07-27', sessions: [] }]),
    { type: 'bar', unit: '分', series: [] },
  );
});
