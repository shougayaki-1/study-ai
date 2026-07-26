import { describe, expect, it } from "vitest";
import { escapeLikePrefix, fetchAllPages, VAULT_FILES_PAGE_SIZE } from "./supabase-client";

/** PostgREST の max_rows 打ち切りを模したフェイク: 1回のリクエストで pageSize 件までしか返さない。 */
function makeTruncatingBackend(rows: string[], pageSize: number) {
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const limit = Math.min(to - from + 1, pageSize);
    return rows.slice(from, from + limit);
  };
  return { fetchPage, calls };
}

describe("fetchAllPages", () => {
  it("ページサイズを超える件数でも全件を取得する（打ち切られない）", async () => {
    const pageSize = 500;
    const rows = Array.from({ length: pageSize * 2 + 37 }, (_, i) => `records/row-${i}.md`);
    const { fetchPage, calls } = makeTruncatingBackend(rows, pageSize);

    expect(await fetchAllPages(fetchPage, pageSize)).toEqual(rows);
    expect(calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("最終ページがちょうどページサイズのときも、空ページを確認してから終了する", async () => {
    const pageSize = 10;
    const rows = Array.from({ length: pageSize * 2 }, (_, i) => `records/row-${i}.md`);
    const { fetchPage, calls } = makeTruncatingBackend(rows, pageSize);

    expect(await fetchAllPages(fetchPage, pageSize)).toEqual(rows);
    expect(calls).toHaveLength(3);
  });

  it("1ページに満たないときは1回だけ取得する", async () => {
    const rows = ["records/2026-07-25.md"];
    const { fetchPage, calls } = makeTruncatingBackend(rows, VAULT_FILES_PAGE_SIZE);

    expect(await fetchAllPages(fetchPage)).toEqual(rows);
    expect(calls).toHaveLength(1);
  });

  it("空のときは空配列を返す", async () => {
    const { fetchPage, calls } = makeTruncatingBackend([], 5);
    expect(await fetchAllPages(fetchPage, 5)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe("escapeLikePrefix", () => {
  it("LIKE のワイルドカードをエスケープする", () => {
    expect(escapeLikePrefix("_inbox/")).toBe("\\_inbox/");
    expect(escapeLikePrefix("100%/a_b")).toBe("100\\%/a\\_b");
    expect(escapeLikePrefix("back\\slash/")).toBe("back\\\\slash/");
  });

  it("ワイルドカードを含まないプレフィックスはそのまま返す", () => {
    expect(escapeLikePrefix("records/")).toBe("records/");
    expect(escapeLikePrefix("reports/daily/")).toBe("reports/daily/");
  });
});
