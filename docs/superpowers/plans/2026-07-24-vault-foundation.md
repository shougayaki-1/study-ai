# Vault Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-07-24-vault-conventions-contract.md` セクション4のヘルパ関数を、Web/TS側 (`src/lib/vault/`) とバッチ/Node側 (`analysis/helpers/vault/`) の両方に実装し、frontmatter・要確認TODO・correctionsのパース/生成結果が両実装で完全一致することを同一フィクスチャのテストで保証する。

**Architecture:** vault規約ライブラリは他コンポーネント（夜間バッチ、Web画面）から独立した純粋なファイルI/Oヘルパ層。TS側は Next.js サーバ側専用（`node:fs/promises`）、Node側は Node標準モジュールのみで完結する `.mjs`。両者は同じ frontmatter 書式・要確認TODO書式・corrections書式（契約セクション2/3）を扱うため、パースアルゴリズムをそれぞれの言語で独立実装しつつ、同一の文字列フィクスチャをテストに用いて挙動を突き合わせる。

**Tech Stack:** TypeScript (Next.js 15 / vitest 4, `node:fs/promises`), Node.js 24 標準モジュール (`node:fs/promises`, `node:path`, `node:test`, `node:assert/strict`)。追加npmパッケージなし。

## Global Constraints
- vaultルートは環境変数 `STUDY_AI_VAULT_DIR` から取得する。未設定なら各ヘルパ（`getVaultRoot`/`vaultRoot`）は即座に throw する（黙って別パスにフォールバックしない）。
- 相対パスはすべて vault ルート基準（例 `reports/daily/2026-07-24.md`）。
- `analysis/helpers/vault/` は Node標準機能のみで実装する。追加npmパッケージのインストールは禁止。
- frontmatter・要確認TODO（3a）・corrections（3b）のテキスト書式のパース結果は TS版と Node版で完全一致させる。両実装は同一の文字列フィクスチャでテストする。
- 契約書セクション4に無い関数名・型名は導入しない。関数名・型名（`getVaultRoot`/`vaultRoot`、`ConfirmTodo`、`CorrectionEntry`、`ReportMeta` 等）は契約書のまま1文字も変えない。
- ディレクトリ名（`_inbox` `_archive` `subjects` `materials` `essays` `reports/daily` `reports/weekly` `runs`）は変更しない。
- `vault/` の実データや `analysis/nightly.md`、Web画面には触れない（それぞれ計画2・計画3の担当）。
- 既存の検査コマンド `npm test`（vitest run、`src/**/*.test.ts` を対象）と `npm run test:analysis`（`node --test analysis/menubar-app/test/*.test.js analysis/test/*.test.mjs`）にそのまま乗るテストファイル配置にする。
- `npm install` や `npm run build` は実行しない。

---

## Task 1: TS — `getVaultRoot`

**Files:**
- Create: `src/lib/vault/root.ts`
- Test: `src/lib/vault/root.test.ts`

**Interfaces:**
- Consumes: なし（`process.env.STUDY_AI_VAULT_DIR` のみ）
- Produces: `export function getVaultRoot(): string;` — 未設定なら `Error("STUDY_AI_VAULT_DIR is not set")` を throw

### Steps

1. 失敗するテストを書く。
   ```ts
   // src/lib/vault/root.test.ts
   import { afterEach, describe, expect, it } from "vitest";
   import { getVaultRoot } from "./root";

   describe("getVaultRoot", () => {
     const original = process.env.STUDY_AI_VAULT_DIR;

     afterEach(() => {
       if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = original;
     });

     it("returns the configured vault root", () => {
       process.env.STUDY_AI_VAULT_DIR = "/tmp/vault";
       expect(getVaultRoot()).toBe("/tmp/vault");
     });

     it("throws when STUDY_AI_VAULT_DIR is not set", () => {
       delete process.env.STUDY_AI_VAULT_DIR;
       expect(() => getVaultRoot()).toThrow("STUDY_AI_VAULT_DIR is not set");
     });
   });
   ```

2. 失敗を確認する。
   ```bash
   npx vitest run src/lib/vault/root.test.ts
   ```
   期待出力: `Cannot find module './root'`（`src/lib/vault/root.ts` が存在しないため失敗）。

3. 最小実装。
   ```ts
   // src/lib/vault/root.ts
   export function getVaultRoot(): string {
     const value = process.env.STUDY_AI_VAULT_DIR;
     if (!value) {
       throw new Error("STUDY_AI_VAULT_DIR is not set");
     }
     return value;
   }
   ```

4. 成功確認。
   ```bash
   npx vitest run src/lib/vault/root.test.ts
   ```
   期待出力: `Test Files  1 passed (1)` / `Tests  2 passed (2)`。

5. commit。
   ```bash
   git add src/lib/vault/root.ts src/lib/vault/root.test.ts
   git commit -m "$(cat <<'EOF'
   feat(vault): add getVaultRoot for TS vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 2: TS — `parseFrontmatter` / `stringifyFrontmatter`

**Files:**
- Create: `src/lib/vault/frontmatter.ts`
- Test: `src/lib/vault/frontmatter.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `export function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string };`
  - `export function stringifyFrontmatter(frontmatter: Record<string, unknown>, body: string): string;`

### Steps

1. 失敗するテストを書く（このフィクスチャ文字列は Task 9 の Node版テストで一字一句同じものを使う。契約セクション2の `karte` frontmatter 例に準拠）。
   ```ts
   // src/lib/vault/frontmatter.test.ts
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
   ```

2. 失敗を確認する。
   ```bash
   npx vitest run src/lib/vault/frontmatter.test.ts
   ```
   期待出力: `Cannot find module './frontmatter'`。

