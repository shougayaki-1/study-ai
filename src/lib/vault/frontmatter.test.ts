import { describe, expect, it } from "vitest";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";

// NOTE: このフィクスチャは analysis/test/vault-frontmatter.test.mjs と一字一句同一に保つ
//       (契約: TS版とNode版でパース結果を完全一致させる)
const FIXTURE_RAW = [
  "---",
  "type: karte",
  "subject: 日本史",
  "updated: 2026-07-24T23:40:00+09:00",
  "source: nightly-batch",
  "schema_version: 1",
  "---",
  "",
  "# 弱点カルテ",
  "",
  "本文...",
].join("\n");

const FIXTURE_FRONTMATTER = {
  type: "karte",
  subject: "日本史",
  updated: "2026-07-24T23:40:00+09:00",
  source: "nightly-batch",
  schema_version: 1,
};

const FIXTURE_BODY = "# 弱点カルテ\n\n本文...";

describe("parseFrontmatter", () => {
  it("parses frontmatter fields and body", () => {
    const { frontmatter, body } = parseFrontmatter(FIXTURE_RAW);
    expect(frontmatter).toEqual(FIXTURE_FRONTMATTER);
    expect(body).toBe(FIXTURE_BODY);
  });

  it("throws when the opening delimiter is missing", () => {
    expect(() => parseFrontmatter("no frontmatter here")).toThrow(
      "vault file is missing frontmatter opening delimiter (---)"
    );
  });

  it("throws when the closing delimiter is missing", () => {
    expect(() => parseFrontmatter("---\ntype: karte\nbody only")).toThrow(
      "vault file is missing frontmatter closing delimiter (---)"
    );
  });
});

describe("stringifyFrontmatter", () => {
  it("produces the exact contract format and round-trips through parseFrontmatter", () => {
    const raw = stringifyFrontmatter(FIXTURE_FRONTMATTER, FIXTURE_BODY);
    expect(raw).toBe(FIXTURE_RAW);
    expect(parseFrontmatter(raw)).toEqual({ frontmatter: FIXTURE_FRONTMATTER, body: FIXTURE_BODY });
  });
});
