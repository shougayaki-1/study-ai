// アプリ全体で使う定数

// 共通テスト予定日(DESIGN.md 5.1)
export const COMMON_TEST_DATE = "2027-01-16";

export function daysUntil(dateStr: string, from: Date = new Date()): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diffMs = target.getTime() - base.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export const EVENT_KIND_LABELS: Record<string, string> = {
  assignment: "課題",
  application: "出願",
  mock_exam: "模試",
  exam: "試験",
  other: "その他",
};

export const EVENT_KIND_COLORS: Record<string, string> = {
  assignment: "#3f51b5",
  application: "#00897b",
  mock_exam: "#f9a825",
  exam: "#e53935",
  other: "#757575",
};

export const MATERIAL_KINDS = ["問題集", "参考書", "過去問"] as const;