3. 最小実装。
   ```ts
   // src/lib/vault/frontmatter.ts
   export function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
     const lines = raw.split("\n");
     if (lines[0] !== "---") {
       throw new Error("vault file is missing frontmatter opening delimiter (---)");
     }
     const closeIndex = lines.indexOf("---", 1);
     if (closeIndex === -1) {
       throw new Error("vault file is missing frontmatter closing delimiter (---)");
     }
     const frontmatter: Record<string, unknown> = {};
     for (const line of lines.slice(1, closeIndex)) {
       if (!line.trim()) continue;
       const sep = line.indexOf(": ");
       if (sep === -1) continue;
       const key = line.slice(0, sep);
       const rawValue = line.slice(sep + 2);
       frontmatter[key] = /^-?\d+$/.test(rawValue) ? Number(rawValue) : rawValue;
     }
     const bodyLines = lines.slice(closeIndex + 1);
     if (bodyLines[0] === "") bodyLines.shift();
     return { frontmatter, body: bodyLines.join("\n") };
   }

   export function stringifyFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
     const lines = ["---"];
     for (const [key, value] of Object.entries(frontmatter)) {
       lines.push(`${key}: ${String(value)}`);
     }
     lines.push("---", "", body);
     return lines.join("\n");
   }
   ```

4. 成功確認。
   ```bash
   npx vitest run src/lib/vault/frontmatter.test.ts
   ```
   期待出力: `Test Files  1 passed (1)` / `Tests  4 passed (4)`。

5. commit。
   ```bash
   git add src/lib/vault/frontmatter.ts src/lib/vault/frontmatter.test.ts
   git commit -m "$(cat <<'EOF'
   feat(vault): add parseFrontmatter/stringifyFrontmatter for TS vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3: TS — `parseConfirmTodos`

**Files:**
- Create: `src/lib/vault/confirm-todos.ts`
- Test: `src/lib/vault/confirm-todos.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `export type ConfirmTodo = { id: string; q: string; options: string[]; default: string; ref?: string };`
  - `export function parseConfirmTodos(body: string): ConfirmTodo[];`

### Steps

1. 失敗するテストを書く（契約3aの例文をそのまま使用）。
   ```ts
   // src/lib/vault/confirm-todos.test.ts
   import { describe, expect, it } from "vitest";
   import { parseConfirmTodos } from "./confirm-todos";

   const BODY = [
     "## 要確認TODO",
     "- [ ] id=todo-1 | q=この写真の科目は？ | options=日本史 / 世界史 / 不明 | default=日本史 | ref=_archive/2026/07/abc.jpg",
     "- [ ] id=todo-2 | q=単元は？ | options=中世 / 近世 | default=中世",
     "",
     "本文が続く...",
   ].join("\n");

   describe("parseConfirmTodos", () => {
     it("parses TODO lines including the optional ref field", () => {
       const todos = parseConfirmTodos(BODY);
       expect(todos).toEqual([
         {
           id: "todo-1",
           q: "この写真の科目は？",
           options: ["日本史", "世界史", "不明"],
           default: "日本史",
           ref: "_archive/2026/07/abc.jpg",
         },
         {
           id: "todo-2",
           q: "単元は？",
           options: ["中世", "近世"],
           default: "中世",
           ref: undefined,
         },
       ]);
     });

     it("returns an empty array when there are no TODO lines", () => {
       expect(parseConfirmTodos("本文だけ\n")).toEqual([]);
     });
   });
   ```

2. 失敗を確認する。
   ```bash
   npx vitest run src/lib/vault/confirm-todos.test.ts
   ```
   期待出力: `Cannot find module './confirm-todos'`。

3. 最小実装。
   ```ts
   // src/lib/vault/confirm-todos.ts
   export type ConfirmTodo = { id: string; q: string; options: string[]; default: string; ref?: string };

   const PREFIX = "- [ ] ";

   export function parseConfirmTodos(body: string): ConfirmTodo[] {
     const todos: ConfirmTodo[] = [];
     for (const line of body.split("\n")) {
       if (!line.startsWith(PREFIX)) continue;
       const fields: Record<string, string> = {};
       for (const part of line.slice(PREFIX.length).split(" | ")) {
         const eq = part.indexOf("=");
         if (eq === -1) continue;
         fields[part.slice(0, eq)] = part.slice(eq + 1);
       }
       if (!fields.id) continue;
       todos.push({
         id: fields.id,
         q: fields.q,
         options: fields.options ? fields.options.split(" / ") : [],
         default: fields.default,
         ref: fields.ref,
       });
     }
     return todos;
   }
   ```

4. 成功確認。
   ```bash
   npx vitest run src/lib/vault/confirm-todos.test.ts
   ```
   期待出力: `Test Files  1 passed (1)` / `Tests  2 passed (2)`。

