import { addDays, formatLocalDate, startOfWeek, type DateKey } from "@/lib/date";

export type StudyMetricSession = { subject_id: string; minutes: number; started_at: string };

export function buildWeeklyStudySeries(sessions: StudyMetricSession[], now = new Date(), weekCount = 8) {
  const currentWeek = startOfWeek(formatLocalDate(now));
  const weekKeys = Array.from({ length: weekCount }, (_, index) =>
    addDays(currentWeek, (index - weekCount + 1) * 7));
  const totals: Record<string, Record<string, number>> = Object.fromEntries(
    weekKeys.map((week) => [week, {}]),
  );

  sessions.forEach((session) => {
    const week = startOfWeek(formatLocalDate(new Date(session.started_at)));
    if (!totals[week]) return;
    totals[week][session.subject_id] = (totals[week][session.subject_id] ?? 0) + session.minutes;
  });

  const data = weekKeys.map((weekKey) => {
    const bySubject = totals[weekKey];
    return { weekKey, bySubject, total: Object.values(bySubject).reduce((sum, value) => sum + value, 0) };
  });
  return {
    weekKeys,
    data,
    maxMinutes: Math.max(0, ...data.map((row) => row.total)),
  };
}

export function calculatePlanExecution(
  rows: Array<{ plan_date: string; status: string; linked_session_batch_id: string | null }>,
  today: DateKey,
) {
  const cutoff = addDays(today, -28);
  const matured = rows.filter((row) => row.plan_date >= cutoff && row.plan_date < today);
  const done = matured.filter((row) => row.status === "done").length;
  return {
    total: matured.length,
    done,
    linked: matured.filter((row) => row.linked_session_batch_id).length,
    rate: matured.length ? Math.round(done / matured.length * 100) : null,
  };
}
