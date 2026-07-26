# Phase 3: vault のクラウド読み取りミラー 設計仕様

- 日付: 2026-07-26
- ステータス: 設計承認済み（実装計画未）
- 関連:
  [`2026-07-24-vault-file-cli-architecture-design.md`](./2026-07-24-vault-file-cli-architecture-design.md)（Phase 1）、
  [`2026-07-25-vault-dialogue-records-schedule-design.md`](./2026-07-25-vault-dialogue-records-schedule-design.md)（Phase 2）、
  [`2026-07-24-vault-conventions-contract.md`](./2026-07-24-vault-conventions-contract.md)・
  [`2026-07-25-phase2-conventions-contract.md`](./2026-07-25-phase2-conventions-contract.md)（vault規約）

## 背景と目的

Phase 1・2 で、データの正本を Google ドライブ同期の `vault/`（Markdown）へ移し、Web は
その `vault/` を `fs` で直接読むビューアになった。結果として **Web は Mac 上でしか動かない**。

利用者（受験生本人）は外出先のスマホから、レポート・弱点カルテ・勉強記録を
**あの Web 画面のまま**見たい。Google ドライブアプリで生 Markdown を読むことはできるが、
科目別集計や整形表示は得られない。

本設計は、**vault を正本のまま維持しつつ、Supabase に読み取り専用のミラーを置き、
Vercel 上の Web からそれを読む**ことで、Mac の起動状態に依存せず閲覧できるようにする。

### なぜ安く実現できるか（設計上の根拠）

Phase 2 で作った `parseStudySessions` / `parseScheduleEvents` / `parsePlanBlocks` は
**Markdown 本文の文字列を受け取る純粋関数**であり、ファイルの取得手段に依存しない。
したがって差し替えるのは **「ファイルを取ってくる層」だけ**で、パーサ・ページ UI は変更不要。

## 方針の要点（確定事項）

1. **vault が唯一の正本**。Supabase は一方向にコピーされた読み取り専用ミラー。書き込み経路は増やさない。
2. **ミラー範囲は vault 内の `.md` ファイル全部**（レポート・弱点カルテ・記録・予定・計画・index 等）。
   画像（`_archive/` の問題ページ写真）は**ミラーしない**（現在の Web は画像を表示しないため）。
3. **同期は夜間バッチの最後に自動実行**（`analysis/nightly.md` の最終ステップ）。
4. **クラウド版 Web は読み取り専用**。`/schedule` の完了タップはクラウドでは提供しない
   （書き戻しの双方向同期を作らないための判断）。
5. **`service_role` キーは Vercel に置かない**（Phase 1 からの原則）。Vercel 側は `anon` キー + RLS のみ。
6. ローカル `npm run dev` は**今まで通り `fs` 読み**。開発体験と Mac 上の運用は変えない。

## アーキテクチャ

```
[対話 on Mac] ──→ vault/ (Google ドライブ同期) ←── 夜間バッチ(analysis/)
                       │
                       │ 夜間バッチの最後に一方向アップロード(.md のみ、変更分だけ)
                       ▼
                 Supabase: vault_files テーブル (RLS: 認証済みのみ select)
                       │
                       │ 読むだけ
                       ▼
              Vercel 上の Web ←── スマホ(Supabase Auth でログイン必須)
```

## データモデル

### Supabase テーブル `vault_files`

| カラム | 型 | 説明 |
| --- | --- | --- |
| `path` | `text` primary key | vault ルートからの相対パス（例 `records/2026-07-25.md`） |
| `content` | `text` not null | Markdown 全文（frontmatter を含む生の内容） |
| `updated_at` | `timestamptz` not null default `now()` | ミラー更新時刻 |

- **`content` は加工せず生のまま入れる**。Web 側は既存の `parseFrontmatter` でそのまま解釈できる。
- **RLS**: `select` は認証済みユーザーのみ許可。`insert`/`update`/`delete` はポリシーを作らず、
  `service_role`（Mac の同期スクリプト）だけが RLS をバイパスして書ける状態にする。
- マイグレーションは `supabase/migrations/` に追加する（`supabase/schema.sql` は直接編集しない）。

## 同期スクリプト

`analysis/helpers/sync-vault-to-supabase.mjs` を新設する。

- vault 配下を再帰的に走査し、**`.md` ファイルのみ**を対象にする。
  隠しファイル・`.tmp` 等の同期一時ファイルは除外する（Phase 2 の `list-inbox-items.mjs` と同じ流儀）。
