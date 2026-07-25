# Vault Phase 2: 対話ベースの記録・予定・計画と「今日」再構築 設計仕様

- 日付: 2026-07-25
- ステータス: 設計承認済み（実装計画未）
- 関連: [`2026-07-24-vault-file-cli-architecture-design.md`](./2026-07-24-vault-file-cli-architecture-design.md)（Vault Phase 1、親設計）、
  [`2026-07-24-vault-conventions-contract.md`](./2026-07-24-vault-conventions-contract.md)（vault規約。frontmatter形式・TS/Node parityの考え方を踏襲）

## 背景と目的

Vault Phase 1で夜間分析バッチとレポート/カルテ閲覧をvault(ファイル)へ移した。本設計はその続きとして、
**Supabaseが担っていたWeb機能(勉強記録・予定・学習計画・トップページ)をvaultへ移し、入力を
Claude Code / Codexとの対話に一本化する**。Webは表示専用ビューア(＋予定の完了タップのみ)になる。

「PDF(写真)だけでは表せない情報」を対話で拾えるようにする、というユーザーの狙いをそのまま
日々の記録運用にも広げるもの。

## スコープ

本設計は3つのサブプロジェクト(A/B/C)を1つの設計として扱う。実装は依存順に進める。

| # | 対象 | 主な成果物 |
| --- | --- | --- |
| **共通土台** | vaultファイル規約とパーサ/ライタ、対話手順書の骨格 | `docs/study-dialogue.md`、TS/Nodeの両実装 |
| **A** | 勉強記録 | 記録の対話入力・編集・削除、`/records`ビューア、過去データ移行 |
| **B** | 予定と学習計画 | events/plan_blocksの対話入力、`/schedule`ビューア(完了タップ可)、移行 |
| **C** | 「今日」再構築と後片付け | `/`のvault化、push通知/cron削除、死んだ依存の整理 |

### スコープ外（YAGNI）
- `/stats` の詳細分析(弱点スコア・模試結果・question_results等)のvault移行。**別スペック**とする。
  本設計の実施後、`/stats` は移行日以前のSupabaseデータを見る凍結画面になる(後述の「既知の帰結」)。
- 勉強記録への`unit`(単元)・`material`(教材)の紐付け。既存DBには存在するが、対話の質問数を
  抑えるため今回は記録しない。行フォーマットは`key=value`の並びなので後から追加できる。
- **学習計画の繰り返しルール(`recurrence_rule`)**。既存`plan_blocks`にはあるが、ルール展開は
  それ自体が小さなサブシステムになる。対話では「同じ予定を複数日に入れる」形で代替し、
  各日に実体行を書く。
- `review_tasks`(復習提案)の再実装。Phase 1で夜間バッチをvault化した時点で生成元が無くなって
  おり、現在のトップページは空のリストを表示しているだけ。今回は依存を切り、復習提案は
  夜間バッチが書く`reports/daily`の「要確認TODO」とカルテに委ねる。
- Supabaseのテーブル削除(スキーマ変更)。参照されなくなるだけで、テーブルとデータは残す。
- プッシュ通知の代替(Macローカルからの通知等)。今回は通知機能自体を廃止する。
- 専用スラッシュコマンド。自然な会話から`docs/study-dialogue.md`の手順に入る運用とする。

## 全体アーキテクチャ

```
[あなた] --対話--> [Claude Code / Codex]  --Bash--> [Node writers (.mjs)]
                                                          |
                                                     writes v
                                              vault/ (Google Drive同期)
                                                     reads  ^
[ブラウザ] <--表示-- [Next.js Server Components] --TS readers--+
                              |
                        予定の完了タップのみ Server Action で書き込み
```

**重要な設計上の制約(Phase 1の教訓)**: 対話はCLI側(Node)から、閲覧はWeb側(TypeScript)から
同じファイルを読み書きする。したがって **記録・予定・計画の各フォーマットは、Node実装(.mjs)と
TS実装の間で完全に同一に解釈されなければならない**。Phase 1の`corrections`と同様、
両実装に同一フィクスチャのテストを課してparityを担保する。

