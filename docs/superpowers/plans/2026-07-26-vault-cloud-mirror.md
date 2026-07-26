# Phase 3: Vault Cloud Read-Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vault(Googleドライブ同期の`vault/`)を唯一の正本に保ったまま、Supabaseへ夜間バッチ経由で読み取り専用ミラー(`vault_files`テーブル)を作り、Vercel上のWebがそれを読むことで、Mac非起動時でもスマホから閲覧できるようにする。

**Architecture:** 夜間バッチ(`analysis/`)が`vault/`配下の`.md`のみをSupabaseの`vault_files`(path主キー・content・updated_at)へ一方向upsert/delete同期する。Webの`src/lib/vault/`各関数(`readVaultFile`/`listStudyRecordDates`/`listReports`/`listKarteSubjects`)は環境変数`STUDY_AI_VAULT_SOURCE`(`fs`|`supabase`、未設定は`fs`)でfs実装とSupabase実装を内部分岐し、既存のシグネチャ・パーサ・ページUIは変更しない。クラウド側(`STUDY_AI_VAULT_SOURCE=supabase`)は`/schedule`の完了チェックボックスを出さず閲覧専用にする。

**Tech Stack:** Next.js(App Router/TypeScript)+ MUI、Supabase(Postgres/RLS/PostgREST)、Node.js標準ライブラリのみの`analysis/helpers/*.mjs`、vitest(`src/**/*.test.ts`)、`node --test`(`analysis/test/*.test.mjs`)。

## Global Constraints

- **vaultが唯一の正本。** Supabaseの`vault_files`は一方向にコピーされた読み取り専用ミラーであり、書き込み経路を増やさない。
- **クラウド版Webは読み取り専用。** `/schedule`の完了チェックボックスは`STUDY_AI_VAULT_SOURCE=supabase`のとき出さない。`toggleScheduleEventDone`はローカル(`fs`)時のみ有効。
- **`service_role`キーはVercelに置かない。** Vercel側は`anon`キー(`NEXT_PUBLIC_SUPABASE_ANON_KEY`)+ RLS(select限定)のみ。`vault_files`への書き込みはMac上の同期スクリプトの`service_role`だけが行う。
- **Node側(`analysis/helpers/`)はNode標準ライブラリのみ。追加npmパッケージ禁止。**
- **TS側(`src/lib/vault/`)のfsアクセスはサーバ側のみ。**
- **パーサ(`parseFrontmatter`/`parseStudySessions`等)とページUIは変更しない。** 差し替えるのは「ファイルを取ってくる層」だけ。
- **`STUDY_AI_VAULT_SOURCE`未設定時は`fs`。** 既定値がfsなので、Phase 1・2の既存テストは無変更で通ること。
- **既存の関数名・型名は1文字も変えない。** `readVaultFile`は`{ frontmatter, body, raw }`を返す、`listReports(kind)`は`ReportMeta[]`を返す、`toggleScheduleEventDone`のシグネチャ等、実装前に必ずコードで確認済みのものをそのまま使う。
- **書き込みはアトミックに行う(既存の`writeVaultFileAtomic`をそのまま使う。本フェーズでは新規の書き込みロジックは追加しない)。**
- **同期スクリプトの失敗は夜間バッチ全体を落とさない。** 警告として記録し、次回実行で追いつかせる。
- **`supabase/schema.sql`は直接編集しない。** マイグレーションは`supabase/migrations/`に追加する。

---

## Task 1: Supabaseマイグレーション — `vault_files`テーブル(select限定RLS)

**Files:**
- 新規: `supabase/migrations/20260726000100_vault_files_mirror.sql`

**Interfaces:**
- Produces: テーブル`vault_files(path text primary key, content text not null, updated_at timestamptz not null default now())`
- Produces: ポリシー`authenticated_select_vault_files`(`for select to authenticated using (true)`。insert/update/delete用のポリシーは作らない)
- Produces: `authenticated`への`select`のみのgrant、`service_role`への`all privileges`のgrant

**判断根拠(既存コードで確認済み):**
- `supabase/migrations/20260715000000_baseline.sql`のRLS一括付与は、テーブル名を明示配列で列挙するdo blockであり(`'subjects', 'units', ... 'mock_exam_section_timings'`)、`vault_files`は含まれないため衝突しない。
- `supabase/migrations/20260719000300_api_grants.sql`は`alter default privileges in schema public grant select, insert, update, delete on tables to authenticated`を実行済み。これは**このマイグレーション実行以降に作成される全テーブルにも自動適用される**ため、`vault_files`作成時点で`authenticated`に暗黙のinsert/update/delete権限が付いてしまう。そのため本マイグレーションでは明示的に`revoke all`してから`select`のみを`grant`し直す。

このタスクはTDDが馴染まない(SQL・環境設定)。全文を掲載し、構造をgrepで検証する。

### ステップ

1. 【実コード】`supabase/migrations/20260726000100_vault_files_mirror.sql`を新規作成する:

```sql
-- Phase 3: read-only Supabase mirror of vault/*.md, synced by
-- analysis/helpers/sync-vault-to-supabase.mjs (service_role only).
-- Vercel's Web deployment reads this table via the anon/authenticated key;
-- it must only ever be able to `select`, never write.
create table if not exists vault_files (
  path text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);

alter table vault_files enable row level security;

drop policy if exists "authenticated_select_vault_files" on vault_files;
create policy "authenticated_select_vault_files" on vault_files
  for select
  to authenticated
  using (true);

-- supabase/migrations/20260719000300_api_grants.sql runs `alter default
-- privileges ... grant select, insert, update, delete on tables to
-- authenticated`, which fires automatically the moment this table is
-- created (it applies to future tables too, not just tables that existed
-- when it ran). Strip that write access back off explicitly so
-- `vault_files` stays select-only for `authenticated`, while
-- `service_role` (the sync script) keeps full access.
revoke all on vault_files from authenticated;
grant select on vault_files to authenticated;
grant all privileges on vault_files to service_role;
```

2. 検証コマンド:

```bash
grep -n "create table if not exists vault_files\|for select\|to authenticated\|revoke all on vault_files\|grant select on vault_files\|grant all privileges on vault_files to service_role" supabase/migrations/20260726000100_vault_files_mirror.sql
```

期待出力: 上記6パターンすべてが1回以上マッチする(ファイル内にinsert/update/delete用の`create policy`が存在しないことも目視確認する: `grep -c "create policy" supabase/migrations/20260726000100_vault_files_mirror.sql` が`1`であること)。

3. ローカルSupabaseが起動していれば、`supabase db reset --local`で実際に適用できることを追加確認してよい(本環境では必須としない)。

4. commit:

```bash
git add supabase/migrations/20260726000100_vault_files_mirror.sql
git commit -m "$(cat <<'EOF'
feat(supabase): add read-only vault_files mirror table with select-only RLS

Phase 3 のクラウド読み取りミラー用に vault_files を追加する。authenticated には
select のみを許可し、書き込みは同期スクリプトの service_role のみに限定する。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Supabase型定義(`src/lib/supabase/types.ts`)に`vault_files`を追加

**Files:**
- 変更: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: `Database["public"]["Tables"]["vault_files"]`(`Row`/`Insert`/`Update`/`Relationships`)

このタスクはTDDが馴染まない(生成物への追記)。全文(挿入ブロック)を掲載する。

### ステップ

1. `src/lib/supabase/types.ts`内、`units: { ... }`ブロックの直後・`weakness_scores: { ... }`ブロックの直前(アルファベット順の挿入位置。既存ファイルは`topic_tags` → `unit_state_snapshots` → `units` → `weakness_scores` → `weekly_plans`の順)に、以下を挿入する【実コード】:

```ts
      vault_files: {
        Row: {
          content: string
          path: string
          updated_at: string
        }
        Insert: {
          content: string
          path: string
          updated_at?: string
        }
        Update: {
          content?: string
          path?: string
          updated_at?: string
        }
        Relationships: []
      }
