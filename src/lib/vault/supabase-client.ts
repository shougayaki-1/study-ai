import { createClient } from "@/lib/supabase/server";

export type VaultFileRow = { path: string; content: string };

export type VaultFilesClient = {
  selectByPath(path: string): Promise<VaultFileRow | null>;
  selectByPrefix(prefix: string): Promise<VaultFileRow[]>;
  selectPathsByPrefix(prefix: string): Promise<string[]>;
};

/** analysis/helpers/sync-vault-to-supabase.mjs と同じページサイズ。 */
export const VAULT_FILES_PAGE_SIZE = 500;

/**
 * PostgREST は max_rows(既定1000)に達しても**エラーを返さず黙って打ち切る**ので、
 * プレフィックス検索は必ずページングして全件を取り切る。
 * fetchPage は [from, to] の閉区間（.range() と同じ）を受け取る。
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = VAULT_FILES_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/**
 * `%` `_` `\` は LIKE のワイルドカード/エスケープ文字なので、プレフィックスを
 * リテラルとして扱うためにエスケープする（例: 将来の `_inbox/` の `_` が
 * 1文字ワイルドカードとして効いてしまうのを防ぐ）。
 */
export function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function getVaultFilesClient(): Promise<VaultFilesClient> {
  const supabase = await createClient();
  return {
    async selectByPath(path) {
      const { data, error } = await supabase
        .from("vault_files")
        .select("path, content")
        .eq("path", path)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async selectByPrefix(prefix) {
      const pattern = `${escapeLikePrefix(prefix)}%`;
      return fetchAllPages<VaultFileRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("vault_files")
          .select("path, content")
          .like("path", pattern)
          .order("path", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      });
    },
    async selectPathsByPrefix(prefix) {
      // 一覧を作るだけなら content は不要。モバイル回線を想定して path のみ転送する。
      const pattern = `${escapeLikePrefix(prefix)}%`;
      const rows = await fetchAllPages<{ path: string }>(async (from, to) => {
        const { data, error } = await supabase
          .from("vault_files")
          .select("path")
          .like("path", pattern)
          .order("path", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      });
      return rows.map((row) => row.path);
    },
  };
}
