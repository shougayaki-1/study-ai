# Vault Phase 2 (一部): 対話ベースの勉強記録・予定管理 設計仕様

- 日付: 2026-07-25
- ステータス: 設計承認済み（実装計画未）
- 関連: [`docs/superpowers/specs/2026-07-24-vault-file-cli-architecture-design.md`](./2026-07-24-vault-file-cli-architecture-design.md)（Vault Phase 1、親設計）、
  [`docs/superpowers/specs/2026-07-24-vault-conventions-contract.md`](./2026-07-24-vault-conventions-contract.md)（vault規約。本設計はこの規約のパターンを踏襲する）

## 背景と目的

Vault Phase 1で「AIが読む情報の重心をSupabaseからvault(ファイル)へ移す」流れを作った。
本設計はその延長として、**「PDF(写真)だけでは表せない情報」を、Claude Code / Codexとの
対話(できる限り選択式)で聞き取り、勉強記録・予定管理そのものの入力もWebフォームから
対話へ一本化する**。Webは記録・予定についても「表示専用ビューア」に完全に寄せる。

対象は既存の `study_sessions`(勉強記録)・`events`(予定)テーブルが担っていた機能。
`weakness_scores`・`mock_exams`等に依存する `/stats` の詳細分析は対象外(スコープ外)。

## 方針の要点（確定事項）

1. **入力は対話のみ**: 勉強記録・予定の入力は、Claude Code/CodexとのCLIセッションでの
   対話に一本化する。既存の `/record`(入力フォーム)は削除する。
2. **CLI非依存**: 対話手順は `docs/study-dialogue.md` に1本化し、Claude Code専用ツール
   (`AskUserQuestion`等)に依存しない「番号選択+自由入力可」のプレーンテキスト形式で書く。
   `CLAUDE.md`と`AGENTS.md`の両方からこの手順書を参照する(nightly.mdと同じ考え方)。
3. **vaultへの書き込みはBash経由の共通スクリプト**で行い、Claude Code・Codexどちらの
   セッションでも同じ結果になるようにする。
4. **Webは表示専用に**: `/records`(履歴)・`/schedule`(予定)をvault読みのビューアに
   書き換える。予定の完了操作だけはWebのタップでも可能にする(server action)。
5. **プッシュ通知は今回廃止**: Vercelのcron(`api/cron/morning`・`evening`)と、それに
   付随する購読UI・Service Workerのpush処理を削除する。オフラインキャッシュ機能(PWA)は
   push通知と無関係なので残す。
6. **過去データは移行する**: 既存Supabaseの`study_sessions`を日付ごとに
   `vault/records/YYYY-MM-DD.md`へ、`events`を`vault/schedule.md`へ、それぞれ
   1回限りのエクスポートスクリプトで移行し、新しいビューアでも過去分が見えるようにする。

## データモデル

### `vault/records/YYYY-MM-DD.md`（当日の勉強セッション、1日1ファイル・追記更新）

```md
---
type: study-record
date: 2026-07-25
source: dialogue
schema_version: 1
updated: 2026-07-25T22:10:00+09:00
---

## セッション
- subject=英語R | minutes=60 | understanding=understood | memo=長文2題
- subject=数学IA | minutes=90 | understanding=uncertain | memo=
```

- `subject`・`minutes`・`understanding`(`understood`/`uncertain`/`not_understood`)は既存
  `study_sessions`テーブルのカラムを踏襲。`unit`/`material`の細かい紐付けは今回スコープ外
  (YAGNI。必要になれば別途追加できるよう行フォーマットは`key=value | key=value`形式で拡張余地を残す)。
- `memo`は空でもよい(値なし)。
- 同日に複数回対話しても、同じファイルの`## セッション`に行を追記する
  (Foundation計画で作った`append-vault-section`ヘルパのパターンを踏襲)。

### `vault/schedule.md`（予定の単一ファイル、都度書き換え）

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

- `kind`(`assignment`/`application`/`mock_exam`/`exam`/`other`)・`title`・`due`(=`due_date`)・
  完了状態(`[ ]`/`[x]`)は既存`events`テーブルを踏襲。
- `id`はファイル内で一意(`ev-N`)。Webのタップ完了操作はこの`id`を指定して該当行の
  `[ ]`↔`[x]`を書き換える。
- 追加・編集(タイトル変更等)は対話のみ。完了/未完了の切り替えだけWebのタップでも可能。

## 対話フロー（`docs/study-dialogue.md`）

CLIツール名に依存しない、プレーンテキストの番号選択形式で記述する。

**記録フロー**（「今日の記録つけて」等の発話で開始）
1. 「今日勉強した科目は？(番号をスペース区切りで、複数可)」→ 既存13科目を番号付きで提示
2. 選ばれた科目ごとに: 分数(選択肢: 30/60/90/120分/その他)→理解度(理解した/曖昧/理解できてない)
   →ひとことメモ(任意、スキップ可)
3. 内容を要約提示→確認→`vault/records/YYYY-MM-DD.md`に追記(既存ファイルがあれば追記、
   なければ新規作成)

**予定フロー**（「予定に追加して」「予定確認して」等の発話で開始）
- 追加: 種別(課題/出願/模試/本番/その他)→タイトル→締切日 を聞いて`vault/schedule.md`に追記
- 確認/変更: 現在の予定一覧を提示→どれを完了/変更するか選んでもらう