5. commit。
   ```bash
   git add src/lib/vault/confirm-todos.ts src/lib/vault/confirm-todos.test.ts
   git commit -m "$(cat <<'EOF'
   feat(vault): add parseConfirmTodos for TS vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 4: TS — `readVaultFile`

**Files:**
- Create: `src/lib/vault/read.ts`
- Test: `src/lib/vault/read.test.ts`

**Interfaces:**
- Consumes: `getVaultRoot` (Task 1, `./root`), `parseFrontmatter` (Task 2, `./frontmatter`)
- Produces: `export async function readVaultFile(relPath: string): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }>;`

### Steps

1. 失敗するテストを書く。
   ```ts
   // src/lib/vault/read.test.ts
   import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
   import { tmpdir } from "node:os";
   import path from "node:path";
   import { afterEach, beforeEach, describe, expect, it } from "vitest";
   import { readVaultFile } from "./read";

   describe("readVaultFile", () => {
     let vaultDir: string;
     const originalEnv = process.env.STUDY_AI_VAULT_DIR;

     beforeEach(async () => {
       vaultDir = await mkdtemp(path.join(tmpdir(), "vault-read-"));
       process.env.STUDY_AI_VAULT_DIR = vaultDir;
     });

     afterEach(async () => {
       await rm(vaultDir, { recursive: true, force: true });
       if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = originalEnv;
     });

     it("reads and parses a vault markdown file", async () => {
       const dir = path.join(vaultDir, "subjects", "日本史");
       await mkdir(dir, { recursive: true });
       const raw = [
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
       await writeFile(path.join(dir, "弱点カルテ.md"), raw, "utf8");

       const result = await readVaultFile("subjects/日本史/弱点カルテ.md");
       expect(result.frontmatter.subject).toBe("日本史");
       expect(result.frontmatter.schema_version).toBe(1);
       expect(result.body).toBe("# 弱点カルテ\n\n本文...");
       expect(result.raw).toBe(raw);
     });
   });
   ```

2. 失敗を確認する。
   ```bash
   npx vitest run src/lib/vault/read.test.ts
   ```
   期待出力: `Cannot find module './read'`。

3. 最小実装。
   ```ts
   // src/lib/vault/read.ts
   import { readFile } from "node:fs/promises";
   import path from "node:path";
   import { parseFrontmatter } from "./frontmatter";
   import { getVaultRoot } from "./root";

   export async function readVaultFile(
     relPath: string
   ): Promise<{ frontmatter: Record<string, unknown>; body: string; raw: string }> {
     const fullPath = path.join(getVaultRoot(), relPath);
     const raw = await readFile(fullPath, "utf8");
     const { frontmatter, body } = parseFrontmatter(raw);
     return { frontmatter, body, raw };
   }
   ```

4. 成功確認。
   ```bash
   npx vitest run src/lib/vault/read.test.ts
   ```
   期待出力: `Test Files  1 passed (1)` / `Tests  1 passed (1)`。

5. commit。
   ```bash
   git add src/lib/vault/read.ts src/lib/vault/read.test.ts
   git commit -m "$(cat <<'EOF'
   feat(vault): add readVaultFile for TS vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 5: TS — `listReports`

**Files:**
- Create: `src/lib/vault/reports.ts`
- Test: `src/lib/vault/reports.test.ts`

**Interfaces:**
- Consumes: `getVaultRoot` (Task 1), `readVaultFile` (Task 4)
- Produces:
  - `export type ReportMeta = { path: string; date: string; frontmatter: Record<string, unknown> };`
  - `export async function listReports(kind: 'daily' | 'weekly'): Promise<ReportMeta[]>;` — 日付降順。`daily` は frontmatter の `date` を、`weekly` は `week` を `ReportMeta.date` に格納する。

### Steps

1. 失敗するテストを書く。
   ```ts
   // src/lib/vault/reports.test.ts
   import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
   import { tmpdir } from "node:os";
   import path from "node:path";
   import { afterEach, beforeEach, describe, expect, it } from "vitest";
   import { listReports } from "./reports";

   function dailyRaw(date: string, confirmTodos: number) {
     return [
       "---",
       "type: daily-report",
       `date: ${date}`,
       `confirm_todos: ${confirmTodos}`,
       "updated: 2026-07-24T23:40:00+09:00",
       "source: nightly-batch",
       "schema_version: 1",
       "---",
       "",
       "本文",
     ].join("\n");
   }

   describe("listReports", () => {
     let vaultDir: string;
     const originalEnv = process.env.STUDY_AI_VAULT_DIR;

     beforeEach(async () => {
       vaultDir = await mkdtemp(path.join(tmpdir(), "vault-reports-"));
       process.env.STUDY_AI_VAULT_DIR = vaultDir;
     });

     afterEach(async () => {
       await rm(vaultDir, { recursive: true, force: true });
       if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = originalEnv;
     });

     it("lists daily reports sorted by date descending", async () => {
       const dir = path.join(vaultDir, "reports", "daily");
       await mkdir(dir, { recursive: true });
       await writeFile(path.join(dir, "2026-07-22.md"), dailyRaw("2026-07-22", 0), "utf8");
       await writeFile(path.join(dir, "2026-07-24.md"), dailyRaw("2026-07-24", 2), "utf8");

       const reports = await listReports("daily");
       expect(reports.map((r) => r.path)).toEqual([
         "reports/daily/2026-07-24.md",
         "reports/daily/2026-07-22.md",
       ]);
       expect(reports[0].date).toBe("2026-07-24");
       expect(reports[0].frontmatter.confirm_todos).toBe(2);
     });

     it("returns an empty array when the reports directory does not exist", async () => {
       expect(await listReports("weekly")).toEqual([]);
     });
   });
   ```

2. 失敗を確認する。
   ```bash
   npx vitest run src/lib/vault/reports.test.ts
   ```
   期待出力: `Cannot find module './reports'`。

3. 最小実装。
   ```ts
   // src/lib/vault/reports.ts
   import { readdir } from "node:fs/promises";
   import path from "node:path";
   import { readVaultFile } from "./read";
   import { getVaultRoot } from "./root";

   export type ReportMeta = { path: string; date: string; frontmatter: Record<string, unknown> };

   export async function listReports(kind: "daily" | "weekly"): Promise<ReportMeta[]> {
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

4. 成功確認。
   ```bash
   npx vitest run src/lib/vault/reports.test.ts
   ```
   期待出力: `Test Files  1 passed (1)` / `Tests  2 passed (2)`。

5. commit。
   ```bash
   git add src/lib/vault/reports.ts src/lib/vault/reports.test.ts
   git commit -m "$(cat <<'EOF'
   feat(vault): add listReports for TS vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 6: TS — `appendCorrection`

**Files:**
- Create: `src/lib/vault/corrections.ts`
- Test: `src/lib/vault/corrections.test.ts`

**Interfaces:**
- Consumes: `getVaultRoot` (Task 1)
- Produces:
  - `export type CorrectionEntry = { timestamp: string; report: string; todo: string; choice: string; note?: string };`
  - `export async function appendCorrection(entry: CorrectionEntry): Promise<void>;` — `_inbox/corrections.md` に追記のみ（既存行は書き換えない）。1件目はブロックをそのまま書き、2件目以降は直前に空行区切りを入れる。

### Steps

1. 失敗するテストを書く（このテストが生成する最終ファイル内容は Task 12 の Node版 `readCorrections` テストのフィクスチャと一字一句同一にする）。
   ```ts
   // src/lib/vault/corrections.test.ts
   import { mkdtemp, readFile, rm } from "node:fs/promises";
   import { tmpdir } from "node:os";
   import path from "node:path";
   import { afterEach, beforeEach, describe, expect, it } from "vitest";
   import { appendCorrection } from "./corrections";

   describe("appendCorrection", () => {
     let vaultDir: string;
     const originalEnv = process.env.STUDY_AI_VAULT_DIR;

     beforeEach(async () => {
       vaultDir = await mkdtemp(path.join(tmpdir(), "vault-corrections-"));
       process.env.STUDY_AI_VAULT_DIR = vaultDir;
     });

     afterEach(async () => {
       await rm(vaultDir, { recursive: true, force: true });
       if (originalEnv === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = originalEnv;
     });

     it("appends the exact contract §3b block for the first entry", async () => {
       await appendCorrection({
         timestamp: "2026-07-24T08:12:00+09:00",
         report: "reports/daily/2026-07-24.md",
         todo: "todo-1",
         choice: "世界史",
         note: "実は世界史でした",
       });
       const raw = await readFile(path.join(vaultDir, "_inbox", "corrections.md"), "utf8");
       expect(raw).toBe(
         [
           "## 2026-07-24T08:12:00+09:00",
           "- report: reports/daily/2026-07-24.md",
           "- todo: todo-1",
           "- choice: 世界史",
           "- note: 実は世界史でした",
           "",
         ].join("\n")
       );
     });

     it("appends a second entry separated by a blank line, omitting note when absent", async () => {
       await appendCorrection({
         timestamp: "2026-07-24T08:12:00+09:00",
         report: "reports/daily/2026-07-24.md",
         todo: "todo-1",
         choice: "世界史",
         note: "実は世界史でした",
       });
       await appendCorrection({
         timestamp: "2026-07-24T09:00:00+09:00",
         report: "reports/daily/2026-07-24.md",
         todo: "todo-2",
         choice: "不明",
       });
       const raw = await readFile(path.join(vaultDir, "_inbox", "corrections.md"), "utf8");
       expect(raw).toBe(
         [
           "## 2026-07-24T08:12:00+09:00",
           "- report: reports/daily/2026-07-24.md",
           "- todo: todo-1",
           "- choice: 世界史",
           "- note: 実は世界史でした",
           "",
           "## 2026-07-24T09:00:00+09:00",
           "- report: reports/daily/2026-07-24.md",
           "- todo: todo-2",
           "- choice: 不明",
           "",
         ].join("\n")
       );
     });
   });
   ```

2. 失敗を確認する。
   ```bash
   npx vitest run src/lib/vault/corrections.test.ts
   ```
   期待出力: `Cannot find module './corrections'`。

3. 最小実装。
   ```ts
   // src/lib/vault/corrections.ts
   import { appendFile, mkdir, readFile } from "node:fs/promises";
   import path from "node:path";
   import { getVaultRoot } from "./root";

   export type CorrectionEntry = { timestamp: string; report: string; todo: string; choice: string; note?: string };

   const CORRECTIONS_REL_PATH = "_inbox/corrections.md";

   export async function appendCorrection(entry: CorrectionEntry): Promise<void> {
     const fullPath = path.join(getVaultRoot(), CORRECTIONS_REL_PATH);
     await mkdir(path.dirname(fullPath), { recursive: true });

     const lines = [
       `## ${entry.timestamp}`,
       `- report: ${entry.report}`,
       `- todo: ${entry.todo}`,
       `- choice: ${entry.choice}`,
     ];
     if (entry.note !== undefined) lines.push(`- note: ${entry.note}`);
     const block = `${lines.join("\n")}\n`;

     let existing = "";
     try {
       existing = await readFile(fullPath, "utf8");
     } catch (error) {
       if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
     }
     const separator = existing.length > 0 ? "\n" : "";
     await appendFile(fullPath, `${separator}${block}`, "utf8");
   }
   ```

4. 成功確認。
   ```bash
   npx vitest run src/lib/vault/corrections.test.ts
   ```
   期待出力: `Test Files  1 passed (1)` / `Tests  2 passed (2)`。

5. commit。
   ```bash
   git add src/lib/vault/corrections.ts src/lib/vault/corrections.test.ts
   git commit -m "$(cat <<'EOF'
   feat(vault): add appendCorrection for TS vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 7: TS — barrel export `src/lib/vault/index.ts`

