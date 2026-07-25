# Phase 2 共有インターフェース契約（3計画の seam）

- 日付: 2026-07-25
- 親スペック: [`2026-07-25-vault-dialogue-records-schedule-design.md`](./2026-07-25-vault-dialogue-records-schedule-design.md)
- 前提契約: [`2026-07-24-vault-conventions-contract.md`](./2026-07-24-vault-conventions-contract.md)（Phase 1。`STUDY_AI_VAULT_DIR`・frontmatter・既存ヘルパはそのまま踏襲）
- 位置づけ: 計画1（土台+記録）が**実装**し、計画2（予定・計画）と計画3（今日・後片付け）が
  **消費/拡張**する固定契約。**パス・行フォーマット・関数シグネチャは全計画で厳守**（勝手に改名しない）。

## 0. 全計画に共通する制約

- vaultルートは Phase 1 と同じ環境変数 **`STUDY_AI_VAULT_DIR`**。未設定なら throw（黙って別パスに書かない）。
- **TS実装（`src/lib/vault/`）と Node実装（`analysis/helpers/vault/`）は同一フォーマットを
  完全に同じ構造へ解釈すること。** 検証方法は下記「フォーマット parity の担保」に従う。
- Node側は **Node標準ライブラリのみ**（追加npm禁止）。TS側の fs アクセスは**サーバ側のみ**。
- 既存ヘルパ（`vaultRoot`/`getVaultRoot`/`readVaultFile`/`writeVaultFile`/`parseFrontmatter`/
  `stringifyFrontmatter`）は**再実装せず import して使う**。
- 行フォーマットの区切りは Phase 1 の要確認TODO行と同じ流儀：フィールドは **` | `**、
  `key=value` は**最初の `=` で分割**。
  したがって **値に含めてはならないのは ` | ` と改行の2つだけ**。`=` は値に含めてよい
  （最初の `=` で分割するため `title=y=mx+b` は正しく `y=mx+b` と解釈される）。
- **禁止文字はコードで強制する。** 各値が ` | ` または改行(`\n`)を含む場合は `throw` する。
  プロンプト（`docs/study-dialogue.md`）の指示だけに頼らない。CLIラッパーはこの throw を
  呼び出し元に伝え、対話側が言い直しを促す。
  **実装は言語ごとに1箇所へ集約する**（記録・予定・学習計画の各フォーマッタで再定義しない）:
  - TS: `src/lib/vault/line-format.ts` に `export function assertSafeValue(value: string, field: string): void`
  - Node: `analysis/helpers/vault/line-format.mjs` に `export function assertSafeValue(value, field)`
  どちらもエラーメッセージは
  `` `${field} must not contain ' | ' or a newline: ${JSON.stringify(value)}` `` に統一する
  （対話側がユーザーに理由を説明できるよう、どのフィールドが原因かを必ず含める）。
  **計画1がこの2ファイルを作成し、計画2は import して使う**（再定義禁止）。
- **リーダは壊れた行・必須キー欠落の行をその行だけスキップ**し、全体を落とさない。
- **ライタは認識できない行を保存する（破壊しない）。** 追記・更新・削除は
  「対象行だけを操作し、他の行はそのまま残す」方式で実装すること。
  本文をパース結果から**再生成してはならない**（スキップされた壊れた行や、人間が書き足した
  見出し・メモが消えるため）。この方針は記録・予定・学習計画のすべてに適用する。
- **値の妥当性はCLIラッパーの入口で検査する。** `subject` は §1a の13科目 allowlist、
  `kind`/`understanding`/`status` は各 enum、日付は `YYYY-MM-DD`、時刻は `HH:MM`、
  学習計画は `end > start`。外れたら `throw` する（黙って書かない）。
- **書き込みはアトミックに行う。** `writeVaultFile` は同一ディレクトリに一時ファイルを書いて
  `rename` する方式にする（Node標準の `fs/promises` で実装可能）。Phase 2 では書き手が
  夜間バッチ・対話CLI・Webの3系統に増え、Googleドライブのデーモンが同時に読むため、
  途中で落ちた際にファイルが切り詰められた状態で残るのを防ぐ。

### フォーマット parity の担保（TS実装とNode実装のズレ防止）

1. **フィクスチャは1ファイルに外出しし、両テストがそれを読む。** 契約1a/1b/1cの各例を
   `analysis/test/fixtures/study-record.md` / `schedule.md` / `study-plan.md` に置き、
   TSテスト(vitest)もNodeテスト(`node --test`)も `readFileSync` でこの同一ファイルを読む。
   フィクスチャ文字列を2ファイルにコピペしてはならない（片方だけ直して両方グリーンのまま
   乖離する事故を構造的に防ぐ）。
2. **parityテストを置く。** 同じフィクスチャを両実装でパースし、`JSON.stringify` の結果が
   一致することを検証するテストを、記録・予定・学習計画それぞれに1本ずつ用意する。
   **機構は全計画で統一する**: vitest 側（`src/**/*.test.ts`）から
   `await import(pathToFileURL(path.join(REPO_ROOT, "analysis/helpers/vault/<name>.mjs")).href)`
   で Node 実装を動的 import し、TS 実装の結果と比較する。
   この機構は既存の `analysis/helpers/vault/frontmatter.mjs` を使った使い捨てテストで
   **実機検証済み**（2026-07-26）。`vitest.config.ts` の `include: ["src/**/*.test.ts"]` と
   `environment: "node"` のまま追加設定なしで動く。`/* @vite-ignore */` は不要。