- **Node側(`analysis/helpers/vault/`配下に追加)**: 記録/予定/計画の**ライタ**(対話が使う)
- **TS側(`src/lib/vault/`配下に追加)**: 同フォーマットの**リーダ**(Webが使う)＋予定完了の**ライタ**
- 既存の`vaultRoot`/`readVaultFile`/`writeVaultFile`/`parseFrontmatter`等はそのまま再利用する。

## データモデル

### `vault/records/YYYY-MM-DD.md` — 勉強記録（1日1ファイル・追記）

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

- `id`: ファイル内で一意(`s-N`)。対話での編集・削除時にこのidを指定する。
- `subject`: 科目名。既存seedの13科目: 英語R / 英語L / 現代文 / 古文 / 漢文 / 数学IA / 数学2BC /
  化学基礎 / 地学基礎 / 地理 / 政治経済 / 情報 / 小論文。
- `minutes`: 正の整数。
- `kind`: `material`(教材) | `common_test`(共通テスト演習) | `secondary`(二次・記述)。
  既存`study_sessions.record_type`に対応。
- `year`・`section`: `kind=common_test`のときのみ付く(既存`common_test_year`・`common_test_section`)。
- `understanding`: `understood` | `uncertain` | `not_understood`(既存と同じ)。
- `memo`: 空でもよい。**` | ` と `=` を含む値は書けない**(パーサを壊すため。対話側で全角に
  置換するか、その旨を伝えて言い直してもらう)。

### `vault/schedule.md` — 予定（締切等。単一ファイル・都度書き換え）

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

- `kind`: `assignment` | `application` | `mock_exam` | `exam` | `other`(既存`events.kind`と同じ)。
- 完了状態はチェックボックス(`[ ]`/`[x]`)で表す。**Webのタップ完了はこの記号だけを書き換える**。
- 追加・タイトル/締切の変更・削除は対話のみ。

### `vault/plans/YYYY-MM-DD.md` — 学習計画（1日1ファイル）

```md
---
type: study-plan
date: 2026-07-26
schema_version: 1
updated: 2026-07-25T22:10:00+09:00
---

## 計画
- id=p-1 | start=09:00 | end=10:30 | subject=英語R | status=planned | memo=長文演習
- id=p-2 | start=11:00 | end=12:00 | subject=数学IA | status=done | memo=
```

- `start`・`end`: `HH:MM`。`end > start` であること(既存の制約と同じ)。
- `status`: `planned` | `done` | `skipped`(既存`plan_blocks.status`と同じ)。
- 繰り返しは持たない(スコープ外)。複数日に同じ計画を入れたい場合は、対話が各日のファイルに
  実体行を書く。

## 対話フロー（`docs/study-dialogue.md`）

CLI非依存にするため、**番号選択＋自由入力可**のプレーンテキスト形式で記述する
(Claude Codeの`AskUserQuestion`のような専用UIツールには依存しない。`analysis/nightly.md`と同じ方針)。
`CLAUDE.md` と `AGENTS.md` の双方からこの手順書を参照する一文を追記する。

### 共通の前提
- 書き込み前に`STUDY_AI_VAULT_DIR`を解決する(環境変数、なければ`analysis/.env`から読む)。
  未設定ならエラーを提示し、**書き込みを行わない**(黙って別の場所に書かない)。
- 書き込みは`analysis/helpers/`のスクリプトをシェル実行で呼ぶ(直接ファイルを書かない)。
- 最後に必ず「何を書いたか」を要約提示する。

### 記録フロー（「今日の記録つけて」等）
1. 科目を聞く: 13科目を番号付きで提示し、スペース区切りで複数選択可。
2. 科目ごとに:
   - 種別: `1) 教材 2) 共通テスト演習 3) 二次・記述`
   - `2)`のときのみ: 年度(例 2025)と大問(例 第3問)を聞く
   - 時間: `1) 30分 2) 60分 3) 90分 4) 120分 5) その他(分数を入力)`
   - 理解度: `1) 理解した 2) 曖昧 3) 理解できてない`
   - メモ: 任意(スキップ可)