```

2. ローカルSupabaseが起動していれば、`npm run types:generate`を実行して自動生成し、本ステップの手書き分を上書きしてよい(生成結果が上と等価であることを`npm run types:check`で確認する)。本環境でローカルDBが無い場合は手書きのままでよい。
3. 検証コマンドと期待結果:

```bash
npx tsc --noEmit
```
期待結果: エラーなし(既存の`Database`型利用箇所に影響しないこと)。

4. commit:

```bash
git add src/lib/supabase/types.ts
git commit -m "$(cat <<'EOF'
chore(types): add vault_files table types

Task 1 で追加した vault_files テーブルの型を Database 型に反映する。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 同期スクリプト `analysis/helpers/sync-vault-to-supabase.mjs`(TDD)

**Files:**
- 新規: `analysis/test/sync-vault-to-supabase.test.mjs`
- 新規: `analysis/helpers/sync-vault-to-supabase.mjs`

**Interfaces:**
- Consumes: `analysis/helpers/lib.mjs`の`restClient`/`printJson`、`analysis/helpers/vault/root.mjs`の`vaultRoot()`
- Produces:
  - `export function planSync(localFiles: Map<string,string>, remoteFiles: Map<string,string>): { toAdd: {path,content}[], toUpdate: {path,content}[], toDelete: string[] }`
  - `export async function collectMarkdownFiles(root: string): Promise<{ path: string, content: string }[]>`(隠しファイル・隠しディレクトリ・`.md`以外を除外、pathはvaultルートからの`/`区切り相対パス、path昇順ソート)
  - `export function createVaultSyncClient(): { fetchAll(): Promise<{path,content}[]>, upsert(rows): Promise<unknown>, remove(path: string): Promise<unknown> }`
  - `export async function run(argv?: string[], opts?: { createClient?: () => ReturnType<typeof createVaultSyncClient>, root?: string }): Promise<{ dryRun: boolean, added: number, updated: number, deleted: number, addedPaths: string[], updatedPaths: string[], deletedPaths: string[] }>`

### 判断根拠(既存コードで確認済み)

- `analysis/helpers/lib.mjs`の`restClient().select(table, query)`は素のGETで`limit`/`offset`を自動付与しない(PostgREST既定上限で切られる)。削除検出のため全pathを取得する必要があるので、`createVaultSyncClient().fetchAll()`は`limit`/`offset`で明示的にページングする(`analysis/helpers/migrate-supabase-to-vault.mjs`の`fetchAllPages`と同じ形)。
- `analysis/helpers/migrate-supabase-to-vault.mjs`の`createSupabaseMigrationClient`と同じ「フェイククライアント注入」方式にする(`run(argv, { createClient })`)。
- ファイル走査の除外規則は`analysis/helpers/list-inbox-items.mjs`の「隠しファイル除外」と同じ考え方(本タスクでは`.md`以外・隠しファイル/ディレクトリを除外すれば`writeVaultFileAtomic`が作る`.foo.md.tmp-xxxx`も自動的に除外される。`.tmp`等の拡張子別除外は不要)。

### ステップ

1. 【実コード】失敗するテストを書く。`analysis/test/sync-vault-to-supabase.test.mjs`を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planSync, collectMarkdownFiles, run } from '../helpers/sync-vault-to-supabase.mjs';

test('planSync classifies added and deleted paths, skipping unchanged content', () => {
  const local = new Map([
    ['records/2026-07-25.md', 'new content'],
    ['records/2026-07-24.md', 'same content'],
  ]);
  const remote = new Map([
    ['records/2026-07-24.md', 'same content'],
    ['records/2026-07-20.md', 'stale content'],
  ]);
  const result = planSync(local, remote);
  assert.deepEqual(result.toAdd, [{ path: 'records/2026-07-25.md', content: 'new content' }]);
  assert.deepEqual(result.toUpdate, []);
  assert.deepEqual(result.toDelete, ['records/2026-07-20.md']);
});

test('planSync detects a content change as an update, not an add/delete', () => {
  const local = new Map([['schedule.md', 'v2']]);
  const remote = new Map([['schedule.md', 'v1']]);
  const result = planSync(local, remote);
  assert.deepEqual(result.toAdd, []);
  assert.deepEqual(result.toUpdate, [{ path: 'schedule.md', content: 'v2' }]);
  assert.deepEqual(result.toDelete, []);
});

test('collectMarkdownFiles walks subdirectories and skips hidden entries and non-markdown files', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'subjects', '英語R'), { recursive: true });
  await writeFile(path.join(dir, 'schedule.md'), 'schedule content', 'utf8');
  await writeFile(path.join(dir, 'subjects', '英語R', '弱点カルテ.md'), 'karte content', 'utf8');
  await writeFile(path.join(dir, '.hidden.md'), 'hidden', 'utf8');
  await writeFile(path.join(dir, 'notes.txt'), 'not markdown', 'utf8');

  const files = await collectMarkdownFiles(dir);

  assert.deepEqual(files, [
    { path: 'schedule.md', content: 'schedule content' },
    { path: 'subjects/英語R/弱点カルテ.md', content: 'karte content' },
  ]);
});

function makeFakeVaultFilesStore(initial = {}) {
  const store = new Map(Object.entries(initial));
  const calls = { upserts: [], removes: [] };
  return {
    store,
    calls,
    client: {
      fetchAll: async () => Array.from(store, ([p, content]) => ({ path: p, content })),
      upsert: async (rows) => {
        calls.upserts.push(rows);
        for (const row of rows) store.set(row.path, row.content);
      },
      remove: async (p) => {
        calls.removes.push(p);
        store.delete(p);
      },
    },
  };
}

test('run --dry-run reports counts and paths without writing', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'schedule.md'), 'v2', 'utf8');
  const fake = makeFakeVaultFilesStore({ 'schedule.md': 'v1', 'stale.md': 'x' });

  const result = await run(['--dry-run'], { createClient: () => fake.client, root: dir });

  assert.equal(result.dryRun, true);
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.deleted, 1);
  assert.deepEqual(result.updatedPaths, ['schedule.md']);
  assert.deepEqual(result.deletedPaths, ['stale.md']);
  assert.equal(fake.calls.upserts.length, 0);
  assert.equal(fake.calls.removes.length, 0);
});

test('run upserts changed files and deletes files missing locally, then is idempotent', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'schedule.md'), 'v2', 'utf8');
  const fake = makeFakeVaultFilesStore({ 'schedule.md': 'v1', 'stale.md': 'x' });

  const first = await run([], { createClient: () => fake.client, root: dir });
  assert.deepEqual(first, {
    dryRun: false, added: 0, updated: 1, deleted: 1,
    addedPaths: [], updatedPaths: ['schedule.md'], deletedPaths: ['stale.md'],
  });
  assert.equal(fake.store.get('schedule.md'), 'v2');
  assert.equal(fake.store.has('stale.md'), false);

  const second = await run([], { createClient: () => fake.client, root: dir });
  assert.deepEqual(second, {
    dryRun: false, added: 0, updated: 0, deleted: 0,
    addedPaths: [], updatedPaths: [], deletedPaths: [],
  });
});

test('run adds a brand-new file when the mirror is empty', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'study-ai-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'schedule.md'), 'fresh', 'utf8');
  const fake = makeFakeVaultFilesStore();

  const result = await run([], { createClient: () => fake.client, root: dir });

  assert.deepEqual(result.addedPaths, ['schedule.md']);
  assert.equal(fake.store.get('schedule.md'), 'fresh');
});
```

2. 失敗確認コマンドと期待出力:

```bash
node --test analysis/test/sync-vault-to-supabase.test.mjs
```
期待出力: `Cannot find module '.../analysis/helpers/sync-vault-to-supabase.mjs'`のようなモジュール解決エラーで全テストが失敗する。

3. 【実コード】最小実装。`analysis/helpers/sync-vault-to-supabase.mjs`を新規作成:

```js
#!/usr/bin/env node
// vault/ 配下の .md ファイルを Supabase の vault_files (読み取り専用ミラー) へ
// 一方向同期する。夜間バッチの最終ステップから呼ばれる(analysis/nightly.md 手順7参照)。
// 変更があったファイルだけ upsert し、vault から消えたファイルはミラーからも削除する。
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { printJson, restClient } from './lib.mjs';
import { vaultRoot } from './vault/root.mjs';