**Files:**
- Create: `src/lib/vault/index.ts`
- Test: `src/lib/vault/index.test.ts`

**Interfaces:**
- Consumes: Task 1〜6 の全エクスポート
- Produces: `src/lib/vault` からまとめて import できる barrel（後続計画は `import { ... } from "@/lib/vault"` を使う）。

### Steps

1. 失敗するテストを書く。
   ```ts
   // src/lib/vault/index.test.ts
   import { describe, expect, it } from "vitest";
   import * as vault from "./index";

   describe("vault barrel export", () => {
     it("re-exports every Foundation helper by its contract name", () => {
       expect(typeof vault.getVaultRoot).toBe("function");
       expect(typeof vault.parseFrontmatter).toBe("function");
       expect(typeof vault.stringifyFrontmatter).toBe("function");
       expect(typeof vault.readVaultFile).toBe("function");
       expect(typeof vault.listReports).toBe("function");
       expect(typeof vault.parseConfirmTodos).toBe("function");
       expect(typeof vault.appendCorrection).toBe("function");
     });
   });
   ```

2. 失敗を確認する。
   ```bash
   npx vitest run src/lib/vault/index.test.ts
   ```
   期待出力: `Cannot find module './index'`。

3. 最小実装。
   ```ts
   // src/lib/vault/index.ts
   export { getVaultRoot } from "./root";
   export { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";
   export { readVaultFile } from "./read";
   export type { ConfirmTodo } from "./confirm-todos";
   export { parseConfirmTodos } from "./confirm-todos";
   export type { ReportMeta } from "./reports";
   export { listReports } from "./reports";
   export type { CorrectionEntry } from "./corrections";
   export { appendCorrection } from "./corrections";
   ```