3. 要約提示→確認→`vault/records/YYYY-MM-DD.md`に追記(既存ファイルがあれば`## セッション`へ行追加)。

### 記録の編集・削除フロー（「さっきの記録直して」等）
1. 対象日の記録一覧をid付きで提示。
2. どのidを、どう直すか(または削除か)を選んでもらう。
3. 該当行を書き換え/削除して、結果を提示。

### 予定フロー（「予定に追加して」「予定確認して」等）
- 追加: 種別(`1) 課題 2) 出願 3) 模試 4) 本番 5) その他`)→タイトル→締切日→`vault/schedule.md`に追記。
- 一覧/変更/削除: 現在の予定をid付きで提示し、対象を選んでもらう。

### 学習計画フロー（「明日の計画立てて」等）
- 対象日を確認(既定は翌日)→ブロックごとに 開始/終了時刻・科目・メモ を聞く→
  `vault/plans/YYYY-MM-DD.md`に書く。
- 実行状況の更新: 対象日の計画をid付きで提示し、`done`/`skipped`を選んでもらう。

## Web側の変更

すべてServer Componentで`vault/`を`fs`読みする(Phase 1の`/reports`と同じパターン)。

### 書き換え
- **`/records`(履歴)**: `vault/records/*.md`を日付降順に一覧。各日の科目別合計時間と、
  セッション明細(種別・理解度・メモ)を表示。**編集・削除UIは持たない**(対話で行う)。
- **`/schedule`(予定)**: `vault/schedule.md`の予定一覧＋`vault/plans/`の当日以降の計画を表示。
  予定の完了チェックボックスのみタップ可(Server Actionが該当行の`[ ]`↔`[x]`を書き換え、
  `revalidatePath`する)。計画の追加・編集・削除UIは持たない(対話で行う)。
- **`/`(今日)**: vaultベースに作り直す。表示するもの:
  (1) `vault/plans/<today>.md`の当日の計画、(2) `vault/schedule.md`の締切が近い未完了予定、
  (3) 最新の`reports/daily`へのリンク。`review_tasks`への依存を削除する。

### 削除
- **`/record`(入力フォーム)**: ディレクトリごと削除。
- **BottomNavの「記録」タブ**: 削除。下部タブは 今日/履歴/分析/予定/設定 の5つになる
  (レポート/カルテは既存のドロワー項目のまま)。
- **push通知一式**: `src/app/api/cron/morning/`・`src/app/api/cron/evening/`、
  `vercel.json`の`crons`、`src/app/settings/page.tsx`の購読/解除UI、
  `public/sw.js`の`push`・`notificationclick`リスナー。
  **`public/sw.js`のオフラインキャッシュ(`install`/`activate`/`fetch`)と
  `ServiceWorkerRegister.tsx`は残す**(PWAオフライン対応でpush通知とは無関係)。

### 変更しない
- **`/stats`**: 一切変更しない(スコープ外)。
- **`/columns`・`/reports`・`/karte`・`/login`・認証(middleware)**: 変更しない。
  ローカル運用でもログインは現状のまま維持する(Supabase Authはそのまま使う)。

## 過去データの移行（1回限り）

`analysis/helpers/`に移行スクリプトを追加する(夜間バッチの定常フローには組み込まない)。
Supabaseアクセスには既存の`analysis/helpers/lib.mjs`(REST クライアント。Phase 1の
ヘルパ整理でも残してある)を使う。

- `study_sessions` × `subjects` を結合し、`study_date`ごとに`vault/records/YYYY-MM-DD.md`へ。
  `record_type`→`kind`、`common_test_year`→`year`、`common_test_section`→`section`に写す。
  `unit_id`・`material_id`は本設計では持たないので、**失われる情報がある旨を実行時に警告表示する**。
