// analysis/helpers/lib.mjs
// 共有ライブラリ: analysis/.env を読み込み、Supabase REST API / Storage API を
// Node標準の fetch だけで叩くための最小限のヘルパー。依存パッケージ追加なし。
//
// 前提: Node.js 18+ (グローバル fetch が使える)

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANALYSIS_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ANALYSIS_DIR, '.env');

/** analysis/.env (KEY=VALUE 形式, # コメント可) を読み込み process.env にマージする */
export function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(
      `analysis/.env が見つかりません (${ENV_PATH})。analysis/.env.example をコピーして値を設定してください。`
    );
  }
  const raw = readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 前後のクォートを除去
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が analysis/.env に設定されていません。'
    );
  }
  return { url: url.replace(/\/$/, ''), key };
}

function authHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

/**
 * PostgREST 経由でテーブルを操作する薄いクライアント。
 * table.select(query), table.insert(rows), table.upsert(rows, onConflict),
 * table.update(patch, query), table.delete(query)
 * query は PostgREST のクエリ文字列 (例: "unit_id=eq.xxx&order=created_at.desc")
 */
export function restClient() {
  const { url, key } = loadEnv();
  const base = `${url}/rest/v1`;

  async function request(method, table, { query = '', body, prefer } = {}) {
    const headers = authHeaders(key, { 'Content-Type': 'application/json' });
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${base}/${table}${query ? `?${query}` : ''}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase REST ${method} ${table} failed: ${res.status} ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    select: (table, query = '') => request('GET', table, { query }),
    insert: (table, rows) =>
      request('POST', table, {
        body: rows,
        prefer: 'return=representation',
      }),
    upsert: (table, rows, onConflict) =>
      request('POST', table, {
        query: onConflict ? `on_conflict=${onConflict}` : '',
        body: rows,
        prefer: 'resolution=merge-duplicates,return=representation',
      }),
    update: (table, patch, query) =>
      request('PATCH', table, { query, body: patch, prefer: 'return=representation' }),
    remove: (table, query) => request('DELETE', table, { query, prefer: 'return=representation' }),
  };
}

/** Supabase Storage から画像をダウンロードし、ローカルパスに保存する */
export async function downloadStorageObject(bucket, storagePath, destPath) {
  const { url, key } = loadEnv();
  const res = await fetch(
    `${url}/storage/v1/object/${bucket}/${storagePath}`,
    { headers: authHeaders(key) }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Storage download failed: ${res.status} ${text}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(path.dirname(destPath), { recursive: true });
  writeFileSync(destPath, buf);
  return destPath;
}

/** helpers スクリプトの CLI 共通: 標準出力に JSON を1行で出す */
export function printJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

export const TMP_DIR = path.join(ANALYSIS_DIR, 'tmp');