4. 成功確認。
   ```bash
   npx vitest run src/lib/vault
   ```
   期待出力: `Test Files  7 passed (7)`（root/frontmatter/confirm-todos/read/reports/corrections/index の各 test.ts）。

5. commit。
   ```bash
   git add src/lib/vault/index.ts src/lib/vault/index.test.ts
   git commit -m "$(cat <<'EOF'
   feat(vault): add barrel export for src/lib/vault

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 8: Node — `vaultRoot`

**Files:**
- Create: `analysis/helpers/vault/root.mjs`
- Test: `analysis/test/vault-root.test.mjs`

**Interfaces:**
- Consumes: なし
- Produces: `export function vaultRoot();` — 未設定なら `Error('STUDY_AI_VAULT_DIR is not set')` を throw（Task 1 の TS版とメッセージを一致させる）

### Steps

1. 失敗するテストを書く。
   ```js
   // analysis/test/vault-root.test.mjs
   import test from 'node:test';
   import assert from 'node:assert/strict';
   import { vaultRoot } from '../helpers/vault/root.mjs';

   test('vaultRoot returns the configured vault root', () => {
     const original = process.env.STUDY_AI_VAULT_DIR;
     process.env.STUDY_AI_VAULT_DIR = '/tmp/vault';
     try {
       assert.equal(vaultRoot(), '/tmp/vault');
     } finally {
       if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = original;
     }
   });

   test('vaultRoot throws when STUDY_AI_VAULT_DIR is not set', () => {
     const original = process.env.STUDY_AI_VAULT_DIR;
     delete process.env.STUDY_AI_VAULT_DIR;
     try {
       assert.throws(() => vaultRoot(), /STUDY_AI_VAULT_DIR is not set/);
     } finally {
       if (original !== undefined) process.env.STUDY_AI_VAULT_DIR = original;
     }
   });
   ```

2. 失敗を確認する。
   ```bash
   node --test analysis/test/vault-root.test.mjs
   ```
   期待出力: `Cannot find module '../helpers/vault/root.mjs'` によるエラーで fail。

3. 最小実装。
   ```js
   // analysis/helpers/vault/root.mjs
   export function vaultRoot() {
     const value = process.env.STUDY_AI_VAULT_DIR;
     if (!value) {
       throw new Error('STUDY_AI_VAULT_DIR is not set');
     }
     return value;
   }
   ```

4. 成功確認。
   ```bash
   node --test analysis/test/vault-root.test.mjs
   ```
   期待出力: `# pass 2` / `# fail 0`。

5. commit。
   ```bash
   git add analysis/helpers/vault/root.mjs analysis/test/vault-root.test.mjs
   git commit -m "$(cat <<'EOF'
   feat(vault): add vaultRoot for Node batch vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 9: Node — `parseFrontmatter` / `stringifyFrontmatter`

**Files:**
- Create: `analysis/helpers/vault/frontmatter.mjs`
- Test: `analysis/test/vault-frontmatter.test.mjs`

**Interfaces:**
- Consumes: なし
- Produces:
  - `export function parseFrontmatter(raw);` → `{ frontmatter, body }`
  - `export function stringifyFrontmatter(frontmatter, body);` → `string`
  - **同一フィクスチャ**: このテストの `FIXTURE_RAW`/`FIXTURE_FRONTMATTER`/`FIXTURE_BODY` は Task 2 の `src/lib/vault/frontmatter.test.ts` と一字一句同一。

### Steps

1. 失敗するテストを書く。
   ```js
   // analysis/test/vault-frontmatter.test.mjs
   import test from 'node:test';
   import assert from 'node:assert/strict';
   import { parseFrontmatter, stringifyFrontmatter } from '../helpers/vault/frontmatter.mjs';

   // NOTE: src/lib/vault/frontmatter.test.ts の FIXTURE_RAW と一字一句同一に保つ
   //       (契約: TS版とNode版でパース結果を完全一致させる)
   const FIXTURE_RAW = [
     '---',
     'type: karte',
     'subject: 日本史',
     'updated: 2026-07-24T23:40:00+09:00',
     'source: nightly-batch',
     'schema_version: 1',
     '---',
     '',
     '# 弱点カルテ',
     '',
     '本文...',
   ].join('\n');

   const FIXTURE_FRONTMATTER = {
     type: 'karte',
     subject: '日本史',
     updated: '2026-07-24T23:40:00+09:00',
     source: 'nightly-batch',
     schema_version: 1,
   };

   const FIXTURE_BODY = '# 弱点カルテ\n\n本文...';

   test('parseFrontmatter parses frontmatter fields and body', () => {
     const { frontmatter, body } = parseFrontmatter(FIXTURE_RAW);
     assert.deepEqual(frontmatter, FIXTURE_FRONTMATTER);
     assert.equal(body, FIXTURE_BODY);
   });

   test('parseFrontmatter throws when the opening delimiter is missing', () => {
     assert.throws(
       () => parseFrontmatter('no frontmatter here'),
       /vault file is missing frontmatter opening delimiter \(---\)/
     );
   });

   test('parseFrontmatter throws when the closing delimiter is missing', () => {
     assert.throws(
       () => parseFrontmatter('---\ntype: karte\nbody only'),
       /vault file is missing frontmatter closing delimiter \(---\)/
     );
   });

   test('stringifyFrontmatter produces the exact contract format and round-trips', () => {
     const raw = stringifyFrontmatter(FIXTURE_FRONTMATTER, FIXTURE_BODY);
     assert.equal(raw, FIXTURE_RAW);
     assert.deepEqual(parseFrontmatter(raw), { frontmatter: FIXTURE_FRONTMATTER, body: FIXTURE_BODY });
   });
   ```

2. 失敗を確認する。
   ```bash
   node --test analysis/test/vault-frontmatter.test.mjs
   ```
   期待出力: `Cannot find module '../helpers/vault/frontmatter.mjs'` によるエラーで fail。

3. 最小実装（Task 2 のTSアルゴリズムを1対1でJS移植）。
   ```js
   // analysis/helpers/vault/frontmatter.mjs
   export function parseFrontmatter(raw) {
     const lines = raw.split('\n');
     if (lines[0] !== '---') {
       throw new Error('vault file is missing frontmatter opening delimiter (---)');
     }
     const closeIndex = lines.indexOf('---', 1);
     if (closeIndex === -1) {
       throw new Error('vault file is missing frontmatter closing delimiter (---)');
     }
     const frontmatter = {};
     for (const line of lines.slice(1, closeIndex)) {
       if (!line.trim()) continue;
       const sep = line.indexOf(': ');
       if (sep === -1) continue;
       const key = line.slice(0, sep);
       const rawValue = line.slice(sep + 2);
       frontmatter[key] = /^-?\d+$/.test(rawValue) ? Number(rawValue) : rawValue;
     }
     const bodyLines = lines.slice(closeIndex + 1);
     if (bodyLines[0] === '') bodyLines.shift();
     return { frontmatter, body: bodyLines.join('\n') };
   }

   export function stringifyFrontmatter(frontmatter, body) {
     const lines = ['---'];
     for (const [key, value] of Object.entries(frontmatter)) {
       lines.push(`${key}: ${String(value)}`);
     }
     lines.push('---', '', body);
     return lines.join('\n');
   }
   ```

4. 成功確認。
   ```bash
   node --test analysis/test/vault-frontmatter.test.mjs
   ```
   期待出力: `# pass 4` / `# fail 0`。

