export type ReportSection = { heading: string; body: string };

// "# タイトル" 直下から始まる "## 見出し" ごとにMarkdown本文を分割する。
// build-daily-report.mjs / build-weekly-report.mjs が生成する
// "# <date> 日次レポート\n\n## 見出し\n\n本文..." という形式に対応する。
export function parseReportSections(markdownBody: string): ReportSection[] {
  const lines = markdownBody.split("\n");
  const sections: ReportSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentHeading === null) return;
    sections.push({
      heading: currentHeading,
      body: currentLines.join("\n").trim(),
    });
  };

  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      flush();
      currentHeading = match[1].trim();
      currentLines = [];
      continue;
    }
    if (currentHeading !== null) currentLines.push(line);
  }
  flush();
  return sections;
}
