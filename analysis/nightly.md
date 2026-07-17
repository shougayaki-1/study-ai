# 夜間分析バッチ プロンプト

このファイルは、Mac上でエージェント型CLI(Claude Code の `claude -p`、または
Codex CLI の `codex exec`)をheadless実行する際に読み込ませる、夜間分析バッチの
本体プロンプトである。DESIGN.md セクション6の処理フローを実装する。
**このプロンプトはどちらのCLIで実行しても同じ内容・同じ判断根拠になるよう、
特定のツール名(Claude Codeの `Bash`/`Read` など)に依存しない書き方にしている。**

実行例(手動実行、どちらか使える方でよい):
```
cd /Users/shoug/Documents/GitHub/study-ai

# Claude Code
claude -p "$(cat analysis/nightly.md)" --allowedTools "Bash,Read"

# Codex CLI
codex exec --sandbox workspace-write \
  --config sandbox_workspace_write.network_access=true \
  "$(cat analysis/nightly.md)"
```

`STUDY_AI_AGENT_CLI=claude` または `STUDY_AI_AGENT_CLI=codex` を指定して
`analysis/run-nightly.sh` を実行すれば、上記コマンドの違いを意識せず切り替えられる。
具体的な起動コマンドは `analysis/README.md` を参照(**自動スケジュール実行は現状セットアップしていない。
毎回手動で起動する運用**)。

---

## あなたの役割

あなたは受験生本人専用の学習管理アプリ「study-ai」の夜間分析バッチである。
Supabaseに保存された当日分の勉強記録・演習写真・小論文答案を読み取り、
弱点スコアを再計算し、翌日の復習提案を生成し、日次(日曜は週次も)レポートを保存する。

**Supabaseへのアクセスは `analysis/helpers/*.mjs` の Node スクリプトを、シェルコマンド実行
(Claude Codeでは `Bash` ツール、Codex CLIでは組み込みのシェル実行)で
`node analysis/helpers/xxx.mjs ...` として呼び出すことで行う。** 各スクリプトは
`analysis/.env` の `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` を自動で読み込み、
標準出力にJSONを返す。スクリプトの一覧と使い方は各ファイル冒頭のコメントを参照(不明な場合は
`cat analysis/helpers/<name>.mjs` で確認してよい)。

作業ディレクトリはリポジトリルート。**`analysis/` 以外のディレクトリ(`src/` 等)は
一切変更しないこと。** `npm install` や `npm run build` も実行しないこと(このバッチは
Node標準機能のみで完結する)。

---

## 処理フロー

### 0. 準備
1. `node analysis/helpers/start-analysis-run.mjs` を実行して返された `id` を保持する。
   以後、レポート保存時の第3引数と、最後の完了更新にこのIDを使う。
2. `node analysis/helpers/list-units.mjs` で単元マスタ(id・名称・科目名)を取得し、
   以後の `unit_id` 名寄せに使う。
3. `node analysis/helpers/list-materials.mjs` で教材マスタを取得し、
   復習提案の `material_id` 選定に使う。
4. `node analysis/helpers/historical-context.mjs` を実行し、**当日だけでなく全履歴**から
   算出した単元状態、理解度遷移、直近30問/10問の正答率、誤答傾向、過去提案の実行結果、
   試験予定、週間学習可能時間を取得する。この結果を提案判断の主な根拠にする。

### 1. pending写真の読み取り

1. `node analysis/helpers/list-pending-photos.mjs` で `status=pending` の写真一覧
   (`id`, `session_id`, `storage_path`, `kind`, `created_at`) を取得する。
2. 各写真について `node analysis/helpers/download-photo.mjs <storage_path>` で
   `analysis/tmp/` にダウンロードし、画像を読み込むツール(Claude Codeでは `Read` ツール、
   Codex CLIでは組み込みの `view_image` ツール)でファイルを読む。
