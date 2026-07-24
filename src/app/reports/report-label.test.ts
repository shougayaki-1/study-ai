import { describe, expect, it } from "vitest";
import type { ReportMeta } from "@/lib/vault";
import { reportLabel } from "./report-label";

describe("reportLabel", () => {
  it("labels a daily report with its date", () => {
    const meta: ReportMeta = {
      path: "reports/daily/2026-07-24.md",
      date: "2026-07-24",
      frontmatter: { type: "daily-report", date: "2026-07-24" },
    };
    expect(reportLabel(meta)).toBe("2026-07-24 (日次)");
  });

  it("labels a weekly report with its date", () => {
    const meta: ReportMeta = {
      path: "reports/weekly/2026-W30.md",
      date: "2026-W30",
      frontmatter: { type: "weekly-report", week: "2026-W30" },
    };
    expect(reportLabel(meta)).toBe("2026-W30 (週次)");
  });
});
