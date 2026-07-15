export const UNDERSTANDING_OPTIONS = [
  ["understood", "できた"],
  ["uncertain", "少し不安"],
  ["not_understood", "できなかった"],
] as const;

export type Understanding = (typeof UNDERSTANDING_OPTIONS)[number][0];
export type LearningState = "undiagnosed" | "learning" | "review" | "mastered" | "foundation";

export const UNDERSTANDING_LABELS: Record<Understanding, string> = {
  understood: "できた",
  uncertain: "少し不安",
  not_understood: "できなかった",
};

export const LEARNING_STATE_LABELS: Record<LearningState, string> = {
  undiagnosed: "未診断",
  learning: "習得中",
  review: "要復習",
  mastered: "定着",
  foundation: "要基礎固め",
};

export function describeProgress(previous: Understanding | null, current: Understanding) {
  if (!previous) return current === "understood" ? "初回確認" : "取り組み開始";
  if (previous === "not_understood" && current === "uncertain") return "前進";
  if (previous === "uncertain" && current === "understood") return "習得";
  if (previous === "understood" && current === "understood") return "定着";
  if (previous === "understood" && current !== "understood") return "要確認";
  if (current === "not_understood") return "課題継続";
  return "継続学習";
}

export function classifyLearningState(args: {
  hasData: boolean;
  currentUnderstanding: Understanding | null;
  accuracy: number | null;
  daysSinceStudy: number | null;
}): LearningState {
  const { hasData, currentUnderstanding, accuracy, daysSinceStudy } = args;
  if (!hasData) return "undiagnosed";
  if (currentUnderstanding === "not_understood" || (accuracy != null && accuracy < 0.45)) {
    return "foundation";
  }
  if (daysSinceStudy != null && daysSinceStudy >= 14) return "review";
  if (currentUnderstanding === "understood" && (accuracy == null || accuracy >= 0.75)) {
    return "mastered";
  }
  return "learning";
}

export function startOfWeekDate(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