const PAGE_SIZE = 500;

export function planSync(localFiles, remoteFiles) {
  const toAdd = [];
  const toUpdate = [];
  const toDelete = [];
  for (const [filePath, content] of localFiles) {
    if (!remoteFiles.has(filePath)) toAdd.push({ path: filePath, content });
    else if (remoteFiles.get(filePath) !== content) toUpdate.push({ path: filePath, content });
  }
  for (const filePath of remoteFiles.keys()) {
    if (!localFiles.has(filePath)) toDelete.push(filePath);
  }
  return { toAdd, toUpdate, toDelete };
}

export async function collectMarkdownFiles(root) {
  const results = [];
  async function walk(dirFull, dirRel) {
    const entries = await readdir(dirFull, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      const full = path.join(dirFull, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = await readFile(full, 'utf8');
        results.push({ path: rel, content });
      }
    }
  }
  await walk(root, '');
  results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return results;
}

async function fetchAllVaultFileRows(client) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await client.select('vault_files', `select=path,content&order=path.asc&limit=${PAGE_SIZE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function createVaultSyncClient() {
  const client = restClient();
  return {
    fetchAll: () => fetchAllVaultFileRows(client),
    upsert: (rows) => client.upsert('vault_files', rows, 'path'),
    remove: (filePath) => client.remove('vault_files', `path=eq.${encodeURIComponent(filePath)}`),
  };
}

function parseArgv(argv) {
  const options = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
  }
  return options;
}

export async function run(argv = [], { createClient = createVaultSyncClient, root } = {}) {
  const options = parseArgv(argv);
  const vaultDir = root ?? vaultRoot();
  const client = createClient();

  const localEntries = await collectMarkdownFiles(vaultDir);
  const localFiles = new Map(localEntries.map((entry) => [entry.path, entry.content]));
  const remoteRows = await client.fetchAll();
  const remoteFiles = new Map(remoteRows.map((row) => [row.path, row.content]));

  const { toAdd, toUpdate, toDelete } = planSync(localFiles, remoteFiles);
  const summary = {
    dryRun: options.dryRun,
    added: toAdd.length,
    updated: toUpdate.length,
    deleted: toDelete.length,
    addedPaths: toAdd.map((entry) => entry.path),
    updatedPaths: toUpdate.map((entry) => entry.path),
    deletedPaths: toDelete,
  };
  if (options.dryRun) return summary;

  const toUpsert = [...toAdd, ...toUpdate];
  if (toUpsert.length) {
    const now = new Date().toISOString();
    await client.upsert(toUpsert.map(({ path: p, content }) => ({ path: p, content, updated_at: now })));
  }
  await Promise.all(toDelete.map((p) => client.remove(p)));
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await run(process.argv.slice(2));
  printJson(result);
}
```

4. 成功確認コマンドと期待結果:

```bash
node --test analysis/test/sync-vault-to-supabase.test.mjs
```
期待結果: 全テストがpassする。

5. commit:

```bash
git add analysis/helpers/sync-vault-to-supabase.mjs analysis/test/sync-vault-to-supabase.test.mjs
git commit -m "$(cat <<'EOF'
feat(analysis): add vault-to-supabase mirror sync script

vault/ 配下の .md のみを Supabase の vault_files テーブルへ一方向同期する
スクリプトを追加する。追加/更新/削除の判定ロジックはフェイククライアント注入で
node --test によりユニットテストする。--dry-run と冪等性を備える。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `src/lib/vault/source.ts` — 読み込み元の切り替えフラグ(TDD)

**Files:**
- 新規: `src/lib/vault/source.test.ts`
- 新規: `src/lib/vault/source.ts`

**Interfaces:**
- Produces: `export type VaultSource = "fs" | "supabase";`
- Produces: `export function getVaultSource(): VaultSource;`(環境変数`STUDY_AI_VAULT_SOURCE`。`"supabase"`のときのみ`"supabase"`、それ以外(未設定・不明な値)は`"fs"`)

### ステップ

1. 【実コード】失敗するテストを書く。`src/lib/vault/source.test.ts`を新規作成:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getVaultSource } from "./source";

describe("getVaultSource", () => {
  const originalEnv = process.env.STUDY_AI_VAULT_SOURCE;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_SOURCE;
    else process.env.STUDY_AI_VAULT_SOURCE = originalEnv;
  });

  it("defaults to fs when unset", () => {
    delete process.env.STUDY_AI_VAULT_SOURCE;
    expect(getVaultSource()).toBe("fs");
  });

  it("defaults to fs for an unrecognized value", () => {
    process.env.STUDY_AI_VAULT_SOURCE = "something-else";
    expect(getVaultSource()).toBe("fs");
  });

  it("returns supabase when explicitly set", () => {
    process.env.STUDY_AI_VAULT_SOURCE = "supabase";
    expect(getVaultSource()).toBe("supabase");
  });
});
```

2. 失敗確認コマンドと期待出力:

```bash
npx vitest run src/lib/vault/source.test.ts
```
期待出力: `Cannot find module './source'`(またはimport解決エラー)で全テスト失敗。

3. 【実コード】最小実装。`src/lib/vault/source.ts`を新規作成:

```ts
export type VaultSource = "fs" | "supabase";

export function getVaultSource(): VaultSource {
  return process.env.STUDY_AI_VAULT_SOURCE === "supabase" ? "supabase" : "fs";
}
```

4. 成功確認コマンドと期待結果:

```bash
npx vitest run src/lib/vault/source.test.ts
```
期待結果: 3件すべてpass。

5. commit:

```bash
git add src/lib/vault/source.ts src/lib/vault/source.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add STUDY_AI_VAULT_SOURCE fs/supabase switch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `src/lib/vault/supabase-client.ts` — Supabase版ファイル取得クライアント

**Files:**
- 新規: `src/lib/vault/supabase-client.ts`

**Interfaces:**
- Consumes: `createClient`(`src/lib/supabase/server.ts`、`async function createClient(): Promise<SupabaseClient<Database>>`)
- Produces: `export type VaultFileRow = { path: string; content: string };`
- Produces: `export type VaultFilesClient = { selectByPath(path: string): Promise<VaultFileRow | null>; selectByPrefix(prefix: string): Promise<VaultFileRow[]> };`
- Produces: `export async function getVaultFilesClient(): Promise<VaultFilesClient>;`

このタスクはTDDが馴染まない。`getVaultFilesClient()`は`next/headers`の`cookies()`を経由するため実リクエスト文脈の外(vitest)では呼べず、直接テストしない(Task 6以降で`VaultFilesClient`型のフェイクを注入してテストする)。型チェックのみで検証する。

### ステップ

1. 【実コード】`src/lib/vault/supabase-client.ts`を新規作成:

```ts
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
```

2. 検証コマンドと期待結果:

```bash
npx tsc --noEmit
```
期待結果: エラーなし(Task 2で追加した`Database["public"]["Tables"]["vault_files"]`と整合すること)。

3. commit:

```bash
git add src/lib/vault/supabase-client.ts
git commit -m "$(cat <<'EOF'
feat(vault): add Supabase-backed VaultFilesClient

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `readVaultFile`のSupabase分岐(TDD)

**Files:**
- 変更: `src/lib/vault/read.ts`
- 変更: `src/lib/vault/read.test.ts`

**Interfaces:**
- Consumes: `getVaultSource`(Task 4)、`VaultFilesClient`/`getVaultFilesClient`(Task 5)
- Produces: `export function parseVaultFileContent(relPath: string, content: string): { frontmatter: Record<string, unknown>; body: string; raw: string };`
- Produces: `export async function readVaultFileFromSupabase(relPath: string, client: VaultFilesClient): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }>;`
- 変更なし(シグネチャ据え置き): `export async function readVaultFile(relPath: string): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }>;`

既存の`readVaultFile`のfs実装(`relPath`のvaultルート脱出チェック含む)はそのまま残し、冒頭に`getVaultSource() === "supabase"`のときの分岐を追加するだけにする。

### ステップ

1. 【実コード】失敗するテストを追記する。`src/lib/vault/read.test.ts`のimport行を書き換え、末尾に新しい`describe`を追加する:

```ts
import { readVaultFile, readVaultFileFromSupabase } from "./read";
```
(既存の`import { readVaultFile } from "./read";`をこの行に置き換える)

ファイル末尾に追記:

```ts
describe("readVaultFileFromSupabase", () => {
  function fakeClient(rows: Record<string, string>) {
    return {
      selectByPath: async (p: string) => (p in rows ? { path: p, content: rows[p] } : null),
      selectByPrefix: async () => [],
    };
  }

  it("parses row content the same way readVaultFile parses a local file", async () => {
    const raw = ["---", "type: schedule", "schema_version: 1", "---", "", "## 予定"].join("\n");
    const result = await readVaultFileFromSupabase("schedule.md", fakeClient({ "schedule.md": raw }));
    expect(result.frontmatter.type).toBe("schedule");
    expect(result.body).toBe("## 予定");
    expect(result.raw).toBe(raw);
  });

  it("throws an ENOENT error when the path is not in the mirror", async () => {
    await expect(readVaultFileFromSupabase("missing.md", fakeClient({}))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
```

2. 失敗確認コマンドと期待出力:

```bash
npx vitest run src/lib/vault/read.test.ts
```
期待出力: `readVaultFileFromSupabase`が`./read`からexportされていないためimportエラーで失敗。

3. 【実コード】最小実装。`src/lib/vault/read.ts`を以下に置き換える:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { getVaultRoot } from "./root";
import { getVaultSource } from "./source";
import { getVaultFilesClient, type VaultFilesClient } from "./supabase-client";

export function parseVaultFileContent(
  relPath: string,
  content: string
): { frontmatter: Record<string, unknown>; body: string; raw: string } {
  const { frontmatter, body } = parseFrontmatter(content);
  const schemaVersion = frontmatter.schema_version;
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    console.warn(
      `Unknown vault schema_version ${String(schemaVersion)} in ${relPath}; attempting a best-effort read`
    );
  }
  return { frontmatter, body, raw: content };
}

