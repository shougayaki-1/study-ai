import { describe, expect, it } from "vitest";
import { buildWeeklyStudySeries, calculatePlanExecution } from "./study-metrics";

describe("study metrics", () => {
  it("groups sessions by JST Monday without UTC rollback", () => {
    const result = buildWeeklyStudySeries([
      { subject_id: "math", minutes: 30, started_at: "2026-07-19T14:30:00.000Z" },
      { subject_id: "math", minutes: 45, started_at: "2026-07-19T15:30:00.000Z" },
    ], new Date("2026-07-20T12:00:00+09:00"), 2);
    expect(result.weekKeys).toEqual(["2026-07-13", "2026-07-20"]);
    expect(result.data.map((row) => row.total)).toEqual([30, 45]);
  });

  it("calculates only matured plan blocks in the previous 28 days", () => {
    expect(calculatePlanExecution([
      { plan_date: "2026-06-21", status: "done", linked_session_batch_id: "batch" },
      { plan_date: "2026-07-18", status: "planned", linked_session_batch_id: null },
      { plan_date: "2026-07-19", status: "done", linked_session_batch_id: "future" },
    ], "2026-07-19")).toEqual({ total: 2, done: 1, linked: 1, rate: 50 });
  });
});
