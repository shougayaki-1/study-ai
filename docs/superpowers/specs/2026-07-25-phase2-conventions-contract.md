# Phase 2 共有インターフェース契約（3計画の seam）

- 日付: 2026-07-25
- 親スペック: [`2026-07-25-vault-dialogue-records-schedule-design.md`](./2026-07-25-vault-dialogue-records-schedule-design.md)
- 前提契約: [`2026-07-24-vault-conventions-contract.md`](./2026-07-24-vault-conventions-contract.md)（Phase 1。`STUDY_AI_VAULT_DIR`・frontmatter・既存ヘルパはそのまま踏襲）
- 位置づけ: 計画1（土台+記録）が**実装**し、計画2（予定・計画）と計画3（今日・後片付け）が
  **消費/拡張**する固定契約。**パス・行フォーマット・関数シグネチャは全計画で厳守**（勝手に改名しない）。

## 0. 全計画に共通する制約

- vaultルートは Phase 1 と同じ環境変数 **`STUDY_AI_VAULT_DIR`**。未設定なら throw（黙って別パスに書かない）。
- **TS実装（`src/lib/vault/`）と Node実装（`analysis/helpers/vault/`）は同一フォーマットを
  完全に同じ構造へ解釈すること。** 同一フィクスチャ文字列を両テストに置いて検証する（Phase 1 と同じ方式）。
- Node側は **Node標準ライブラリのみ**（追加npm禁止）。TS側の fs アクセスは**サーバ側のみ**。
- 既存ヘルパ（`vaultRoot`/`getVaultRoot`/`readVaultFile`/`writeVaultFile`/`parseFrontmatter`/
  `stringifyFrontmatter`）は**再実装せず import して使う**。
- 行フォーマットの区切りは Phase 1 の要確認TODO行と同じ流儀：フィールドは **` | `**、
  `key=value` は**最初の `=` で分割**。値に ` | ` や `=` は含められない。
- 壊れた行・必須キー欠落の行は**その行だけスキップ**し、全体を落とさない。

## 1. ファイルパスと行フォーマット

### 1a. 勉強記録 `records/YYYY-MM-DD.md`（1日1ファイル・`## セッション` に追記）

```md
---
type: study-record
date: 2026-07-25
source: dialogue
schema_version: 1
updated: 2026-07-25T22:10:00+09:00
---

## セッション
- id=s-1 | subject=英語R | minutes=60 | kind=material | understanding=understood | memo=長文2題
- id=s-2 | subject=数学IA | minutes=90 | kind=common_test | year=2025 | section=第3問 | understanding=uncertain | memo=
```

- 行頭は **`- `**（チェックボックスは付けない）。
- キー順は上記のとおり固定：`id` `subject` `minutes` `kind`（`kind=common_test` のときのみ `year` `section`）`understanding` `memo`。
- `id`: ファイル内で一意、`s-<連番>`。`minutes`: 正の整数。
- `kind`: `material` | `common_test` | `secondary`。
- `understanding`: `understood` | `uncertain` | `not_understood`。
- `memo`: 空文字可（`memo=` で終わってよい）。
- 科目名は13科目のいずれか: 英語R / 英語L / 現代文 / 古文 / 漢文 / 数学IA / 数学2BC / 化学基礎 /
  地学基礎 / 地理 / 政治経済 / 情報 / 小論文。

### 1b. 予定 `schedule.md`（単一ファイル・`## 予定`）

```md
---
type: schedule
schema_version: 1
updated: 2026-07-25T22:10:00+09:00
---

## 予定
- [ ] id=ev-1 | kind=mock_exam | title=第2回模試 | due=2026-08-01
- [x] id=ev-2 | kind=assignment | title=英語課題 | due=2026-07-20
```

- 行頭は **`- [ ] `**（未完了）/ **`- [x] `**（完了）。完了トグルはこの記号のみを書き換える。
- キー順固定：`id` `kind` `title` `due`。`id` は `ev-<連番>`。
- `kind`: `assignment` | `application` | `mock_exam` | `exam` | `other`。`due`: `YYYY-MM-DD`。