- `events` → `vault/schedule.md`(`done`→`[x]`/`[ ]`)。
- `plan_blocks` → `plan_date`ごとに`vault/plans/YYYY-MM-DD.md`へ。`recurrence_rule`を持つ行は
  展開せずその日の実体としてのみ書き、**繰り返し設定が失われる旨を警告表示する**。
- 実行は手動1回のみ。以降Supabaseの該当テーブルへの新規書き込みは行わない。

## エラーハンドリング

- **vault書き込み失敗**(`STUDY_AI_VAULT_DIR`未設定、ディスクエラー等): 対話中にその場で提示し、
  記録を黙って失わない。部分的に書けた場合は、どこまで書けたかを明示する。
- **壊れた行・重複id**: パーサは該当行だけスキップして全体を落とさない(`parseConfirmTodos`と同じ方針)。
  スキップした行はWeb表示時に「読めなかった行がある」旨を控えめに出す。
- **Webの完了タップ失敗**: 既存`submitCorrection`と同様、UIにエラーを出すだけでアプリは落とさない。
- **区切り文字の混入**: `memo`・`title`に` | `や`=`が入るとパーサを壊すため、対話側で全角に置換するか
  言い直してもらう。Webのリーダ側は壊れた行をスキップする(上記)。

## テスト方針

- **TS/Node parity**: 記録・予定・計画の各フォーマットについて、**同一フィクスチャ文字列**を
  TS側テスト(vitest)とNode側テスト(`node --test`)の双方に置き、同じ構造に解釈されることを検証する
  (Phase 1のfrontmatter/correctionsと同じやり方)。
- **TS側**: `src/lib/vault/`に追加するリーダ(記録/予定/計画)と予定完了ライタを vitest で
  ユニットテスト。実際のvaultフィクスチャディレクトリを使う。
- **Node側**: 対話が呼ぶライタを`node --test`でユニットテスト(追記が既存行を壊さないこと、
  id採番、編集・削除が対象行のみに効くこと)。
- **既存E2Eの改廃(重要)**: `e2e/core-flows.spec.ts`(`/record`で保存→`/records`確認)と
  `e2e/extended-flows.spec.ts`(履歴の編集・削除、`/schedule`操作)は、削除するUIをテストして
  いるため**書き換えが必須**。新しい内容は「vaultフィクスチャを置いた状態で`/records`・
  `/schedule`・`/`が正しく表示され、予定の完了タップが`schedule.md`を書き換える」ことの検証に
  差し替える(Phase 1の`e2e/vault-reports.spec.ts`と同じ作り)。
- **移行スクリプト**: 決定的な変換部分(行フォーマット生成)のみユニットテスト。実データに対する
  実行は手動1回で目視確認。
- **`docs/study-dialogue.md`**: プロンプト文書のため自動テスト対象外(`nightly.md`と同様、手動確認)。

## 既知の帰結（受け入れる副作用）

- **`/stats`の分析は移行日以降更新されない**。新規記録はvaultにしか入らないため、`/stats`は
  過去データの凍結ビューになる。分析の主役は夜間バッチが書く`reports/daily`・`weekly`・
  弱点カルテに移る。`/stats`のvault移行は別スペック。
- **勉強記録の単元/教材単位の粒度が失われる**(新規記録分)。過去データも移行時に該当情報が落ちる。
- **学習計画の繰り返し設定が使えなくなる**。複数日への展開は対話で行う。
- **プッシュ通知が無くなる**。締切のリマインドは自分で`/`や`/schedule`を見る運用になる。

## 未決事項（実装計画で詰める）

- `docs/study-dialogue.md`の具体的な文面(章立て・質問順はここで確定済み、文言は計画時に確定)。
- 移行スクリプトの実行タイミング(実装完了後、対話運用へ切り替える直前に1回)。
- `/`(今日)で「締切が近い」と見なす日数(既存は7日以内。踏襲するかを計画時に確定)。