5. commit。
   ```bash
   git add analysis/helpers/vault/frontmatter.mjs analysis/test/vault-frontmatter.test.mjs
   git commit -m "$(cat <<'EOF'
   feat(vault): add parseFrontmatter/stringifyFrontmatter for Node batch vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 10: Node — `readVaultFile` / `writeVaultFile`

**Files:**
- Create: `analysis/helpers/vault/read-write.mjs`
- Test: `analysis/test/vault-read-write.test.mjs`

**Interfaces:**
- Consumes: `vaultRoot` (Task 8), `parseFrontmatter`/`stringifyFrontmatter` (Task 9)
- Produces:
  - `export async function readVaultFile(relPath);` → `{ frontmatter, body, raw }`
  - `export async function writeVaultFile(relPath, frontmatter, body);` → ディレクトリ自動作成、戻り値なし

### Steps

1. 失敗するテストを書く。
   ```js
   // analysis/test/vault-read-write.test.mjs
   import test from 'node:test';
   import assert from 'node:assert/strict';
   import { mkdtemp, rm, readFile } from 'node:fs/promises';
   import { tmpdir } from 'node:os';
   import path from 'node:path';
   import { readVaultFile, writeVaultFile } from '../helpers/vault/read-write.mjs';

   test('writeVaultFile creates nested directories and readVaultFile round-trips it', async () => {
     const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-rw-'));
     const original = process.env.STUDY_AI_VAULT_DIR;
     process.env.STUDY_AI_VAULT_DIR = vaultDir;
     try {
       const frontmatter = {
         type: 'karte',
         subject: '日本史',
         updated: '2026-07-24T23:40:00+09:00',
         source: 'nightly-batch',
         schema_version: 1,
       };
       const body = '# 弱点カルテ\n\n本文...';

       await writeVaultFile('subjects/日本史/弱点カルテ.md', frontmatter, body);

       const raw = await readFile(path.join(vaultDir, 'subjects', '日本史', '弱点カルテ.md'), 'utf8');
       assert.match(raw, /^---\ntype: karte/);

       const result = await readVaultFile('subjects/日本史/弱点カルテ.md');
       assert.deepEqual(result.frontmatter, frontmatter);
       assert.equal(result.body, body);
       assert.equal(result.raw, raw);
     } finally {
       await rm(vaultDir, { recursive: true, force: true });
       if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = original;
     }
   });
   ```

2. 失敗を確認する。
   ```bash
   node --test analysis/test/vault-read-write.test.mjs
   ```
   期待出力: `Cannot find module '../helpers/vault/read-write.mjs'` によるエラーで fail。

3. 最小実装。
   ```js
   // analysis/helpers/vault/read-write.mjs
   import { mkdir, readFile, writeFile } from 'node:fs/promises';
   import path from 'node:path';
   import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
   import { vaultRoot } from './root.mjs';

   export async function readVaultFile(relPath) {
     const fullPath = path.join(vaultRoot(), relPath);
     const raw = await readFile(fullPath, 'utf8');
     const { frontmatter, body } = parseFrontmatter(raw);
     return { frontmatter, body, raw };
   }

   export async function writeVaultFile(relPath, frontmatter, body) {
     const fullPath = path.join(vaultRoot(), relPath);
     await mkdir(path.dirname(fullPath), { recursive: true });
     const raw = stringifyFrontmatter(frontmatter, body);
     await writeFile(fullPath, raw, 'utf8');
   }
   ```

4. 成功確認。
   ```bash
   node --test analysis/test/vault-read-write.test.mjs
   ```
   期待出力: `# pass 1` / `# fail 0`。

