# study-ai — AI活用 学習管理システム 設計ドキュメント

作成日: 2026-07-15
このドキュメントは、実装を担当するAI/開発者が追加の質問なしで開発を始められることを目的とした、要件と設計の完全な仕様書である。

---

## 1. 背景とゴール

### ユーザー
- 高校3年生の受験生(本人専用・シングルユーザー)
- 併願受験: 共通テスト + 二次試験(一般) + 推薦等を並行
- 共通テスト科目: 英語R / 英語L / 国語(現代文・古文・漢文) / 数学IA / 数学2BC / 化学基礎 / 地学基礎 / 地理 / 政治経済 / 情報
- 二次試験科目: 英語・国語・数学。小論文形式の「総合問題」も受験する可能性あり

### 解決したい課題
1. **勉強記録**を最小の手間で続けたい(文字入力は嫌。ボタンぽちぽち+写真が理想)
2. **弱点把握**: どの単元が弱いかをAIが分析してほしい
3. **弱点克服**: 忘却も考慮した具体的な復習提案がほしい
4. **スケジュール集約**: 学校の課題・出願書類・模試などの締切を1か所で管理したい

### 重要な制約
- **AIはClaudeサブスクリプション(Claude Code)のみ。API従量課金は使わない**
  - → Webアプリ内でリアルタイムにLLMを呼ぶことはできない
  - → 代わりに、ユーザーのMac上のClaude Codeが夜間バッチとしてデータを分析し、結果をDBに書き戻す
- ホスティングは無料枠のみ(Vercel + Supabase free tier)
- スマホ(iPhone想定)から日常利用する。PWAとしてホーム画面に追加して使う

---

## 2. アーキテクチャ

```
[スマホ/PC ブラウザ(PWA)]
   │ 記録・写真アップ・閲覧          ← Web Push通知
   ▼
[Next.js on Vercel] ◄──► [Supabase: Postgres + Storage + Auth]
   │
   └ Vercel Cron(毎朝1回) → 締切リマインド+当日の復習提案をPush送信

[Mac上の Claude Code(夜間バッチ、スケジュール実行+手動コマンド)]
   Supabaseへ service role キーで直接アクセスし:
   写真読み取り(正誤抽出/小論文講評) → 弱点スコア再計算
   → 復習提案生成 → 日次レポート作成
```

- Webアプリ自体にはAI機能を組み込まない。AI処理はすべて夜間バッチ側。
- service role キーはMacローカルの `.env` のみに保存。Vercel側には置かない。

## 3. 技術スタック

| 層 | 技術 |
|---|---|
| フロント/サーバ | Next.js 15 (App Router, TypeScript) |
| UI | Material UI (MUI)。**ライトテーマ固定・ミニマル基調**(白背景、余白多め、装飾控えめ)。モバイルファースト、下部タブナビゲーション |
| DB/認証/画像 | Supabase (Postgres, Auth, Storage バケット `photos`)。RLSで本人のみアクセス可 |
| PWA | manifest + service worker + Web Push (VAPID, `web-push` ライブラリ) |
| 通知送信 | Vercel Cron (無料枠: 毎朝1回) |
| 夜間分析 | Claude Code ヘッドレス実行(`claude -p`)。プロンプトは `analysis/` ディレクトリに配置 |

注意: 実装開始前に context7 等で MUI + Next.js App Router 統合、Supabase JS、web-push の最新ドキュメントを取得すること。

### 認証
- Supabase Auth のメール1アカウントのみ。サインアップ画面は不要(Supabaseダッシュボードでユーザー作成)。
- 全テーブルにRLS: 認証済みユーザーのみ読み書き可。

---

## 4. データモデル(Supabase / Postgres)

SQLは `supabase/schema.sql`、初期データは `supabase/seed.sql` として保存する。

| テーブル | 主なカラム | 備考 |
|---|---|---|
| `subjects` | id, name, color, sort_order | 科目マスタ。seed: 英R/英L/現代文/古文/漢文/数IA/数2BC/化学基礎/地学基礎/地理/政経/情報/小論文 |
| `units` | id, subject_id, name, sort_order | 単元マスタ。**英数国は単元レベルで詳細**(例: 数IA→数と式/二次関数/図形と計量/場合の数/確率/整数/図形の性質…)、**理社情報は大分類5〜8区分**。seedで投入 |
| `materials` | id, subject_id, name, kind(問題集/参考書/過去問) | 教材マスタ。設定画面で追加 |
| `study_sessions` | id, subject_id, unit_id?, material_id?, minutes, started_at, memo? | 勉強記録。memoは任意 |
| `photos` | id, session_id?, storage_path, kind(exercise/essay), status(pending/analyzed/failed), analyzed_at, result_json | 演習写真 or 小論文答案 |
| `question_results` | id, photo_id, unit_id, question_label, is_correct, error_type?(calc/knowledge/reading/logic/other) | 写真から夜間バッチが抽出 |
| `essay_reviews` | id, photo_id, structure_comment, logic_comment, vocab_comment, overall | 小論文の観点別講評 |
| `weakness_scores` | id, unit_id, score, accuracy, last_studied_at, computed_at | 夜間バッチが再計算(全置換でよい) |
| `review_tasks` | id, unit_id, material_id?, range_text, reason, due_date, done | AI復習提案。「青チャート 例題40〜43」レベルまで具体化 |
| `events` | id, kind(assignment/application/mock_exam/exam/other), title, due_date, done | スケジュール |
| `reports` | id, kind(daily/weekly), body_md, created_at | 分析レポート(Markdown) |
| `push_subscriptions` | id, endpoint, keys_json | Web Push購読 |

