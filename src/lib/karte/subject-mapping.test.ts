import { describe, expect, it } from "vitest";
import { resolveSubjectGroup, SUBJECTS } from "./subject-mapping";

describe("resolveSubjectGroup", () => {
  it("正式科目名はそのまま返す", () => {
    expect(resolveSubjectGroup("英語R")).toBe("英語R");
    expect(resolveSubjectGroup("化学基礎")).toBe("化学基礎");
  });

  it("既知のエイリアスを正式科目名へ変換する", () => {
    expect(resolveSubjectGroup("古文単語")).toBe("古文");
    expect(resolveSubjectGroup("古文文法")).toBe("古文");
    expect(resolveSubjectGroup("地理総合")).toBe("地理");
    expect(resolveSubjectGroup("ベストフィット情報Ⅰ（実教出版）")).toBe(
      "情報",
    );
  });

  it("範囲が異なる可能性がある名称や未確定の名称は未分類のままにする", () => {
    expect(resolveSubjectGroup("数学C")).toBe("unmapped");
    expect(resolveSubjectGroup("公共")).toBe("unmapped");
    expect(resolveSubjectGroup("高校英単語")).toBe("unmapped");
  });

  it("SUBJECTSは13科目である", () => {
    expect(SUBJECTS).toHaveLength(13);
  });
});
