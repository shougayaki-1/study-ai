import type { SkillsFile } from "@/lib/vault";
import { describe, expect, it, vi } from "vitest";

const readSkills = vi.fn();
const listKarteSubjects = vi.fn();
vi.mock("@/lib/vault", () => ({
  readSkills: (subject: string) => readSkills(subject),
}));
vi.mock("./list-subjects", () => ({
  listKarteSubjects: () => listKarteSubjects(),
}));

import { buildSubjectSummaries } from "./subject-summary";
import { SUBJECTS } from "./subject-mapping";

function skillsFile(
  subject: string,
  topics: SkillsFile["topics"],
): SkillsFile {
  return {
    schema_version: 1,
    subject,
    generated_at: "2026-08-01T00:00:00+09:00",
    topics,
  };
}

function topic(
  overrides: Partial<SkillsFile["topics"][number]>,
): SkillsFile["topics"][number] {
  return {
    key: "k",
    topic_path: ["a"],
    group: "a",
    name: "n",
    attempts: 5,
    correct: 3,
    accuracy: 0.6,
    recent: [],
    last_practiced_date: null,
    avg_duration_sec: null,
    state: "stable",
    recent_attempts: [],
    ...overrides,
  };
}

describe("buildSubjectSummaries", () => {
  it("13科目 + unmapped の全グループを返す", async () => {
    listKarteSubjects.mockResolvedValue([]);
    const result = await buildSubjectSummaries();
    expect(result.map((summary) => summary.subject)).toEqual([
      ...SUBJECTS,
      "unmapped",
    ]);
  });

  it("エイリアスされた複数の教材キーを1つの科目に集約し、件数と最終学習日を集計する", async () => {
    listKarteSubjects.mockResolvedValue(["古文単語", "古文文法"]);
    readSkills.mockImplementation(async (key: string) => {
      if (key === "古文単語") {
        return skillsFile(key, [
          topic({
            key: "w1",
            state: "weak",
            last_practiced_date: "2026-08-01",
          }),
          topic({
            key: "s1",
            state: "stable",
            last_practiced_date: "2026-07-20",
          }),
        ]);
      }
      return skillsFile(key, [
        topic({
          key: "u1",
          state: "unstable",
          last_practiced_date: "2026-08-02",
        }),
      ]);
    });
    const result = await buildSubjectSummaries();
    const kobun = result.find((summary) => summary.subject === "古文");
    expect(kobun).toMatchObject({
      sourceKeys: ["古文単語", "古文文法"],
      totalTopics: 3,
      weakCount: 1,
      unstableCount: 1,
      stableCount: 1,
      insufficientCount: 0,
      lastPracticedDate: "2026-08-02",
    });
  });

  it("紐付け先の無い教材キーはunmappedへ入る", async () => {
    listKarteSubjects.mockResolvedValue(["数学C"]);
    readSkills.mockResolvedValue(
      skillsFile("数学C", [topic({ key: "m1", state: "weak" })]),
    );
    const result = await buildSubjectSummaries();
    const unmapped = result.find((summary) => summary.subject === "unmapped");
    expect(unmapped?.sourceKeys).toEqual(["数学C"]);
    expect(unmapped?.weakCount).toBe(1);
  });

  it("データが無い科目はtotalTopics=0のまま返す", async () => {
    listKarteSubjects.mockResolvedValue([]);
    const result = await buildSubjectSummaries();
    const eigo = result.find((summary) => summary.subject === "英語R");
    expect(eigo).toMatchObject({
      sourceKeys: [],
      totalTopics: 0,
      lastPracticedDate: null,
    });
  });
});