export async function readVaultFileFromSupabase(
  relPath: string,
  client: VaultFilesClient
): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }> {
  const row = await client.selectByPath(relPath);
  if (!row) {
    const error = new Error(`vault file not found in Supabase mirror: ${relPath}`) as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
  return parseVaultFileContent(relPath, row.content);
}

export async function readVaultFile(
  relPath: string
): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }> {
  if (getVaultSource() === "supabase") {
    return readVaultFileFromSupabase(relPath, await getVaultFilesClient());
  }
  const root = getVaultRoot();
  const full = path.resolve(root, relPath);
  if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) {
    throw new Error("relPath escapes vault root: " + relPath);
  }
  const raw = await readFile(full, "utf8");
  return parseVaultFileContent(relPath, raw);
}
```

4. 成功確認コマンドと期待結果:

```bash
npx vitest run src/lib/vault/read.test.ts
```
期待結果: 既存3件+新規2件、計5件すべてpass(既存の「fs読み込み」「vaultルート脱出」「未知schema_version警告」テストは無変更で通ること)。

5. commit:

```bash
git add src/lib/vault/read.ts src/lib/vault/read.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add Supabase-mirror branch to readVaultFile

readVaultFile のシグネチャ・fs実装は変更せず、STUDY_AI_VAULT_SOURCE=supabase の
ときだけ vault_files テーブルから読む分岐を追加する。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `listStudyRecordDates`のSupabase分岐(TDD)

**Files:**
- 変更: `src/lib/vault/study-sessions.ts`
- 変更: `src/lib/vault/study-sessions.test.ts`

**Interfaces:**
- Consumes: `getVaultSource`(Task 4)、`VaultFilesClient`/`getVaultFilesClient`(Task 5)
- Produces: `export async function listStudyRecordDatesFromSupabase(client: VaultFilesClient): Promise<string[]>;`(`records/`前方一致、`records/YYYY-MM-DD.md`のみ、日付降順)
- 変更なし(シグネチャ据え置き): `export async function listStudyRecordDates(): Promise<string[]>;`

### ステップ

1. 【実コード】失敗するテストを追記する。`src/lib/vault/study-sessions.test.ts`のimport行に`listStudyRecordDatesFromSupabase`を追加し、末尾に追記する:

```ts
import { listStudyRecordDates, listStudyRecordDatesFromSupabase, parseStudySessions, formatStudySessionLine, readStudyRecord, type StudySession } from "./study-sessions";
```

追記するテスト:

```ts
describe("listStudyRecordDatesFromSupabase", () => {
  it("filters to records/YYYY-MM-DD.md and sorts dates descending", async () => {
    const client = {
      selectByPath: async () => null,
      selectByPrefix: async (prefix: string) => {
        expect(prefix).toBe("records/");
        return [
          { path: "records/2026-07-20.md", content: "" },
          { path: "records/2026-07-25.md", content: "" },
          { path: "records/not-a-date.md", content: "" },
        ];
      },
    };
    expect(await listStudyRecordDatesFromSupabase(client)).toEqual(["2026-07-25", "2026-07-20"]);
  });
});
```

