// 対話/CLIで使う13科目の正式名一覧。analysis/helpers/add-plan-block.mjs の
// SUBJECTS 定数と同じ集合を維持すること(手動同期)。
export const SUBJECTS = [
  "英語R",
  "英語L",
  "現代文",
  "古文",
  "漢文",
  "数学IA",
  "数学2BC",
  "化学基礎",
  "地学基礎",
  "地理",
  "政治経済",
  "情報",
  "小論文",
] as const;

export type Subject = (typeof SUBJECTS)[number];

// vault内の実データ(subjects/ ディレクトリ名、data/derived/skills-*.json の教材名)を
// 正式科目名へ名寄せする対応表。範囲が異なる可能性がある組(政治経済/公共、数学2BC/数学C)や、
// 複数科目にまたがる可能性がある教材(高校英単語)は、誤って紐付けるより「未分類」として
// 目視確認できる状態を維持するため、意図的にここへ含めない。
export const SUBJECT_ALIASES: Record<string, Subject> = {
  古文単語: "古文",
  古文文法: "古文",
  地理総合: "地理",
  "ベストフィット情報Ⅰ（実教出版）": "情報",
};

export function resolveSubjectGroup(rawKey: string): Subject | "unmapped" {
  if ((SUBJECTS as readonly string[]).includes(rawKey)) return rawKey as Subject;
  return SUBJECT_ALIASES[rawKey] ?? "unmapped";
}
