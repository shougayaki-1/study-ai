import { describe, expect, it, vi } from "vitest";

const readVaultFile = vi.fn();
vi.mock("./read", () => ({
  readVaultFile: (path: string) => readVaultFile(path),
}));

import { readReportChart } from "./report-charts";

describe("readReportChart", () => {
  it("レポートパスから.chart.jsonを読む", async () => {
    const file = {
      週次学習時間: {
        type: "bar",
        unit: "分",
        series: [{ label: "英語R", value: 360 }],
      },
    };
    readVaultFile.mockResolvedValue({
      frontmatter: {},
      body: "",
      raw: JSON.stringify(file),
    });
    const result = await readReportChart("reports/weekly/2026-W31.md");
    expect(readVaultFile).toHaveBeenCalledWith(
      "reports/weekly/2026-W31.chart.json",
    );
    expect(result?.["週次学習時間"].series[0].value).toBe(360);
  });

  it("ファイルが無い、またはJSONが壊れていればnull", async () => {
    readVaultFile.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { code: "ENOENT" }),
    );
    expect(await readReportChart("reports/daily/2026-08-01.md")).toBeNull();
    readVaultFile.mockResolvedValueOnce({
      frontmatter: {},
      body: "",
      raw: "{ broken",
    });
    expect(await readReportChart("reports/daily/2026-08-01.md")).toBeNull();
  });
});