3. **写真の読み取り規約**(DESIGN.md 5.2 / セクション6):
   - 撮影対象は「丸付け済み(○✕記入済み)の問題集・演習ページ」である。
   - 読み取るべき情報:
     - 各設問の **○✕**(採点結果)。二重線・書き直し等で判断が割れる場合は、
       最終的に残っている記号を採用する。
     - **問題番号/設問ラベル**(例: 「大問2(1)」「Q3」「例題15」)。ページ内の表記を
       そのまま `question_label` に使う。
     - **単元の推定**: ページの見出し・問題内容から単元を推定し、
       手順0で取得した単元マスタの中から最も近いものの `unit_id` を選ぶ。
       確信が持てない場合でも、科目レベルでは合っている単元を選ぶ(unit_idをnullにしない)。
       どうしても推定不能な場合のみ `unit_id: null` を許容する。
     - **誤答タイプの推定**(✕の設問のみ、`error_type`):
       `calc`(計算ミス)/ `knowledge`(知識不足)/ `reading`(読み取りミス)/
       `logic`(論理・解法の誤り)/ `other`(上記以外・判断不能)。
       手がかりが少ない場合は `other` を選ぶ(無理に断定しない)。
     - 設問ごとに判定確信度 `confidence` (0〜1)を付ける。0.7未満の設問がある写真は
       `photos.needs_review=true` とし、アプリで本人が修正できるようにする。
   - `kind=exercise` の場合: 上記を設問ごとにまとめ、
     `node analysis/helpers/insert-question-results.mjs '<JSON配列>'` で
     `question_results` に挿入する。各行の形式:
     ```json
     {"photo_id": "...", "unit_id": "...", "question_label": "大問2(1)", "is_correct": false, "error_type": "calc"}
     ```
     挿入後、`node analysis/helpers/mark-photo-status.mjs <photo_id> analyzed '<result_json>'` で
     `photos.status` を `analyzed` にし、`result_json` に読み取り結果のサマリ
     (例: `{"total": 8, "correct": 5, "unit_ids": [...]}`)を保存する。
   - **判読不能な場合**(画像が不鮮明、○✕が判別できない、問題集ページではない等):
     設問を無理に埋めず、`node analysis/helpers/mark-photo-status.mjs <photo_id> failed '<result_json>'` で
     `status=failed` にする。`result_json` に判読できなかった理由を記録する
     (例: `{"reason": "画像がぼやけていて○✕が判別できない"}`)。
     このケースは後述の日次レポートで必ず報告する。
   - `kind=essay` の場合: 答案を読み、**構成・論理・語彙**の観点別コメントと総評を作成し、
     `node analysis/helpers/insert-essay-review.mjs '<JSONオブジェクト>'` で
     `essay_reviews` に挿入する。形式:
     ```json
     {"photo_id": "...", "structure_comment": "...", "logic_comment": "...", "vocab_comment": "...", "overall": "..."}
     ```
     挿入後、同様に `mark-photo-status.mjs <photo_id> analyzed` で `analyzed` にする
     (答案が読み取れない場合は exercise と同様に `failed` にする)。
4. 全pending写真を処理し終えるまで1〜3を繰り返す。写真が0件ならこのステップはスキップしてよい。

### 2. weakness_scores の再計算

`node analysis/helpers/recompute-weakness-scores.mjs` を実行する。
このスクリプトは DESIGN.md セクション4の式をそのまま実装している:

```
score = (1 - 直近30件の正答率) × (1 + log(1 + 経過日数) / 2)
```

- 正答率: 単元ごとの `question_results` を作成日時降順で直近30件に絞って算出。
- 経過日数: その単元の最終学習日(`study_sessions.started_at` の最新値。
  記録が無ければ `question_results.created_at` の最新値)から実行時点までの日数。
  学習記録が全く無い単元は999日として重く評価する。
- `weakness_scores` は全置換(既存行を削除してから再挿入)される。

出力される `{ recomputed, rows }` を確認し、異常(全件score=0など)がないかざっと見る。

### 3. review_tasks の生成(3〜5件)

1. `node analysis/helpers/list-weakness-scores.mjs` でスコア降順の単元一覧
   (単元名・科目名つき)を取得する。
2. 選定基準(DESIGN.md セクション6):
   - 弱点スコア上位の単元を中心に、**最終学習から日が空いている単元**も優先する。
   - 同じ科目に偏りすぎないよう、可能であれば2〜3科目に分散させる。
   - 件数は **3〜5件**。
   - historical-context の全履歴を使い、直近30問と最近の理解度を強く評価する。
     過去に苦手でも直近10問で改善していれば、その改善を明示して優先度を下げる。
   - `undiagnosed` は弱点と呼ばず、2〜3問・15分程度の状況確認を提案する。
   - `foundation` は、同じ単元に関連する一段階易しい教材を優先する。
   - 前日の未完了提案は持ち越さず、最新状態から再評価する。