5. commit。
   ```bash
   git add analysis/helpers/vault/read-write.mjs analysis/test/vault-read-write.test.mjs
   git commit -m "$(cat <<'EOF'
   feat(vault): add readVaultFile/writeVaultFile for Node batch vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 11: Node — `archivePhoto`

**Files:**
- Create: `analysis/helpers/vault/archive.mjs`
- Test: `analysis/test/vault-archive.test.mjs`

**Interfaces:**
- Consumes: `vaultRoot` (Task 8)
- Produces: `export async function archivePhoto(srcRelPath, dateStr);` — `srcRelPath`（vaultルート相対、例 `_inbox/abc.jpg`）を `_archive/YYYY/MM/` へ移動し、移動先の相対パス（例 `_archive/2026/07/abc.jpg`）を返す。`dateStr` は `YYYY-MM-DD` 形式。

### Steps

1. 失敗するテストを書く。
   ```js
   // analysis/test/vault-archive.test.mjs
   import test from 'node:test';
   import assert from 'node:assert/strict';
   import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
   import { tmpdir } from 'node:os';
   import path from 'node:path';
   import { archivePhoto } from '../helpers/vault/archive.mjs';

   test('archivePhoto moves an inbox photo into _archive/YYYY/MM and returns the new relPath', async () => {
     const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-archive-'));
     const original = process.env.STUDY_AI_VAULT_DIR;
     process.env.STUDY_AI_VAULT_DIR = vaultDir;
     try {
       await mkdir(path.join(vaultDir, '_inbox'), { recursive: true });
       await writeFile(path.join(vaultDir, '_inbox', 'abc.jpg'), 'dummy-image-bytes', 'utf8');

       const destRelPath = await archivePhoto('_inbox/abc.jpg', '2026-07-24');

       assert.equal(destRelPath, '_archive/2026/07/abc.jpg');
       const moved = await readFile(path.join(vaultDir, '_archive', '2026', '07', 'abc.jpg'), 'utf8');
       assert.equal(moved, 'dummy-image-bytes');
       await assert.rejects(() => readFile(path.join(vaultDir, '_inbox', 'abc.jpg')));
     } finally {
       await rm(vaultDir, { recursive: true, force: true });
       if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = original;
     }
   });

   test('archivePhoto rejects a malformed dateStr', async () => {
     const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-archive-'));
     const original = process.env.STUDY_AI_VAULT_DIR;
     process.env.STUDY_AI_VAULT_DIR = vaultDir;
     try {
       await assert.rejects(
         () => archivePhoto('_inbox/abc.jpg', '2026/07/24'),
         /invalid dateStr/
       );
     } finally {
       await rm(vaultDir, { recursive: true, force: true });
       if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = original;
     }
   });
   ```

2. 失敗を確認する。
   ```bash
   node --test analysis/test/vault-archive.test.mjs
   ```
   期待出力: `Cannot find module '../helpers/vault/archive.mjs'` によるエラーで fail。

3. 最小実装。
   ```js
   // analysis/helpers/vault/archive.mjs
   import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
   import path from 'node:path';
   import { vaultRoot } from './root.mjs';

   export async function archivePhoto(srcRelPath, dateStr) {
     const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateStr);
     if (!match) {
       throw new Error(`archivePhoto: invalid dateStr "${dateStr}", expected YYYY-MM-DD`);
     }
     const [, year, month] = match;
     const destRelPath = path.posix.join('_archive', year, month, path.basename(srcRelPath));

     const root = vaultRoot();
     const srcFullPath = path.join(root, srcRelPath);
     const destFullPath = path.join(root, destRelPath);
     await mkdir(path.dirname(destFullPath), { recursive: true });
     try {
       await rename(srcFullPath, destFullPath);
     } catch (error) {
       if (error.code !== 'EXDEV') throw error;
       await copyFile(srcFullPath, destFullPath);
       await unlink(srcFullPath);
     }
     return destRelPath;
   }
   ```

4. 成功確認。
   ```bash
   node --test analysis/test/vault-archive.test.mjs
   ```
   期待出力: `# pass 2` / `# fail 0`。

