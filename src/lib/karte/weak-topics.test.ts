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

import { collectWeakTopics } from "./weak-topics";

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
    correct: 1,
    accuracy: 0.2,
    recent: [],
    last_practiced_date: null,
    avg_duration_sec: null,
    state: "weak",
    recent_attempts: [],
    ...overrides,
  };
}

describe("collectWeakTopics", () => {
  it("state=weak の単元だけを集め、正答率が低い順・試行数が多い順に並べる", async () => {
    listKarteSubjects.mockResolvedValue(["英語R", "古文単語"]);
    readSkills.mockImplementation(async (subject: string) => {
      if (subject === "英語R") {
        return skillsFile("英語R", [
          topic({
            key: "r1",
            name: "語彙",
            state: "weak",
            accuracy: 0.4,
            attempts: 10,
          }),
          topic({
            key: "r2",
            name: "読解",
            state: "stable",
            accuracy: 0.9,
            attempts: 10,
          }),
        ]);
      }
      return skillsFile("古文単語", [
        topic({
          key: "k1",
          name: "助動詞",
          state: "weak",
          accuracy: 0.2,
          attempts: 8,
        }),
      ]);
    });
    const result = await collectWeakTopics(5);
    expect(result.map((entry) => entry.topic.key)).toEqual(["k1", "r1"]);
    expect(result[0].canonicalSubject).toBe("古文");
    expect(result[0].subjectKey).toBe("古文単語");
  });

  it("skills.jsonが無い科目はスキップする", async () => {
    listKarteSubjects.mockResolvedValue(["英語R"]);
    readSkills.mockResolvedValue(null);
    expect(await collectWeakTopics(5)).toEqual([]);
  });

  it("limitで件数を絞る", async () => {
    listKarteSubjects.mockResolvedValue(["化学基礎"]);
    readSkills.mockResolvedValue(
      skillsFile("化学基礎", [
        topic({ key: "c1", accuracy: 0.1, attempts: 5 }),
        topic({ key: "c2", accuracy: 0.2, attempts: 5 }),
        topic({ key: "c3", accuracy: 0.3, attempts: 5 }),
      ]),
    );
    const result = await collectWeakTopics(2);
    expect(result).toHaveLength(2);
  });
});