**vault書き込み時の環境変数**: 対話を担当するエージェントは、書き込み前に
`analysis/.env`から`STUDY_AI_VAULT_DIR`を読み込んで(または既に環境変数にあればそれを使い)
`analysis/helpers/vault/index.mjs`系のヘルパ経由でファイルを書く。未設定ならエラーを
提示し、書き込みを行わない(黙って別の場所に書かない)。

## Web側の変更

### 新設・書き換え
- **`/records`(履歴、既存パスを書き換え)**: `vault/records/*.md`を日付降順で一覧し、
  各日の科目別合計時間を表示する Server Component。`/reports`一覧ページと同じパターン
  (`fs`読み・Server Component)。
- **`/schedule`(予定、既存パスを書き換え)**: `vault/schedule.md`の予定一覧を表示し、
  各項目に完了チェックボックスを付ける。タップで Server Action
  (`submitCorrection`と同じ書き方)が該当行を`[ ]`↔`[x]`に書き換え、`revalidatePath`する。

### 削除
- **`/record`(入力フォーム)**: ディレクトリごと削除。
- **BottomNavの「記録」タブ**: 削除。下部タブは 今日/履歴/分析/予定/設定 の5つになる
  (レポート/カルテは既存のドロワー項目のまま)。
- **push通知関連**: `src/app/api/cron/morning/`・`src/app/api/cron/evening/`ディレクトリ、
  `vercel.json`の`crons`設定、`src/app/settings/page.tsx`内の購読/解除UI、
  `public/sw.js`内の`push`・`notificationclick`イベントリスナーを削除する。
  **`public/sw.js`のオフラインキャッシュ(`install`/`activate`/`fetch`)と
  `ServiceWorkerRegister.tsx`はPWAオフライン対応のため残す**(push通知とは無関係)。

### 変更しない
- **`/stats`**: 今回は一切変更しない。既存Supabaseデータを見るだけの画面として
  現状維持する(将来の別スペックでvault移行を検討)。

## 過去データの移行（1回限りのスクリプト）

`analysis/helpers/`に一度だけ実行する移行スクリプトを追加する(夜間バッチの定常フローには
組み込まない):
- `study_sessions`を`study_date`ごとにグルーピングし、`vault/records/YYYY-MM-DD.md`の
  `## セッション`セクションへ変換(既存フォーマットに合わせる)。
- `events`を`vault/schedule.md`の`## 予定`セクションへ変換(`done`→`[x]`/`[ ]`)。
- 実行は手動一回のみ。以降の新規書き込みは対話経由のみとし、Supabase側の
  `study_sessions`・`events`テーブルへの新規書き込みは行わない
  (テーブル自体は削除せず、過去データの参照用として残す)。

## エラーハンドリング

- vault書き込み失敗(`STUDY_AI_VAULT_DIR`未設定・ディスク書き込みエラー等)は対話中に
  エージェントがその場でユーザーに提示し、黙って記録を失わない。
- Webの完了タップ操作が失敗した場合(vaultファイル読み書きエラー)は既存の
  `submitCorrection`と同様、エラーをUIに表示するだけでアプリ全体はクラッシュさせない。
- 予定の`id`重複や壊れた行は、パーサがその行だけスキップし全体を落とさない
  (`parseConfirmTodos`の設計を踏襲)。

## テスト方針

- `src/lib/vault/study-record.ts`・`src/lib/vault/schedule.ts`: パース/整形の往復を
  vitestでユニットテスト(`confirm-todos.test.ts`と同じ形)。
- `src/app/schedule/_lib/actions.ts`(完了切り替えのServer Action相当): 実際のvault
  フィクスチャに対する読み書きをvitestで検証(`actions.test.ts`と同じ形)。
- `/records`・`/schedule`ページ本体はServer Componentのため単体テストなし。
  Playwright E2Eでの確認は実装計画側で「予定のタップ完了→schedule.mdが書き換わる」
  フローとして追加するかどうかを計画時に判断する。
- 過去データ移行スクリプトは、実データに対して1回動かして目視確認する
  (自動テスト対象外。決定的なフォーマット変換部分のみユニットテスト可)。
- `docs/study-dialogue.md`はプロンプト文書のため自動テスト対象外(nightly.mdと同様、
  手動確認)。

## スコープ外（YAGNI）

- `unit`/`material`の細かい紐付け(教材・単元単位の記録)は今回追加しない。
- `/stats`の詳細分析(弱点スコア・模試結果等)のvault移行は別スペック。
- プッシュ通知の代替手段(ローカルのMacから直接通知を送る等)は今回作らない
  (必要になったら別途検討)。
- Supabaseの`study_sessions`・`events`・`push_subscriptions`テーブル自体の削除
  (スキーマ変更)は行わない。参照されなくなるだけで、テーブルは残す。
- 専用スラッシュコマンド(例: `/記録`)は作らない。自然な会話から`docs/study-dialogue.md`
  の手順に入る運用とする。

## 未決事項（実装計画で詰める）

- `docs/study-dialogue.md`の具体的なプロンプト全文(章立てはここで決めたが、文面は計画時に確定)。
- 移行スクリプトの実行タイミング(実装完了後、切り替え直前に1回実行)。
- E2Eでどこまでカバーするか(予定タップ完了フローを追加するか否か)。