3. **フォーマットを変更するときの手順**（将来の同期漏れ防止）:
   ①共有フィクスチャに新ケースを追加 → ②両実装のテストが落ちることを確認 → ③両方を直す →
   ④`schema_version` を上げる。リーダは**未知の `schema_version` を検出したら警告を表示する**
   （読めるだけ読んで落とさない）。
4. パーサ/フォーマッタは純粋関数のみなので、将来的には `.mjs` 1本に統一してTS側から import する
   単一実装化が理想。ただし Next.js のバンドル境界を跨ぐ判断が必要なため、**Phase 3 の課題として
   先送りする**（本フェーズは 1〜3 で実害を防ぐ）。

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
- `CLAUDE.md` と `AGENTS.md` の双方に、この手順書を参照する一文を置く（計画1で実施）。
  **リポジトリルートにはどちらも存在しない**（既存の`CLAUDE.md`はユーザーのグローバル設定
  `~/.claude/CLAUDE.md`であり、リポジトリの一部ではない）ため、計画1が両ファイルを新規作成する。

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
- `e2e/extended-flows.spec.ts` は3件のテストを持ち、**担当を件ごとに分ける**
  （原則: **自分が壊したテストは自分の計画内で始末する**。計画をまたいで壊れたまま放置しない）:
  - 1件目「履歴の記録を編集して削除できる」: `/record` へ goto するため、**`/record` を削除する
    計画1が同じTask内で削除する** → **計画1**
  - 2件目「繰り返し時間割を作成できる」: `plan_blocks` の繰り返し設定UIのテスト。繰り返しは
    本フェーズのスコープ外なので削除する → **計画2**
  - 3件目「週の学習時間を保存できる」: **`/stats` の機能テスト**。`/stats` は「変更しない」
    スコープであり、これが `/stats` の唯一のE2Eカバレッジ。**計画2の書き換えで巻き添えにせず、
    そのまま残すこと** → **計画2（保全）**
- `e2e/core-flows.spec.ts` の3件目「締切予定を作成して編集できる」（旧`/schedule`の追加・編集UIを操作）:
  計画1は`/schedule`を担当しないため手つかずで残す。**`/schedule`を読み取り専用にする計画2が削除する**
  （計画2のTask 17）。この受け渡しを守らないと計画2の最終E2E実行で失敗する。
- 既存 `e2e/fixtures/vault/` に `records/`・`schedule.md`・`plans/` のフィクスチャを追加する
  （Phase 1 の `e2e/vault-reports.spec.ts` と同じ流儀。`STUDY_AI_VAULT_DIR` はシェル環境変数で渡す）

## 7. 過去データ移行（計画3が担当）

- `analysis/helpers/migrate-supabase-to-vault.mjs` を新設（1回限りの手動実行。夜間バッチには組み込まない）。
- Supabase アクセスは既存 `analysis/helpers/lib.mjs` を使う。
- `study_sessions`×`subjects` → `records/YYYY-MM-DD.md`、`events` → `schedule.md`、
  `plan_blocks` → `plans/YYYY-MM-DD.md`。
- `unit_id`/`material_id`/`recurrence_rule` は本契約のフォーマットに無いため落ちる。
  **落ちる情報がある旨を実行時に警告表示する。**

**移行スクリプトの必須要件**（1回限りの実行でも、失敗時に取り返しがつくこと）:

1. **id を採番してから書く。** §3 のライタ（`appendStudySession` 等）は**id を採番しない**
   （採番は各CLIラッパーの責務）。移行スクリプトはライタを直接呼ぶため、
   **書き込み前に `nextSessionId`/`nextEventId`/`nextPlanId` を呼んで id を付けること**。
   付け忘れると全行が `id=undefined` になり（`"undefined"` は真値なのでパーサの必須キー検査を
   通過してしまう）、編集・削除が特定できず、`nextSessionId` は `s-` 形式でない id を無視して
   `s-1` から再採番するため新規記録と衝突する。
2. **実行前に vault をバックアップする。** 手順に `cp -a` でタイムスタンプ付きディレクトリへ
   退避するコマンドを含める（移行先は Google ドライブ同期の正本であり、手で戻すのは非現実的）。
3. **`--dry-run` を用意する。** 書き込まずに件数と警告だけ出す。目視確認はこれで行う。
4. **冪等にする。** 3つのライタはすべて追記なので、二重実行は全件重複を生む。
   移行行の frontmatter または行に `source=migration` を付け、既に移行済みの対象はスキップする。
   加えて、移行先が既に存在する場合は `--force` を明示しない限り中断する。
5. **中断復帰できるようにする。** テーブル単位で「どこまで書いたか」を標準出力に出し、
   `--from-table plan_blocks` のように途中から再開できるようにする。
6. **ページングする。** `analysis/helpers/lib.mjs` の `restClient().select()` は素の GET で、
   `Range` も `limit` も付けない。PostgREST の既定 max-rows（Supabase では通常1000）で
   **エラーも警告もなく静かに切られる**。`limit`/`offset` でページングし、
   取得件数を Supabase 側の件数と突き合わせ、**不一致なら中断する**。