5. commit。
   ```bash
   git add analysis/helpers/vault/archive.mjs analysis/test/vault-archive.test.mjs
   git commit -m "$(cat <<'EOF'
   feat(vault): add archivePhoto for Node batch vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 12: Node — `readCorrections` / `clearCorrections`

**Files:**
- Create: `analysis/helpers/vault/corrections.mjs`
- Test: `analysis/test/vault-corrections.test.mjs`

**Interfaces:**
- Consumes: `vaultRoot` (Task 8)
- Produces:
  - `export async function readCorrections();` → `CorrectionEntry[]`（無ければ `[]`）
  - `export async function clearCorrections();` → 消化後に `_inbox/corrections.md` を空にする
  - **同一フィクスチャ**: このテストのフィクスチャ文字列は Task 6 の `appendCorrection` テストが実際に生成する2エントリのファイル内容と一字一句同一。

### Steps

1. 失敗するテストを書く。
   ```js
   // analysis/test/vault-corrections.test.mjs
   import test from 'node:test';
   import assert from 'node:assert/strict';
   import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
   import { tmpdir } from 'node:os';
   import path from 'node:path';
   import { clearCorrections, readCorrections } from '../helpers/vault/corrections.mjs';

   // NOTE: src/lib/vault/corrections.test.ts の appendCorrection 2件テストが
   //       生成するファイル内容と一字一句同一 (契約: TS版とNode版でパース結果を完全一致させる)
   const FIXTURE_RAW = [
     '## 2026-07-24T08:12:00+09:00',
     '- report: reports/daily/2026-07-24.md',
     '- todo: todo-1',
     '- choice: 世界史',
     '- note: 実は世界史でした',
     '',
     '## 2026-07-24T09:00:00+09:00',
     '- report: reports/daily/2026-07-24.md',
     '- todo: todo-2',
     '- choice: 不明',
     '',
   ].join('\n');

   test('readCorrections parses both entries, note optional', async () => {
     const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-corrections-'));
     const original = process.env.STUDY_AI_VAULT_DIR;
     process.env.STUDY_AI_VAULT_DIR = vaultDir;
     try {
       await mkdir(path.join(vaultDir, '_inbox'), { recursive: true });
       await writeFile(path.join(vaultDir, '_inbox', 'corrections.md'), FIXTURE_RAW, 'utf8');

       const entries = await readCorrections();
       assert.deepEqual(entries, [
         {
           timestamp: '2026-07-24T08:12:00+09:00',
           report: 'reports/daily/2026-07-24.md',
           todo: 'todo-1',
           choice: '世界史',
           note: '実は世界史でした',
         },
         {
           timestamp: '2026-07-24T09:00:00+09:00',
           report: 'reports/daily/2026-07-24.md',
           todo: 'todo-2',
           choice: '不明',
           note: undefined,
         },
       ]);
     } finally {
       await rm(vaultDir, { recursive: true, force: true });
       if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = original;
     }
   });

   test('readCorrections returns [] when corrections.md does not exist', async () => {
     const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-corrections-'));
     const original = process.env.STUDY_AI_VAULT_DIR;
     process.env.STUDY_AI_VAULT_DIR = vaultDir;
     try {
       assert.deepEqual(await readCorrections(), []);
     } finally {
       await rm(vaultDir, { recursive: true, force: true });
       if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = original;
     }
   });

   test('clearCorrections empties the file after consumption', async () => {
     const vaultDir = await mkdtemp(path.join(tmpdir(), 'vault-corrections-'));
     const original = process.env.STUDY_AI_VAULT_DIR;
     process.env.STUDY_AI_VAULT_DIR = vaultDir;
     try {
       await mkdir(path.join(vaultDir, '_inbox'), { recursive: true });
       await writeFile(path.join(vaultDir, '_inbox', 'corrections.md'), FIXTURE_RAW, 'utf8');

       await clearCorrections();

       const raw = await readFile(path.join(vaultDir, '_inbox', 'corrections.md'), 'utf8');
       assert.equal(raw, '');
       assert.deepEqual(await readCorrections(), []);
     } finally {
       await rm(vaultDir, { recursive: true, force: true });
       if (original === undefined) delete process.env.STUDY_AI_VAULT_DIR;
       else process.env.STUDY_AI_VAULT_DIR = original;
     }
   });
   ```

2. 失敗を確認する。
   ```bash
   node --test analysis/test/vault-corrections.test.mjs
   ```
   期待出力: `Cannot find module '../helpers/vault/corrections.mjs'` によるエラーで fail。

3. 最小実装。
   ```js
   // analysis/helpers/vault/corrections.mjs
   import { mkdir, readFile, writeFile } from 'node:fs/promises';
   import path from 'node:path';
   import { vaultRoot } from './root.mjs';

   const CORRECTIONS_REL_PATH = '_inbox/corrections.md';

   export async function readCorrections() {
     const fullPath = path.join(vaultRoot(), CORRECTIONS_REL_PATH);
     let raw;
     try {
       raw = await readFile(fullPath, 'utf8');
     } catch (error) {
       if (error.code === 'ENOENT') return [];
       throw error;
     }
     const blocks = raw
       .split(/\n(?=## )/)
       .map((block) => block.trim())
       .filter(Boolean);

     const entries = [];
     for (const block of blocks) {
       const lines = block.split('\n');
       const headingMatch = /^## (.+)$/.exec(lines[0]);
       if (!headingMatch) continue;
       const fields = {};
       for (const line of lines.slice(1)) {
         const m = /^- (\w+): (.*)$/.exec(line);
         if (m) fields[m[1]] = m[2];
       }
       entries.push({
         timestamp: headingMatch[1],
         report: fields.report,
         todo: fields.todo,
         choice: fields.choice,
         note: fields.note,
       });
     }
     return entries;
   }

   export async function clearCorrections() {
     const fullPath = path.join(vaultRoot(), CORRECTIONS_REL_PATH);
     await mkdir(path.dirname(fullPath), { recursive: true });
     await writeFile(fullPath, '', 'utf8');
   }
   ```

4. 成功確認。
   ```bash
   node --test analysis/test/vault-corrections.test.mjs
   ```
   期待出力: `# pass 3` / `# fail 0`。

5. commit。
   ```bash
   git add analysis/helpers/vault/corrections.mjs analysis/test/vault-corrections.test.mjs
   git commit -m "$(cat <<'EOF'
   feat(vault): add readCorrections/clearCorrections for Node batch vault helpers

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 13: Node — barrel export `analysis/helpers/vault/index.mjs` と全体検証

**Files:**
- Create: `analysis/helpers/vault/index.mjs`
- Test: `analysis/test/vault-index.test.mjs`

**Interfaces:**
- Consumes: Task 8〜12 の全エクスポート
- Produces: `analysis/helpers/vault/index.mjs` からまとめて import できる barrel（計画2の夜間バッチは `import { vaultRoot, readVaultFile, ... } from '../helpers/vault/index.mjs'` を使う）。

### Steps

1. 失敗するテストを書く。
   ```js
   // analysis/test/vault-index.test.mjs
   import test from 'node:test';
   import assert from 'node:assert/strict';
   import * as vault from '../helpers/vault/index.mjs';

   test('vault barrel re-exports every Foundation helper by its contract name', () => {
     assert.equal(typeof vault.vaultRoot, 'function');
     assert.equal(typeof vault.parseFrontmatter, 'function');
     assert.equal(typeof vault.stringifyFrontmatter, 'function');
     assert.equal(typeof vault.readVaultFile, 'function');
     assert.equal(typeof vault.writeVaultFile, 'function');
     assert.equal(typeof vault.archivePhoto, 'function');
     assert.equal(typeof vault.readCorrections, 'function');
     assert.equal(typeof vault.clearCorrections, 'function');
   });
   ```

2. 失敗を確認する。
   ```bash
   node --test analysis/test/vault-index.test.mjs
   ```
   期待出力: `Cannot find module '../helpers/vault/index.mjs'` によるエラーで fail。

3. 最小実装。
   ```js
   // analysis/helpers/vault/index.mjs
   export { vaultRoot } from './root.mjs';
   export { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
   export { readVaultFile, writeVaultFile } from './read-write.mjs';
   export { archivePhoto } from './archive.mjs';
   export { readCorrections, clearCorrections } from './corrections.mjs';
   ```

4. 成功確認（このステップで Foundation 全体を両方の検査コマンドで通す）。
   ```bash
   npm test -- --run
   npm run test:analysis
   ```
   期待出力: `npm test` は `src/lib/vault/*.test.ts` を含む全 vitest テストが pass（`Test Files  N passed`、失敗0件）。`npm run test:analysis` は `analysis/test/vault-*.test.mjs` を含む全 node --test テストが pass（各ファイルで `# fail 0`）。

5. commit。
   ```bash
   git add analysis/helpers/vault/index.mjs analysis/test/vault-index.test.mjs
   git commit -m "$(cat <<'EOF'
   feat(vault): add barrel export for analysis/helpers/vault

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   )"
   ```
