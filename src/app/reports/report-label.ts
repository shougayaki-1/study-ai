import type { ReportMeta } from "@/lib/vault";

export function reportLabel(meta: ReportMeta): string {
  const kindLabel = meta.frontmatter.type === "weekly-report" ? "週次" : "日次";
  return `${meta.date} (${kindLabel})`;
}
