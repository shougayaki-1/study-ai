export function updateStability(previousDays, performance) {
  const previous = previousDays == null ? 1 : Math.max(1, Number(previousDays));
  const next = performance >= 0.85 ? previous * 2
    : performance >= 0.6 ? previous * 1.5
      : previous * 0.5;
  return Math.max(1, Math.min(60, Math.round(next * 10) / 10));
}

export function computeAdaptiveState(events) {
  const ordered = events
    .filter((event) => Number.isFinite(event.performance) && event.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  let stability = null;
  for (const event of ordered) stability = updateStability(stability, event.performance);
  if (!ordered.length) return { reviewCount: 0, stabilityDays: null, nextReviewDate: null };
  const last = new Date(ordered.at(-1).date);
  last.setUTCDate(last.getUTCDate() + Math.round(stability));
  return { reviewCount: ordered.length, stabilityDays: stability, nextReviewDate: last.toISOString().slice(0, 10) };
}

export function understandingPerformance(value) {
  if (value === 'understood') return 0.9;
  if (value === 'uncertain') return 0.6;
  if (value === 'not_understood') return 0.3;
  return null;
}
