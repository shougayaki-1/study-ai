import { readVaultFile } from "./read";

export type ReportBarChart = {
  type: "bar";
  unit: string;
  series: { label: string; value: number }[];
};

export type ReportChartFile = Record<string, ReportBarChart>;

function chartRelPath(reportPath: string): string {
  return reportPath.replace(/\.md$/, ".chart.json");
}

export async function readReportChart(
  reportPath: string,
): Promise<ReportChartFile | null> {
  try {
    const { raw } = await readVaultFile(chartRelPath(reportPath));
    return JSON.parse(raw) as ReportChartFile;
  } catch {
    return null;
  }
}
