import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readVaultFile = vi.fn();
vi.mock("./read", () => ({ readVaultFile: (path: string) => readVaultFile(path) }));

describe("readSkills", () => {
  beforeEach(() => readVaultFile.mockReset());
  afterEach(() => vi.resetModules());

  it("科目名から derived JSON を読む", async () => {
    const file = {
      schema_version: 1, subject: "化学基礎", generated_at: "2026-08-02T03:00:00+09:00",
      topics: [{
        key: "物質の構成 > 化学結合 > 分子とその形", topic_path: ["物質の構成", "化学結合", "分子とその形"],
        group: "化学結合", name: "分子とその形", attempts: 8, correct: 8, accuracy: 1,
        recent: ["correct", "correct", "correct", "correct", "correct"],
        last_practiced_date: "2026-08-01", avg_duration_sec: 19, state: "stable", recent_attempts: [],
      }],
    };
    readVaultFile.mockResolvedValue({ frontmatter: {}, body: "", raw: JSON.stringify(file) });
    const { readSkills } = await import("./skills");
    const result = await readSkills("化学基礎");
    expect(readVaultFile).toHaveBeenCalledWith("data/derived/skills-化学基礎.json");
    expect(result?.topics[0].name).toBe("分子とその形");
  });

  it("派生ファイルが無い、またはJSONが壊れていれば null", async () => {
    readVaultFile.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: "ENOENT" }));
    const { readSkills } = await import("./skills");
    expect(await readSkills("未集計科目")).toBeNull();
    readVaultFile.mockResolvedValueOnce({ frontmatter: {}, body: "", raw: "{ broken" });
    expect(await readSkills("化学基礎")).toBeNull();
  });

  it("科目名のパス区切り文字をファイル名から除去する", async () => {
    readVaultFile.mockResolvedValue({ frontmatter: {}, body: "", raw: '{"schema_version":1,"subject":"a/b","generated_at":"x","topics":[]}' });
    const { readSkills } = await import("./skills");
    await readSkills("a/b");
    expect(readVaultFile).toHaveBeenCalledWith("data/derived/skills-a_b.json");
  });
});