- 各ファイルについて、ミラー側の `content` と**内容が異なるものだけ** `upsert` する（無駄な書き込みを避ける）。
- **vault から消えたファイルはミラーからも削除する**（ミラーが正本に追随するため）。
- `--dry-run` を用意し、書き込まずに「追加 / 更新 / 削除の件数と対象パス」を出す。
- 認証は既存の `analysis/helpers/lib.mjs`（`loadEnv` / `restClient`）を使う。追加 npm パッケージは使わない。
- 冪等（同じ内容で再実行しても差分ゼロ）。

## Web 側の変更

### ファイルアクセス層の切り替え

現在 `src/lib/vault/` には、`fs` を直接使う関数がある:
- `readVaultFile(relPath)`（`read.ts`）
- `listStudyRecordDates()`（`study-sessions.ts`）
- `listReports(kind)`（`reports.ts`）
- `listKarteSubjects()`（`src/app/karte/_lib/list-subjects.ts`）

これらを **fs 版 / Supabase 版の2実装**に分け、環境変数で切り替える。

- 切り替えは環境変数 **`STUDY_AI_VAULT_SOURCE`**（`fs` | `supabase`、未設定時は `fs`）で行う。
  - ローカル開発・Mac 上の運用: `fs`（既定）
  - Vercel デプロイ: `supabase`
- **パーサ（`parseStudySessions` 等）とページ UI は変更しない。**
- Supabase 版は `vault_files` から `path` で 1 行取得し、`content` を既存の `parseFrontmatter` に渡す。
  一覧系（`listStudyRecordDates` / `listReports` / `listKarteSubjects`）は `path` の前方一致で引く。

### 読み取り専用モード

- クラウド版（`STUDY_AI_VAULT_SOURCE=supabase`）では、`/schedule` の**完了チェックボックスを表示しない**。
  Server Action `toggleScheduleEventDone`（`src/app/schedule/_lib/actions.ts`、Phase 2 で追加）は
  ローカル時のみ有効にする。
- 表示上、クラウド版では「閲覧専用（変更は Mac 側の対話から）」と分かる控えめな注記を出す。

## デプロイ

- Phase 2 で `{}` にした `vercel.json` を、デプロイ可能な状態に戻す（**cron は追加しない**）。
- Vercel の環境変数:
  - `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`（既存の Web と同じもの）
  - `STUDY_AI_VAULT_SOURCE=supabase`
  - **`SUPABASE_SERVICE_ROLE_KEY` は設定しない**
- 認証は既存の Supabase Auth + `src/middleware.ts` をそのまま使う（他人には見えない）。

## エラーハンドリング

- **同期スクリプトの失敗は夜間バッチ全体を落とさない**。分析結果（vault への書き込み）は既に
  完了しているため、同期失敗はレポートに警告として残し、次回の実行で追いつかせる。
- **ミラーにファイルが無い場合**、Web はローカルと同じ「存在しない」扱いにする
  （`/records` の一覧は空、詳細ページは Next の既定エラー）。同期前の日付を開くと起こりうる。
- Supabase への接続失敗時は、その画面にエラーを出すだけでアプリ全体は落とさない。

## テスト方針

- **同期スクリプト**: 追加 / 更新（内容変化）/ 変更なし（スキップ）/ 削除 の判定ロジックを
  `node --test` でユニットテストする。Supabase アクセスは注入したフェイククライアントで差し替える
  （Phase 2 の `migrate-supabase-to-vault.mjs` と同じ方式）。
- **Web のファイルアクセス層**: Supabase 版のリーダを vitest でテストする（フェイクの取得結果を渡し、
  fs 版と同じ構造を返すことを確認）。fs 版と Supabase 版が**同じ入力に対し同じ結果**を返すことを検証する。
- **既存テストを壊さない**: 切り替えの既定値は `fs` なので、Phase 1・2 のテストは無変更で通ること。

## スコープ外（YAGNI）

- 画像（`_archive/`）のミラーと表示。Google ドライブアプリで見る。
- クラウドからの書き込み・双方向同期。クラウドは常に読み取り専用。
- リアルタイム同期。夜間バッチのタイミングで十分。
- `/stats`（Phase 2 で凍結済み）の扱い変更。

## 未決事項（実装計画で詰める）

- `listReports` / `listKarteSubjects` の Supabase 版で使うクエリの正確な形（`path` の前方一致条件）。
- クラウド版の「閲覧専用」注記を出す画面と文言。
- 同期スクリプトを `analysis/nightly.md` のどのステップ番号として差し込むか。