### 1c. 学習計画 `plans/YYYY-MM-DD.md`（1日1ファイル・`## 計画`）

```md
---
type: study-plan
date: 2026-07-26
schema_version: 1
updated: 2026-07-25T22:10:00+09:00
---

## 計画
- id=p-1 | start=09:00 | end=10:30 | subject=英語R | status=planned | memo=長文演習
```

- 行頭は **`- `**。キー順固定：`id` `start` `end` `subject` `status` `memo`。`id` は `p-<連番>`。
- `start`/`end`: `HH:MM`（24時間表記）。`end > start`。
- `status`: `planned` | `done` | `skipped`。`memo`: 空文字可。

## 2. TS側シグネチャ（`src/lib/vault/` に追加。計画1が 2a を実装）

### 2a. 記録（計画1が実装）
```ts
export type StudyKind = 'material' | 'common_test' | 'secondary';
export type Understanding = 'understood' | 'uncertain' | 'not_understood';
export type StudySession = {
  id: string; subject: string; minutes: number; kind: StudyKind;
  year?: number; section?: string; understanding: Understanding; memo: string;
};
export function parseStudySessions(body: string): StudySession[];
export function formatStudySessionLine(session: StudySession): string;

export type StudyRecordDay = { date: string; sessions: StudySession[] };
export async function readStudyRecord(date: string): Promise<StudyRecordDay>;   // 無ければ sessions: []
export async function listStudyRecordDates(): Promise<string[]>;                // 日付降順
```

### 2b. 予定（計画2が実装）
```ts
export type ScheduleKind = 'assignment' | 'application' | 'mock_exam' | 'exam' | 'other';
export type ScheduleEvent = { id: string; kind: ScheduleKind; title: string; due: string; done: boolean };
export function parseScheduleEvents(body: string): ScheduleEvent[];
export function formatScheduleEventLine(event: ScheduleEvent): string;
export async function readSchedule(): Promise<ScheduleEvent[]>;                 // 無ければ []
export async function setScheduleEventDone(id: string, done: boolean): Promise<void>;  // 該当行のみ書き換え
```

### 2c. 学習計画（計画2が実装）
```ts
export type PlanStatus = 'planned' | 'done' | 'skipped';
export type PlanBlock = { id: string; start: string; end: string; subject: string; status: PlanStatus; memo: string };
export function parsePlanBlocks(body: string): PlanBlock[];
export function formatPlanBlockLine(block: PlanBlock): string;
export async function readPlan(date: string): Promise<PlanBlock[]>;             // 無ければ []
```

**バレル**: すべて `src/lib/vault/index.ts` から再エクスポートする（Web は `@/lib/vault` から import）。

## 3. Node側シグネチャ（`analysis/helpers/vault/` に追加。対話が使うライタ）

計画1が 3a を実装、計画2が 3b・3c を実装。**TS版とパース結果が完全一致すること。**

### 3a. 記録（計画1）
```js
export function parseStudySessions(body);          // TS版と同一構造を返す
export function formatStudySessionLine(session);   // TS版と同一文字列を返す
export function nextSessionId(sessions);           // 's-<最大連番+1>'
export async function appendStudySession(date, session);   // records/<date>.md へ追記(無ければ作成)
export async function updateStudySession(date, id, patch); // 該当行のみ差し替え
export async function deleteStudySession(date, id);        // 該当行のみ削除
```

### 3b. 予定（計画2）
```js
export function parseScheduleEvents(body);
export function formatScheduleEventLine(event);
export function nextEventId(events);                // 'ev-<最大連番+1>'
export async function appendScheduleEvent(event);
export async function updateScheduleEvent(id, patch);
export async function deleteScheduleEvent(id);
```

### 3c. 学習計画（計画2）
```js
export function parsePlanBlocks(body);
export function formatPlanBlockLine(block);
export function nextPlanId(blocks);                 // 'p-<最大連番+1>'
export async function appendPlanBlock(date, block);
export async function updatePlanBlock(date, id, patch);
export async function deletePlanBlock(date, id);
```

