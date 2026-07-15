import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

// Supabase未設定(env無し)でもビルド/静的生成が壊れないよう、
// プレースホルダー値にフォールバックする。実行時の呼び出しはSupabase側で失敗するが、
// 呼び出し元(各ページ)がtry/catchでハンドリングする。
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createBrowserClient<Database>(url, anonKey);
}
