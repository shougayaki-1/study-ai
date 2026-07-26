// analysis/.env から STUDY_AI_VAULT_DIR だけを process.env に取り込む。
//
// lib.mjs の loadEnv() は Supabase の認証情報が無いと throw するため、vault にしか
// 触らないヘルパーからは使えない。ここは vault ルートの解決だけを担う。
//
// **CLIラッパーの main ブロック(シェルから直接実行されたとき)からのみ呼ぶこと。**
// モジュールのトップレベルや run() の中で呼ぶと、STUDY_AI_VAULT_DIR を明示的に
// 与えるテストの前提が実行環境の analysis/.env に左右されてしまう。
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ANALYSIS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_PATH = path.join(ANALYSIS_DIR, '.env');

// envPath はテストから一時ディレクトリの .env を注入するためのもの。
// 本番(CLIラッパー)は引数なしで呼ぶこと。
export function loadVaultEnv({ envPath = ENV_PATH } = {}) {
  // シェルが export 済み(run-nightly.sh 経由など)なら何もしない。
  if (process.env.STUDY_AI_VAULT_DIR) return;
  // .env が無ければ何もしない(root.mjs が従来どおり「未設定」で throw する)。
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== 'STUDY_AI_VAULT_DIR') continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) process.env.STUDY_AI_VAULT_DIR = value;
    return;
  }
}