### 弱点スコアの算出(夜間バッチ)
単元ごとに `score = (1 - 直近の正答率) × 忘却重み` を基本とする。
- 正答率: `question_results` の直近N件(例: 直近30件または30日)
- 忘却重み: 最終学習日からの経過日数に応じて増加(例: `1 + log(1 + 経過日数)/2`)。厳密なSM-2は不要、上記近似で十分
- スコア降順 = 優先的に復習すべき単元

---

## 5. 画面仕様(モバイルファースト・下タブ5つ)

デザイン方針: ミニマル。白背景・情報優先・装飾は締切の警告色程度。**文字入力を極力させない**(ボタン・チップ・ピッカー中心)。

### 5.1 今日(ホーム)
- 共通テストまでの日数(固定表示)
- 直近の締切カウントダウン(7日以内は警告色)
- 今日の `review_tasks` リスト(チェックで完了)
- 最新の日次レポートへのリンク
- 「記録を始める」ボタン

### 5.2 記録
- 科目ボタングリッド → 単元チップ(任意) → 教材チップ(任意) → 時間(15/30/45/60分ボタン+タイマー機能)
- 保存は2タップ以内を目標
- 写真アップロード: 複数枚可。種別を「演習(丸付け済み)」/「小論文答案」ボタンで選択。アップ後 `status=pending`
- 写真の運用ルール(アプリ内にも小さく表示): **丸付け済み(○✕記入済み)の問題集ページを撮影する**。AIは○✕・問題番号・単元を読み取る

### 5.3 分析
- 科目×単元の弱点ヒートマップ(weakness_scores を色の濃さで)
- 勉強時間の推移(週/科目別の棒グラフ)
- 最新レポート(daily/weekly)と小論文講評の一覧表示

### 5.4 予定
- 締切リスト(昇順、種別バッジ: 課題/出願/模試/試験)+月カレンダー表示
- 追加UI: 種別ボタン+タイトル(ここだけ短文入力可)+日付ピッカー

### 5.5 設定
- 科目・単元・教材の追加/編集
- 通知のON/OFF(Push購読)

---

## 6. 夜間分析(Claude Code バッチ)

`analysis/nightly.md` にプロンプトを置き、Claude Codeのスケジュールタスクで毎晩実行+手動実行も可能にする。Macは電源接続+スリープ解除(`caffeinate` または `pmset` 設定)が前提。ユーザーへのセットアップ案内をREADMEに記載すること。

処理フロー:
1. `photos` から `status=pending` を取得、Storageから画像をダウンロードして読む
   - `kind=exercise`: 問題ごとの ○✕・問題番号・単元・誤答タイプを推定し `question_results` に挿入。判読不能なら `status=failed` にして日次レポートで報告
   - `kind=essay`: 構成/論理/語彙の観点別講評+総評を `essay_reviews` に挿入
2. `weakness_scores` を再計算(セクション4の式)
3. 翌日の `review_tasks` を3〜5件生成
   - 選定基準: 弱点スコア上位+最終学習から日が空いた単元
   - 各タスクに: 単元、紐づく教材と具体範囲(`range_text`)、理由(`reason`、例:「正答率52%、5日未学習」)
4. 日次レポート(勉強時間、正答状況、明日の提案の要約)を `reports` に保存。週1回(日曜夜)は週次総括も生成
5. Supabaseへの接続は `analysis/.env` の `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

---

## 7. 通知(Web Push)

- VAPID鍵を生成し、Vercel環境変数に設定
- 設定画面で購読 → `push_subscriptions` に保存
- Vercel Cron(毎朝 6:30 JST 等)が API Route を叩き、以下を送信:
  - 7日以内の締切リマインド
  - 当日の復習提案の件数と先頭項目
- iPhoneはPWAをホーム画面に追加した場合のみPush可能(READMEに記載)

---

## 8. 実装ステップ(推奨順)

1. Supabaseプロジェクト作成、`supabase/schema.sql` + `seed.sql`(科目・単元マスタ)投入
2. Next.js + MUI 初期化、Supabase Auth、下タブレイアウト
3. **記録画面**(最優先: ぽちぽち入力+写真アップ)
4. 予定画面(events CRUD)
5. 今日/分析画面(review_tasks / weakness_scores / reports / essay_reviews 表示)
6. 夜間分析プロンプト+実行スクリプト。ダミーデータ+実写真1枚で「写真→正誤→スコア→提案→レポート」の一巡を手動検証 → スケジュール化
7. PWA + Web Push + Vercel Cron
8. Vercelデプロイ、スマホ実機確認(ホーム画面追加→通知許可→記録→翌朝提案)

※ Supabase/Vercelのアカウント作成・キー取得はユーザー本人の操作が必要。手順を都度案内すること。

## 9. 受け入れ基準(検証)

- [ ] スマホ幅で全画面が操作可能、記録が2〜3タップで完了する
- [ ] 丸付け済みページの写真1枚から `question_results` が正しく生成される
- [ ] 小論文答案の写真から観点別講評が生成される
- [ ] 夜間バッチ後、翌朝「今日」画面に教材範囲つきの復習提案が3〜5件表示される
- [ ] 締切7日前からホームとPush通知でリマインドされる
- [ ] Vercel/Supabase無料枠内で動作(API課金ゼロ)

## 10. スコープ外(v2以降)

- ダークモード、複数ユーザー対応
- 模試成績表の取り込み(帳票OCR)
- Obsidian等外部ナレッジベース連携
