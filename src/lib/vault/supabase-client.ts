import { createClient } from "@/lib/supabase/server";

export type VaultFileRow = { path: string; content: string };

export type VaultFilesClient = {
  selectByPath(path: string): Promise<VaultFileRow | null>;
  selectByPrefix(prefix: string): Promise<VaultFileRow[]>;
};

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
      const { data, error } = await supabase
        .from("vault_files")
        .select("path, content")
        .like("path", `${prefix}%`);
      if (error) throw error;
      return data ?? [];
    },
  };
}