**バレル**: すべて `analysis/helpers/vault/index.mjs` から再エクスポートする。

**CLIラッパー**: 対話（Claude Code / Codex）がシェルから呼べるよう、`analysis/helpers/` 直下に
薄いラッパー `.mjs` を置く（Phase 1 の `read-vault-file.mjs` と同じ作り。各 `run(argv)` を
エクスポートし、`printJson` で結果を返す）。命名は
`record-session.mjs` / `edit-session.mjs` / `delete-session.mjs`（計画1）、
`add-event.mjs` / `edit-event.mjs` / `delete-event.mjs` /
`add-plan-block.mjs` / `edit-plan-block.mjs` / `delete-plan-block.mjs`（計画2）。

## 4. 対話手順書（計画1が骨格を作成、計画2が加筆）

- パス: **`docs/study-dialogue.md`**。
- **CLI非依存**：Claude Code 固有ツール名（`AskUserQuestion` 等）に依存せず、
  「番号を選んで答える」プレーンテキスト形式で書く（`analysis/nightly.md` と同じ方針）。
- 冒頭に共通の前提（`STUDY_AI_VAULT_DIR` の解決、未設定なら書き込まない、
  書き込みは `analysis/helpers/*.mjs` のシェル実行経由、最後に必ず書いた内容を要約提示）を置く。
- `CLAUDE.md` と `AGENTS.md` の双方に、この手順書を参照する一文を追記する（計画1で実施）。

## 5. Web ルートの担当分け

| ルート | 変更内容 | 担当計画 |
| --- | --- | --- |
| `/records` | vault読みの履歴ビューア（編集/削除UIなし） | 計画1 |
| `/schedule` | vault読みの予定+計画ビューア（予定の完了タップのみ可） | 計画2 |
| `/` | vault読みに再構築（当日の計画/近い締切/最新レポートへの導線） | 計画3 |
| `/record` | ディレクトリ削除 | 計画1 |
| BottomNav「記録」タブ | 削除（残り: 今日/履歴/分析/予定/設定 + ドロワーのレポート/カルテ） | 計画1 |
| push通知一式（`api/cron/*`・`vercel.json` crons・`settings`の購読UI・`sw.js`のpushリスナー） | 削除。**`sw.js`のオフラインキャッシュと`ServiceWorkerRegister.tsx`は残す** | 計画3 |
| `/stats`・`/columns`・`/reports`・`/karte`・`/login`・middleware | 変更しない | — |

## 6. 既存E2Eの改廃（担当を固定）

- `e2e/core-flows.spec.ts`: `/record` での保存フローを削除し、vaultフィクスチャに対する
  `/records` 表示検証に差し替える → **計画1**
- `e2e/extended-flows.spec.ts`: 履歴の編集/削除と `/schedule` 操作の部分を、vaultフィクスチャに
  対する `/schedule` 表示＋予定の完了タップ検証に差し替える → **計画2**
- 既存 `e2e/fixtures/vault/` に `records/`・`schedule.md`・`plans/` のフィクスチャを追加する
  （Phase 1 の `e2e/vault-reports.spec.ts` と同じ流儀。`STUDY_AI_VAULT_DIR` はシェル環境変数で渡す）

## 7. 過去データ移行（計画3が担当）

- `analysis/helpers/migrate-supabase-to-vault.mjs` を新設（1回限りの手動実行。夜間バッチには組み込まない）。
- Supabase アクセスは既存 `analysis/helpers/lib.mjs` を使う。
- `study_sessions`×`subjects` → `records/YYYY-MM-DD.md`、`events` → `schedule.md`、
  `plan_blocks` → `plans/YYYY-MM-DD.md`。
- `unit_id`/`material_id`/`recurrence_rule` は本契約のフォーマットに無いため落ちる。
  **落ちる情報がある旨を実行時に警告表示する。**
