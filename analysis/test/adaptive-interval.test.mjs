import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAdaptiveState, updateStability } from '../helpers/adaptive-interval.mjs';

test('adaptive stability grows for strong performance and is capped', () => {
  assert.equal(updateStability(4, 0.9), 8);
  assert.equal(updateStability(40, 0.9), 60);
});

test('adaptive stability drops but never below one day', () => {
  assert.equal(updateStability(8, 0.4), 4);
  assert.equal(updateStability(1, 0.2), 1);
});

test('adaptive state returns a due date from the final event', () => {
  const state = computeAdaptiveState([
    { date: '2026-07-01T00:00:00Z', performance: 0.9 },
    { date: '2026-07-03T00:00:00Z', performance: 0.9 },
    { date: '2026-07-05T00:00:00Z', performance: 0.6 },
  ]);
  assert.equal(state.reviewCount, 3);
  assert.equal(state.stabilityDays, 6);
  assert.equal(state.nextReviewDate, '2026-07-11');
});