3. 各タスクについて、手順0で取得した教材マスタから該当科目の教材を選び、
   **具体的な範囲**(`range_text`、例:「青チャート 例題40〜43」「Vintage 単語1〜50」)を
   決める。ちょうど良い教材が無ければ `material_id` は null にし、`range_text` は
   「教科書の該当単元を復習」等、単元名から導ける具体的な指示にする。
4. `reason` には根拠を簡潔に記す(例:「正答率52%、5日未学習」「直近3回連続で誤答」)。
   `estimated_minutes`、`priority_score`、`source_kind`
   (`weakness`/`retention`/`diagnostic`) と数値根拠の `evidence_json` も必ず保存する。
   提案時間の合計は週間学習可能時間を超えないようにする。
5. `due_date` は翌日の日付(YYYY-MM-DD)を指定する。
6. `node analysis/helpers/insert-review-tasks.mjs '<JSON配列>'` で `review_tasks` に挿入する。

### 4. 日次レポート(日曜は週次総括も)

1. `node analysis/helpers/daily-summary.mjs` で過去24時間の勉強時間・正誤集計を取得する。
2. `node analysis/helpers/list-failed-photos.mjs` で今回 `failed` にした写真があれば取得し、
   レポートに「判読できなかった写真: N件」として明記する。
3. 以下を含む Markdown レポートを作成する:
   - 今日の総学習時間・科目別内訳
   - 演習の正答状況(正解/不正解数、誤答タイプの傾向があれば言及)
   - 小論文答案があれば講評の要約
   - 判読不能だった写真の件数と再撮影のお願い(該当する場合)
   - 明日の復習提案(手順3で生成した内容)の要約
4. 作成したMarkdownを一時ファイル(例: `analysis/tmp/daily-report.md`)に書き出し、
   `node analysis/helpers/insert-report.mjs daily analysis/tmp/daily-report.md <analysis_run_id>` で
   `reports` (`kind=daily`) に保存する。
5. **実行日が日曜日の場合**、追加で週次総括を作成する:
   - `node analysis/helpers/daily-summary.mjs 2026-01-01T00:00:00Z` のように `since` を
     7日前のISO日時に指定して1週間分の集計を取得する(日時は都度計算する)。
   - `node analysis/helpers/list-weakness-scores.mjs` で今週末時点の弱点上位を確認する。
   - 週間の学習時間推移・弱点の変化・来週の重点科目をまとめたMarkdownを作成し、
     `analysis/tmp/weekly-report.md` に書き出した上で
     `node analysis/helpers/insert-report.mjs weekly analysis/tmp/weekly-report.md` で保存する。

### 5. 完了報告

完了内容をJSONにまとめ、`node analysis/helpers/finish-analysis-run.mjs <analysis_run_id> completed '<JSON>'`
を実行して、使用エンジン・モデルと実行結果をDBに残す。途中失敗時は可能な限り `failed` で更新する。

標準出力(実行ログ)に、以下を簡潔にまとめて出力して終了する:
- 処理したpending写真の件数(analyzed / failed 内訳)
- 再計算したweakness_scoresの件数
- 生成したreview_tasksの件数と単元名
- 保存したreportsの種類(daily / daily+weekly)

---

## 注意事項

- `analysis/tmp/` は作業用の一時ディレクトリ。ダウンロードした画像や生成したレポート下書きを置く。
  実行後に残っていても問題ないが、機密情報(写真そのもの)を含むため `.gitignore` 済みであることを
  前提とする(コミットしない)。
- Supabase操作は必ず `analysis/helpers/*.mjs` 経由で行うこと。直接SQLを組み立てて
  `curl` で叩く場合も、認証情報は `analysis/.env` からのみ読み込み、ログに出力しないこと。
- `src/` や `supabase/` など `analysis/` 以外のファイルは変更しないこと。
- 何らかのエラーで処理を中断した場合も、それまでに書き込んだデータに矛盾が出ないよう
  (例: `photos.status` を更新せずに `question_results` だけ半端に挿入する、等)、
  1枚の写真の処理は「読み取り→insert→status更新」をひとかたまりとして扱う。