2. 失敗確認コマンドと期待出力:

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```
期待出力: `listStudyRecordDatesFromSupabase`未export importエラーで失敗。

3. 【実コード】`src/lib/vault/study-sessions.ts`の先頭importに以下を追加する:

```ts
import { getVaultSource } from "./source";
import { getVaultFilesClient, type VaultFilesClient } from "./supabase-client";
```

`listStudyRecordDates`関数を以下に置き換える(既存fs実装本体は変更せず、新規関数を追加してから分岐を差し込む):

```ts
export async function listStudyRecordDatesFromSupabase(client: VaultFilesClient): Promise<string[]> {
  const rows = await client.selectByPrefix("records/");
  return rows
    .map((row) => row.path.slice("records/".length))
    .filter((name) => RECORD_FILENAME_RE.test(name))
    .map((name) => name.slice(0, -3))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export async function listStudyRecordDates(): Promise<string[]> {
  if (getVaultSource() === "supabase") {
    return listStudyRecordDatesFromSupabase(await getVaultFilesClient());
  }
  const dir = path.join(getVaultRoot(), "records");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries.filter((name) => RECORD_FILENAME_RE.test(name)).map((name) => name.slice(0, -3)).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}
```

4. 成功確認コマンドと期待結果:

```bash
npx vitest run src/lib/vault/study-sessions.test.ts
```
期待結果: 既存テスト+新規1件すべてpass。

5. commit:

```bash
git add src/lib/vault/study-sessions.ts src/lib/vault/study-sessions.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add Supabase-mirror branch to listStudyRecordDates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `listReports`のSupabase分岐(TDD)

**Files:**
- 変更: `src/lib/vault/reports.ts`
- 変更: `src/lib/vault/reports.test.ts`

**Interfaces:**
- Consumes: `getVaultSource`(Task 4)、`VaultFilesClient`/`getVaultFilesClient`(Task 5)、`parseVaultFileContent`(Task 6)
- Produces: `export async function listReportsFromSupabase(kind: "daily" | "weekly", client: VaultFilesClient): Promise<ReportMeta[]>;`(`reports/<kind>/`前方一致)
- 変更なし(シグネチャ据え置き): `export async function listReports(kind: "daily" | "weekly"): Promise<ReportMeta[]>;`

### ステップ

1. 【実コード】失敗するテストを追記する。`src/lib/vault/reports.test.ts`のimport行に`listReportsFromSupabase`を追加し、末尾に追記する:

```ts
import { listReports, listReportsFromSupabase } from "./reports";
```

追記するテスト:

```ts
describe("listReportsFromSupabase", () => {
  it("filters by reports/<kind>/ prefix and sorts by date descending", async () => {
    const client = {
      selectByPath: async () => null,
      selectByPrefix: async (prefix: string) => {
        expect(prefix).toBe("reports/daily/");
        return [
          { path: "reports/daily/2026-07-22.md", content: dailyRaw("2026-07-22", 0) },
          { path: "reports/daily/2026-07-24.md", content: dailyRaw("2026-07-24", 2) },
        ];
      },
    };
    const reports = await listReportsFromSupabase("daily", client);
    expect(reports.map((r) => r.path)).toEqual([
      "reports/daily/2026-07-24.md",
      "reports/daily/2026-07-22.md",
    ]);
    expect(reports[0].date).toBe("2026-07-24");
    expect(reports[0].frontmatter.confirm_todos).toBe(2);
  });
});
```

(既存ファイルの`dailyRaw`ヘルパー関数をそのまま再利用する。)

2. 失敗確認コマンドと期待出力:

```bash
npx vitest run src/lib/vault/reports.test.ts
```
期待出力: `listReportsFromSupabase`未export importエラーで失敗。

3. 【実コード】`src/lib/vault/reports.ts`を以下に置き換える:

```ts
import { readdir } from "node:fs/promises";
import path from "node:path";
import { parseVaultFileContent, readVaultFile } from "./read";
import { getVaultRoot } from "./root";
import { getVaultSource } from "./source";
import { getVaultFilesClient, type VaultFilesClient } from "./supabase-client";

export type ReportMeta = { path: string; date: string; frontmatter: Record<string, unknown> };

export async function listReportsFromSupabase(
  kind: "daily" | "weekly",
  client: VaultFilesClient
): Promise<ReportMeta[]> {
  const dirRelPath = path.posix.join("reports", kind);
  const rows = await client.selectByPrefix(`${dirRelPath}/`);
  const dateKey = kind === "daily" ? "date" : "week";
  const reports: ReportMeta[] = rows
    .filter((row) => row.path.endsWith(".md"))
    .map((row) => {
      const { frontmatter } = parseVaultFileContent(row.path, row.content);
      return { path: row.path, date: String(frontmatter[dateKey]), frontmatter };
    });
  reports.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return reports;
}

export async function listReports(kind: "daily" | "weekly"): Promise<ReportMeta[]> {
  if (getVaultSource() === "supabase") {
    return listReportsFromSupabase(kind, await getVaultFilesClient());
  }
  const dirRelPath = path.posix.join("reports", kind);
  const dirFullPath = path.join(getVaultRoot(), "reports", kind);
  let entries: string[];
  try {
    entries = await readdir(dirFullPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const dateKey = kind === "daily" ? "date" : "week";
  const reports: ReportMeta[] = [];
  for (const fileName of entries) {
    if (!fileName.endsWith(".md")) continue;
    const relPath = path.posix.join(dirRelPath, fileName);
    const { frontmatter } = await readVaultFile(relPath);
    reports.push({ path: relPath, date: String(frontmatter[dateKey]), frontmatter });
  }
  reports.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return reports;
}
```

4. 成功確認コマンドと期待結果:

```bash
npx vitest run src/lib/vault/reports.test.ts
```
期待結果: 既存2件+新規1件すべてpass。

5. commit:

```bash
git add src/lib/vault/reports.ts src/lib/vault/reports.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): add Supabase-mirror branch to listReports

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `listKarteSubjects`のSupabase分岐(TDD)

**Files:**
- 変更: `src/app/karte/_lib/list-subjects.ts`
- 変更: `src/app/karte/_lib/list-subjects.test.ts`

**Interfaces:**
- Consumes: `getVaultSource`、`VaultFilesClient`/`getVaultFilesClient`(`@/lib/vault`バレル経由、Task 10で追加)
- Produces: `export async function listKarteSubjectsFromSupabase(client: VaultFilesClient): Promise<string[]>;`(`subjects/`前方一致から2階層目のディレクトリ名を抽出、重複排除・昇順)
- 変更なし(シグネチャ据え置き): `export async function listKarteSubjects(): Promise<string[]>;`

**注意:** このタスクはTask 10(バレル更新)より前に着手するが、`@/lib/vault`から`getVaultSource`/`getVaultFilesClient`/`VaultFilesClient`をimportするため、実装コード自体はTask 10のバレル更新が終わるまで型エラーになる。Task 9とTask 10はこの順で連続して実施し、Task 10完了後にまとめて型チェックする。

### ステップ

1. 【実コード】失敗するテストを追記する。`src/app/karte/_lib/list-subjects.test.ts`のimport行に`listKarteSubjectsFromSupabase`を追加し、末尾に追記する:

```ts
import { listKarteSubjects, listKarteSubjectsFromSupabase } from "./list-subjects";
```

追記するテスト:

```ts
describe("listKarteSubjectsFromSupabase", () => {
  it("extracts unique subject directory names from subjects/ prefixed paths", async () => {
    const client = {
      selectByPath: async () => null,
      selectByPrefix: async (prefix: string) => {
        expect(prefix).toBe("subjects/");
        return [
          { path: "subjects/日本史/弱点カルテ.md", content: "" },
          { path: "subjects/日本史/誤答ログ.md", content: "" },
          { path: "subjects/世界史/弱点カルテ.md", content: "" },
          { path: "subjects/not-a-subject.md", content: "" },
        ];
      },
    };
    expect(await listKarteSubjectsFromSupabase(client)).toEqual(["世界史", "日本史"]);
  });
});
```

2. 失敗確認コマンドと期待出力:

```bash
npx vitest run src/app/karte/_lib/list-subjects.test.ts
```
期待出力: `listKarteSubjectsFromSupabase`未export importエラーで失敗。

3. 【実コード】`src/app/karte/_lib/list-subjects.ts`を以下に置き換える:

```ts
import { readdir } from "node:fs/promises";
import path from "node:path";
import { getVaultFilesClient, getVaultRoot, getVaultSource, type VaultFilesClient } from "@/lib/vault";

export async function listKarteSubjectsFromSupabase(client: VaultFilesClient): Promise<string[]> {
  const rows = await client.selectByPrefix("subjects/");
  const names = new Set<string>();
  for (const row of rows) {
    const rest = row.path.slice("subjects/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) continue;
    names.add(rest.slice(0, slash));
  }
  return Array.from(names).sort();
}

export async function listKarteSubjects(): Promise<string[]> {
  if (getVaultSource() === "supabase") {
    return listKarteSubjectsFromSupabase(await getVaultFilesClient());
  }
  const subjectsDir = path.join(getVaultRoot(), "subjects");
  let entries;
  try {
    entries = await readdir(subjectsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
```

4. これはTask 10のバレル更新後でないと型チェックが通らない。ここでは変更のみ行い、成功確認はTask 10完了後にまとめて行う。

---

## Task 10: `src/lib/vault/index.ts`バレル更新

**Files:**
- 変更: `src/lib/vault/index.ts`

**Interfaces:**
- Produces(再エクスポート): `VaultSource`, `getVaultSource`, `VaultFileRow`, `VaultFilesClient`, `getVaultFilesClient`, `parseVaultFileContent`, `readVaultFileFromSupabase`, `listStudyRecordDatesFromSupabase`, `listReportsFromSupabase`

このタスクはTDDが馴染まない(再エクスポートのみ)。型チェックで検証する。

### ステップ

1. `src/lib/vault/index.ts`を以下に置き換える:

```ts
export { getVaultRoot } from "./root";
export { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";
export type { VaultSource } from "./source";
export { getVaultSource } from "./source";
export type { VaultFileRow, VaultFilesClient } from "./supabase-client";
export { getVaultFilesClient } from "./supabase-client";
export { readVaultFile, readVaultFileFromSupabase, parseVaultFileContent } from "./read";
export type { ConfirmTodo } from "./confirm-todos";
export { parseConfirmTodos } from "./confirm-todos";
export type { ReportMeta } from "./reports";
export { listReports, listReportsFromSupabase } from "./reports";
export type { CorrectionEntry } from "./corrections";
export { appendCorrection } from "./corrections";
export type { StudyKind, Understanding, StudySession, StudyRecordDay } from "./study-sessions";
export {
  parseStudySessions,
  formatStudySessionLine,
  readStudyRecord,
  listStudyRecordDates,
  listStudyRecordDatesFromSupabase,
} from "./study-sessions";
export type { ScheduleKind, ScheduleEvent } from "./schedule";
export { parseScheduleEvents, formatScheduleEventLine, readSchedule, setScheduleEventDone } from "./schedule";
export type { PlanStatus, PlanBlock } from "./plan";
export { parsePlanBlocks, formatPlanBlockLine, readPlan } from "./plan";
```

2. 検証コマンドと期待結果(Task 9のlist-subjects.ts変更も含めてまとめて検証する):

```bash
npx tsc --noEmit
npx vitest run
```
期待結果: 両方ともエラーなし。`npx vitest run`は既存テスト+Task 4〜9で追加したテストがすべてpassする。

3. commit:

```bash
git add src/lib/vault/index.ts src/app/karte/_lib/list-subjects.ts src/app/karte/_lib/list-subjects.test.ts
git commit -m "$(cat <<'EOF'
feat(vault): re-export Supabase-mirror helpers and wire listKarteSubjects

STUDY_AI_VAULT_SOURCE=supabase のときの listKarteSubjects の分岐を追加し、
vault バレルに Supabase 版ヘルパー一式を再エクスポートする。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: fs版/Supabase版のparityテスト(TDD)

**Files:**
- 新規: `src/lib/vault/vault-source-parity.test.ts`

**Interfaces:**
- Consumes: `readVaultFile`/`readVaultFileFromSupabase`(Task 6)、`listStudyRecordDates`/`listStudyRecordDatesFromSupabase`(Task 7)、`listReports`/`listReportsFromSupabase`(Task 8)、`VaultFilesClient`(Task 5)

「同じ入力に対しfs版とSupabase版が同じ結果を返す」ことを検証する、設計仕様書の要求するテスト。

### ステップ

1. 【実コード】`src/lib/vault/vault-source-parity.test.ts`を新規作成:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readVaultFile, readVaultFileFromSupabase } from "./read";
import { listStudyRecordDates, listStudyRecordDatesFromSupabase } from "./study-sessions";
import { listReports, listReportsFromSupabase } from "./reports";
import type { VaultFilesClient } from "./supabase-client";

const RECORD_RAW = [
  "---",
  "type: study-record",
  "date: 2026-07-25",
  "schema_version: 1",
  "---",
  "",
  "## セッション",
  "- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題",
].join("\n");

function fakeClient(rows: Record<string, string>): VaultFilesClient {
  return {
    selectByPath: async (p) => (p in rows ? { path: p, content: rows[p] } : null),
    selectByPrefix: async (prefix) =>
      Object.entries(rows)
        .filter(([p]) => p.startsWith(prefix))
        .map(([p, content]) => ({ path: p, content })),
  };
}

describe("fs/supabase parity", () => {
  let vaultDir: string;
  const originalEnv = process.env.STUDY_AI_VAULT_DIR;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-parity-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalEnv;
  });

  it("readVaultFile: fs and Supabase return the same structure for the same content", async () => {
    await mkdir(path.join(vaultDir, "records"), { recursive: true });
    await writeFile(path.join(vaultDir, "records", "2026-07-25.md"), RECORD_RAW, "utf8");

    const fsResult = await readVaultFile("records/2026-07-25.md");
    const supabaseResult = await readVaultFileFromSupabase(
      "records/2026-07-25.md",
      fakeClient({ "records/2026-07-25.md": RECORD_RAW })
    );
    expect(supabaseResult).toEqual(fsResult);
  });

  it("listStudyRecordDates: fs and Supabase agree on the sorted date list", async () => {
    await mkdir(path.join(vaultDir, "records"), { recursive: true });
    await writeFile(path.join(vaultDir, "records", "2026-07-25.md"), RECORD_RAW, "utf8");
    await writeFile(path.join(vaultDir, "records", "2026-07-20.md"), RECORD_RAW, "utf8");

    const fsResult = await listStudyRecordDates();
    const supabaseResult = await listStudyRecordDatesFromSupabase(
      fakeClient({ "records/2026-07-25.md": RECORD_RAW, "records/2026-07-20.md": RECORD_RAW })
    );
    expect(supabaseResult).toEqual(fsResult);
  });

  it("listReports: fs and Supabase agree on daily report metadata", async () => {
    const dailyRaw = ["---", "type: daily-report", "date: 2026-07-24", "schema_version: 1", "---", "", "本文"].join(
      "\n"
    );
    await mkdir(path.join(vaultDir, "reports", "daily"), { recursive: true });
    await writeFile(path.join(vaultDir, "reports", "daily", "2026-07-24.md"), dailyRaw, "utf8");

    const fsResult = await listReports("daily");
    const supabaseResult = await listReportsFromSupabase(
      "daily",
      fakeClient({ "reports/daily/2026-07-24.md": dailyRaw })
    );
    expect(supabaseResult).toEqual(fsResult);
  });
});
```

2. 検証コマンドと期待結果:

```bash
npx vitest run src/lib/vault/vault-source-parity.test.ts
```
期待結果: 3件すべてpass(Task 6・7・8が正しく実装されていれば初回から成功するはずだが、位置付けとしては「fs版とSupabase版の乖離を継続的に検出する回帰テスト」であるため独立タスクとして残す)。

3. commit:

```bash
git add src/lib/vault/vault-source-parity.test.ts
git commit -m "$(cat <<'EOF'
test(vault): add fs/Supabase parity coverage for read/list helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `/schedule`の読み取り専用モード(TDD + UI)

**Files:**
- 変更: `src/app/schedule/_lib/actions.ts`
- 新規: `src/app/schedule/_lib/actions.test.ts`
- 変更: `src/app/schedule/schedule-event-toggle.tsx`
- 変更: `src/app/schedule/page.tsx`

**Interfaces:**
- Consumes: `getVaultSource`, `setScheduleEventDone`, `readSchedule`(`@/lib/vault`)
- 変更なし(シグネチャ据え置き): `export async function toggleScheduleEventDone(input: { id: string; done: boolean }): Promise<void>;`
- 変更: `ScheduleEventToggle`のprops型に`readOnly?: boolean`(既定`false`)を追加する

### ステップ

1. 【実コード】失敗するテストを書く。`src/app/schedule/_lib/actions.test.ts`を新規作成:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSchedule } from "@/lib/vault";
import { toggleScheduleEventDone } from "./actions";

describe("toggleScheduleEventDone", () => {
  let vaultDir: string;
  const originalVaultDir = process.env.STUDY_AI_VAULT_DIR;
  const originalSource = process.env.STUDY_AI_VAULT_SOURCE;

  beforeEach(async () => {
    vaultDir = await mkdtemp(path.join(tmpdir(), "vault-schedule-actions-"));
    process.env.STUDY_AI_VAULT_DIR = vaultDir;
    delete process.env.STUDY_AI_VAULT_SOURCE;
    const raw = [
      "---",
      "type: schedule",
      "schema_version: 1",
      "---",
      "",
      "## 予定",
      "- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01",
    ].join("\n");
    await writeFile(path.join(vaultDir, "schedule.md"), raw, "utf8");
  });

  afterEach(async () => {
    if (originalVaultDir === undefined) delete process.env.STUDY_AI_VAULT_DIR;
    else process.env.STUDY_AI_VAULT_DIR = originalVaultDir;
    if (originalSource === undefined) delete process.env.STUDY_AI_VAULT_SOURCE;
    else process.env.STUDY_AI_VAULT_SOURCE = originalSource;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("toggles the event when the source is fs (local, default)", async () => {
    await toggleScheduleEventDone({ id: "ev-1", done: true });
    const events = await readSchedule();
    expect(events[0].done).toBe(true);
  });

  it("throws and leaves the file untouched when STUDY_AI_VAULT_SOURCE=supabase", async () => {
    process.env.STUDY_AI_VAULT_SOURCE = "supabase";
    await expect(toggleScheduleEventDone({ id: "ev-1", done: true })).rejects.toThrow(/read-only/);
    delete process.env.STUDY_AI_VAULT_SOURCE;
    const events = await readSchedule();
    expect(events[0].done).toBe(false);
  });
});
```

2. 失敗確認コマンドと期待出力:

```bash
npx vitest run src/app/schedule/_lib/actions.test.ts
```
期待出力: 1件目はpass(既存実装で通る)、2件目は現行実装が`STUDY_AI_VAULT_SOURCE`を見ないため`rejects.toThrow`の期待に反して例外を投げず失敗する。

3. 【実コード】`src/app/schedule/_lib/actions.ts`を以下に置き換える:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getVaultSource, setScheduleEventDone } from "@/lib/vault";

export async function toggleScheduleEventDone(input: { id: string; done: boolean }): Promise<void> {
  if (getVaultSource() === "supabase") {
    throw new Error(
      "toggleScheduleEventDone is disabled when STUDY_AI_VAULT_SOURCE=supabase: the cloud mirror is read-only"
    );
  }
  await setScheduleEventDone(input.id, input.done);
  revalidatePath("/schedule");
}
```

4. 成功確認コマンドと期待結果:

```bash
npx vitest run src/app/schedule/_lib/actions.test.ts
```
期待結果: 2件ともpass。

5. 【実コード】UIの読み取り専用表示。`src/app/schedule/schedule-event-toggle.tsx`を以下に置き換える(TDD対象外。vitestの`environment`は`node`でDOM描画テストの土台が無いため、レンダリングの正しさは目視/E2Eで確認する):

```tsx
"use client";
import { useState, useTransition } from "react";
import Checkbox from "@mui/material/Checkbox";
import { toggleScheduleEventDone } from "./_lib/actions";
export default function ScheduleEventToggle({ id, title, initialDone, readOnly = false }: { id: string; title: string; initialDone: boolean; readOnly?: boolean }) {
  const [done, setDone] = useState(initialDone); const [isPending, startTransition] = useTransition();
  if (readOnly) {
    return <Checkbox size="small" checked={done} disabled inputProps={{ "aria-label": `${title}は${done ? "完了" : "未完了"}(閲覧専用)` }} />;
  }
  return <Checkbox size="small" checked={done} disabled={isPending} inputProps={{ "aria-label": `${title}を完了にする` }} onChange={() => { const next = !done; setDone(next); startTransition(async () => { try { await toggleScheduleEventDone({ id, done: next }); } catch { setDone(!next); } }); }} />;
}
```

6. `src/app/schedule/page.tsx`を以下に置き換える(元の1行構成を保ったまま、`getVaultSource`のimport・`readOnly`変数・注記・propsの3か所だけ差し込む):

```tsx
import Box from "@mui/material/Box"; import Typography from "@mui/material/Typography"; import Paper from "@mui/material/Paper"; import Stack from "@mui/material/Stack"; import Chip from "@mui/material/Chip";
import { readSchedule, readPlan, getVaultSource, type PlanBlock } from "@/lib/vault"; import { addDays, formatLocalDate } from "@/lib/date"; import { EVENT_KIND_COLORS, EVENT_KIND_LABELS, daysUntil } from "@/lib/constants"; import ScheduleEventToggle from "./schedule-event-toggle";
export const dynamic = "force-dynamic"; const PLAN_WINDOW_DAYS = 7;
export default async function SchedulePage() { const today=formatLocalDate(new Date()); const dates=Array.from({length:PLAN_WINDOW_DAYS},(_,i)=>addDays(today,i)); const readOnly=getVaultSource()==="supabase"; const [events,lists]=await Promise.all([readSchedule(),Promise.all(dates.map(readPlan))]); const upcoming=events.filter(e=>!e.done).sort((a,b)=>a.due.localeCompare(b.due)); const completed=events.filter(e=>e.done).sort((a,b)=>b.due.localeCompare(a.due)); const plans:{date:string;blocks:PlanBlock[]}[]=dates.map((date,i)=>({date,blocks:lists[i]})); return <Box sx={{p:2,pb:10,maxWidth:560,mx:"auto"}}><Typography variant="h6" fontWeight={700} sx={{mb:2}}>予定</Typography>{readOnly&&<Typography variant="caption" color="text.secondary" sx={{display:"block",mt:-1.5,mb:2}}>閲覧専用(変更はMac側の対話から)</Typography>}<Paper variant="outlined" sx={{p:2,mb:2}}><Typography variant="subtitle2" color="text.secondary" sx={{mb:1.5}}>締切リスト</Typography>{upcoming.length===0?<Typography variant="body2">予定はありません</Typography>:<Stack spacing={1}>{upcoming.map(event=>{const d=daysUntil(event.due),urgent=d<=7;return <Stack key={event.id} direction="row" alignItems="center" spacing={1} sx={{p:1,borderRadius:1.5,backgroundColor:urgent?"#fdecea":"transparent"}}><ScheduleEventToggle id={event.id} title={event.title} initialDone={event.done} readOnly={readOnly}/><Chip size="small" label={EVENT_KIND_LABELS[event.kind]??event.kind} sx={{backgroundColor:EVENT_KIND_COLORS[event.kind]??"#999",color:"#fff"}}/><Box sx={{flex:1,minWidth:0}}><Typography variant="body2" noWrap>{event.title}</Typography><Typography variant="caption" color={urgent?"error.main":"text.secondary"}>{event.due} ({d>=0?`あと${d}日`:"期限超過"})</Typography></Box></Stack>})}</Stack>}</Paper>{completed.length>0&&<Paper variant="outlined" sx={{p:2,mb:2}}><Typography variant="subtitle2" color="text.secondary">完了済み（チェックを外すと復元）</Typography>{completed.map(event=><Stack key={event.id} direction="row" alignItems="center"><ScheduleEventToggle id={event.id} title={event.title} initialDone={event.done} readOnly={readOnly}/><Typography variant="body2" sx={{textDecoration:"line-through"}}>{event.title}</Typography></Stack>)}</Paper>}<Paper variant="outlined" sx={{p:2}}><Typography variant="subtitle2" color="text.secondary">学習計画（今日から{PLAN_WINDOW_DAYS}日間）</Typography>{plans.map(({date,blocks})=><Box key={date} sx={{mt:1}}><Typography variant="caption" color="text.secondary">{date}{date===today?"（今日）":""}</Typography>{blocks.length===0?<Typography variant="body2" color="text.secondary">計画はありません</Typography>:blocks.map(b=><Stack key={b.id} direction="row" spacing={1}><Chip size="small" label={`${b.start}-${b.end}`}/><Chip size="small" label={b.subject}/><Typography variant="body2">{b.status==="done"?"完了":b.status==="skipped"?"未実施":"予定"}{b.memo?`・${b.memo}`:""}</Typography></Stack>)}</Box>)}</Paper></Box>; }
```

7. 検証コマンドと期待結果:

```bash
npx tsc --noEmit
npx vitest run
npm run lint
```
期待結果: すべてエラーなし。

8. commit:

```bash
git add src/app/schedule/_lib/actions.ts src/app/schedule/_lib/actions.test.ts src/app/schedule/schedule-event-toggle.tsx src/app/schedule/page.tsx
git commit -m "$(cat <<'EOF'
feat(schedule): make /schedule read-only when STUDY_AI_VAULT_SOURCE=supabase

toggleScheduleEventDone はクラウドミラー時に throw して書き込みを拒否し、
完了チェックボックスは disabled 表示になる。閲覧専用である旨の注記を追加する。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `analysis/nightly.md`に同期ステップを追加

**Files:**
- 変更: `analysis/nightly.md`

**Interfaces:**
- Consumes: `analysis/helpers/sync-vault-to-supabase.mjs`(Task 3)の返り値`{ added, updated, deleted }`

このタスクはTDDが馴染まない(プロンプト文書)。全文(置き換え箇所)を掲載する。同期失敗が夜間バッチ全体を落とさないことを明記する。

### ステップ

1. `analysis/nightly.md`の`### 7. ラン完了`セクション(既存の手順1〜3)を、以下に置き換える:

```md
### 7. ラン完了

1. **Vaultミラー同期**: `node analysis/helpers/sync-vault-to-supabase.mjs` を実行し、`vault/`配下の
   `.md`ファイルをSupabaseの`vault_files`テーブル(読み取り専用ミラー、外出先からのWeb閲覧用)へ
   反映する。変更があったファイルだけ`upsert`し、`vault/`から消えたファイルはミラーからも削除する。
   **このコマンドが失敗しても後続の手順(手順2・3)を止めない。** 手順1〜6は既にvaultへの書き込みを
   完了しているため、同期の失敗はデータ損失にならない。失敗した場合はエラー内容を控えておき、
   手順2の`run-summary.json`の`lines`に`"Vaultミラー同期に失敗しました(次回再試行): <エラー内容>"`
   を追加する(バッチ全体の`status`は`ok`のまま。次回実行時に差分がまとめて同期される、冪等な
   スクリプトなので二重反映の心配はない)。成功した場合は`lines`に
   `"Vaultミラー同期: 追加{added}件/更新{updated}件/削除{deleted}件"`
   (`sync-vault-to-supabase.mjs`の標準出力JSONの`added`/`updated`/`deleted`)を追加する。
2. `analysis/tmp/run-summary.json`を作成する。形式:
   ```json
   {
     "processed": 5,
     "needsConfirmation": 1,
     "lines": [
       "Inbox 5件処理(仕分け4件 / 要確認TODO 1件)",
       "誤答ログ更新: 日本史(2件)、数学(1件)",
       "カルテ差分更新: 日本史、数学",
       "訂正反映: 2件(または: 訂正指示なし)",
       "保存したレポート: daily(daily+weeklyの場合はその旨)",
       "Vaultミラー同期: 追加2件/更新3件/削除0件(または: Vaultミラー同期に失敗しました(次回再試行): <エラー内容>)"
     ]
   }
   ```
   `processed`は手順3で仕分け(誤答ログ追記 or 正解のみでスキップ)した総エントリ数、
   `needsConfirmation`は要確認TODOの件数を入れる。
3. `node analysis/helpers/finish-run.mjs "$TODAY" ok analysis/tmp/run-summary.json`
   を実行し、`runs/$TODAY.md`に完了報告を追記する(途中で回復不能なエラーが起きた場合は
   `ok`の代わりに`error`を指定し、`lines`にエラー内容を含める。**Vaultミラー同期の失敗単独では
   `error`にしない**。手順1〜6のいずれかで回復不能なエラーが起きた場合のみ`error`にする)。
```

2. 検証コマンドと期待結果:

```bash
grep -n "sync-vault-to-supabase.mjs\|後続の手順.*止めない\|status.*ok.*のまま" analysis/nightly.md
```
期待結果: 3パターンとも1回以上マッチする(同期ステップの追加と、失敗時にバッチ全体を落とさない旨の記述が確認できる)。

3. commit:

```bash
git add analysis/nightly.md
git commit -m "$(cat <<'EOF'
docs(nightly): add vault-to-supabase mirror sync as the batch's final step

同期失敗は夜間バッチ全体を落とさず、警告として run-summary.json に残す
ことを明記する。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: デプロイ設定 — `vercel.json`・Vercel環境変数・README

**Files:**
- 確認のみ(変更なし): `vercel.json`
- 変更: `README.md`
- 変更: `.env.local.example`

**判断根拠(既存コードで確認済み):** `git log --follow -p -- vercel.json`で確認したところ、`vercel.json`は歴史上一度も`crons`以外の設定を持ったことがない。Phase 2で`crons`を削除済みの現状の`{}`は、Next.jsのデフォルト設定で**そのままデプロイ可能**であり、本タスクでは変更しない(crons追加もしない)。実質的なタスクは「Vercel環境変数の一覧を手順として明記する」こと。

このタスクはTDDが馴染まない(設定・ドキュメント)。全文を掲載する。

### ステップ

1. `vercel.json`は変更しない。以下のコマンドで現状が`{}`のみであることを確認する:

```bash
cat vercel.json
```
期待結果: `{}`のみ(改行のみの差異は許容)。

2. 【実コード】`README.md`の`## PWA / Web Push / Vercel Cron`セクション(ファイル末尾までの全体)を、以下に置き換える:

```md
## Vercelデプロイ(クラウド読み取りミラー)

vault(Googleドライブ同期フォルダ内の`vault/`)はMac上でのみ読み書きできるため、Vercel上のWebは
vaultを直接読まず、Supabaseの`vault_files`テーブル(夜間バッチが最後に同期する読み取り専用ミラー。
[design](./docs/superpowers/specs/2026-07-26-vault-cloud-mirror-design.md)参照)を読む。

### Vercel環境変数

1. GitHub等にリポジトリをpushし、Vercelでインポート
2. Vercelプロジェクトの Settings > Environment Variables に以下を設定する

   | 変数名 | 値 | 用途 |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabaseプロジェクトの URL | Supabase接続 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseプロジェクトの anon key | Supabase接続(クライアント/RLS越しの読み取り) |
   | `STUDY_AI_VAULT_SOURCE` | `supabase` | vaultの読み込み先をSupabaseミラーに切り替える(未設定/`fs`はローカル開発用) |

   **`SUPABASE_SERVICE_ROLE_KEY`はVercelに設定しない。** `vault_files`への書き込みは
   Mac上の夜間バッチ(`analysis/helpers/sync-vault-to-supabase.mjs`、`analysis/.env`の
   service roleキーのみ)が行い、Vercel側は`anon`キー + RLS(select限定)で読むだけにする。
3. `vercel.json`は`{}`のままでよい(cronは追加しない。追加のビルド設定は不要)。
4. デプロイ後、クラウド版の`/schedule`は閲覧専用になる(完了チェックボックスは表示されない)。
   予定・記録・カルテの変更はMac上の対話(`docs/study-dialogue.md`)から行う。

### iPhoneでの利用手順

1. Safariで本番URLを開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンからアプリを起動(standaloneモードになる)

## デプロイ前の残確認

- stagingのSupabaseとPreview環境で、[リリース手順](./docs/stability-rollout.md) に従って確認する
- `analysis/helpers/sync-vault-to-supabase.mjs`を一度実行し、Vercel上の`/records`・`/schedule`・
  `/karte`・`/reports`がvaultの内容と一致することを確認する
```

3. 【実コード】`.env.local.example`を以下に置き換える(Web Push/Cron関連の廃止済み変数を削除し、`STUDY_AI_VAULT_SOURCE`を追加する):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# vault(Googleドライブ同期フォルダ内のvault/)の絶対パス。/karte 画面が参照する。
# 未設定の場合、/karte はエラー表示になる。
STUDY_AI_VAULT_DIR=

# vaultの読み込み元。fs(既定・未設定と同じ) | supabase。
# ローカル開発では未設定のままにする(fsのまま)。Vercel本番のみ supabase を設定する。
STUDY_AI_VAULT_SOURCE=
```

4. 検証コマンドと期待結果:

```bash
grep -c "SUPABASE_SERVICE_ROLE_KEY\|VAPID\|CRON_SECRET" README.md .env.local.example
```
期待結果: 両ファイルとも`0`(廃止済みの記述が残っていないこと)。

```bash
grep -n "STUDY_AI_VAULT_SOURCE" README.md .env.local.example
```
期待結果: 両ファイルに1回以上出現する。

5. commit:

```bash
git add README.md .env.local.example
git commit -m "$(cat <<'EOF'
docs: document Vercel env vars for the Supabase vault mirror deploy

Web Push/Cron 由来の廃止済み手順・環境変数を削除し、
STUDY_AI_VAULT_SOURCE を含む現行のデプロイ手順に置き換える。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: 最終検証

**Files:** なし(検証のみ)

### ステップ

1. 以下をすべて実行し、すべて成功することを確認する:

```bash
npx vitest run
npm run test:analysis
npx tsc --noEmit
npm run lint
npm run build
```

2. 期待結果:
   - `npx vitest run`: 既存テスト+Task 4〜12で追加したテストがすべてpass。Phase 1・2のテストが1件も壊れていないこと(`STUDY_AI_VAULT_SOURCE`未設定時は既定`fs`のため無変更で通る)。
   - `npm run test:analysis`: Task 3で追加した`sync-vault-to-supabase.test.mjs`を含め全件pass。
   - `npx tsc --noEmit`: エラーなし。
   - `npm run lint`: エラーなし。
   - `npm run build`: 成功(`.env.local`未設定でもビルドが通る既存の前提を壊していないこと)。

3. ローカルSupabaseが起動できる環境であれば、追加で以下も実行して確認する(必須ではない):

```bash
npm run types:check
```

4. すべて成功したら、このタスクではcommitしない(親セッションがまとめてレビュー・マージする)。
