export type VaultSource = "fs" | "supabase";

export function getVaultSource(): VaultSource {
  return process.env.STUDY_AI_VAULT_SOURCE === "supabase" ? "supabase" : "fs";
}
