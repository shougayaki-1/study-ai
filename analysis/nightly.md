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

### -1. スキーマの最新化

1. `supabase db push --linked --dry-run` で未適用migrationを確認する。
2. 差分の有無にかかわらず `supabase db push --linked --yes` を実行し、コミット済みの
   migrationだけを実DBへ適用する。`supabase/schema.sql` や `seed.sql` を直接実行してはならない。
3. `node analysis/helpers/check-schema.mjs` を実行する。いずれかが失敗した場合は、写真解析や
   データ更新を一切始めず、エラーを表示して終了する。

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
       根拠が弱い場合は誤った単元を選ばず `unit_id: null` とし、写真に紐づく学習記録の
       `subject_id` は必ず保存する。
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
    {"photo_id": "...", "subject_id": "...", "unit_id": "...", "question_label": "大問2(1)", "is_correct": false, "error_type": "calc"}
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

### 1b. pending PDFの読み取り(模試結果・演習解説)

手順1と同じ`node analysis/helpers/list-pending-photos.mjs`の結果に、
`kind=pdf_mock_exam`・`kind=pdf_quiz`の行も含まれている(このヘルパーはkindで
絞り込んでいないため、写真とPDFが混在した一覧がそのまま返る)。

1. 各PDFについて `node analysis/helpers/download-photo.mjs <storage_path>` で
   `analysis/tmp/` にダウンロードし、PDFを読めるツール(Claude Codeの`Read`ツール、
   Codex CLIの組み込みPDF読み取り)でファイルを読む。
2. **`kind=pdf_mock_exam`の場合**(東進「Web成績表」等の模試結果PDF):
   - PDF内の「科目型成績」または「科目別成績」の表(科目・配点・得点・得点率・偏差値・
     平均点・順位/受験者数)を読み取る。科目名は手順0で取得した科目マスタと突き合わせ、
     一致する`subject_id`を選ぶ(完全一致しない場合も最も近い科目を選び、nullにしない)。
   - 「現在の偏差値による志望判定」の表があれば、`judgments_json`として
     `[{"rank":1,"school":"...","deviation":62.7,"judgment":"A"}, ...]`の形でまとめる。
     無ければ`null`のままでよい。
   - `node analysis/helpers/insert-mock-exam.mjs '<模試サマリJSON>' '<科目別得点JSON配列>'`
     で`mock_exams`・`mock_exam_scores`に挿入し、返り値の`exam.id`を保持する。模試サマリJSONの形式:
     ```json
     {"photo_id": "<現在処理中の写真のid>", "exam_title": "...", "taken_date": "...", "total_score": 81, "total_deviation": null, "judgments_json": null}
     ```
     `photo_id`には必ず現在処理中の写真(このPDF)のidを設定し、模試結果が元のPDFに
     遡れるようにする。
   - PDF内に「小問一覧」(設問ごとの正誤・得点・配点・出題項目①②③)があれば、設問ごとに
     読み取り、出題項目タグ(例:「通信文の読解」「メール」「内容一致」)と単元マスタを
     突き合わせて`unit_id`を推定する。単元推定の確信度ルールは手順1の写真読み取りと同じ
     (0.7未満は`confidence`を下げ、そのPDFの`needs_review`をtrueにする)。
     `node analysis/helpers/insert-question-results.mjs '<JSON配列>'`で挿入する。各行の形式:
     ```json
     {"photo_id": "...", "unit_id": "...", "question_label": "大問1-3", "is_correct": true, "source": "pdf_mock_exam", "raw_topic_tags": {"level1": "通信文の読解", "level2": "メール", "level3": "内容一致"}, "mock_exam_id": "<上で保持したexam.id>", "confidence": 0.9}
     ```
   - 大問ごとの「演習時間」と「目標時間」が明記されている場合だけ、秒へ換算して
     `node analysis/helpers/insert-section-timings.mjs '<JSON配列>'`で保存する。存在しない値を
     推測してはならない。片方しか読めない場合は読めた値だけ保存し、日次レポートに警告する。
   - 挿入後、`node analysis/helpers/mark-photo-status.mjs <photo_id> analyzed '<result_json>'` で
     `photos.status`を`analyzed`にする。続けて`node analysis/helpers/delete-photo-file.mjs <storage_path>`で
     Storage上のPDF原本を削除する(必要なデータは`mock_exams`/`mock_exam_scores`/`question_results`に
     構造化して保存済みのため、原本を残す必要はない。Storage容量の節約が目的)。
3. **`kind=pdf_quiz`の場合**(大問別演習の解説PDF、東進タグなし):
   - 設問ごとの「正解・あなたの解答・配点・あなたの得点」表と、プローズの解説文を読む。
     `得点 == 配点`なら正解、それ以外は不正解として扱う。
   - 解説文中の出題ジャンルの記述(例:「語の意味の問題」「返り点の付け方と書き下し文の
     組合せ問題」)から単元を推定する。写真の演習ページ読み取りと同じ確信度ルールに従う
     (東進タグが無い分、写真読み取りと同程度の確信度になりやすいことを踏まえる)。
   - `node analysis/helpers/insert-question-results.mjs '<JSON配列>'`で挿入する。各行の形式:
     ```json
     {"photo_id": "...", "unit_id": "...", "question_label": "問1", "is_correct": true, "source": "pdf_quiz", "confidence": 0.75}
     ```
   - 挿入後、`mark-photo-status.mjs <photo_id> analyzed`で`analyzed`にする。続けて
     `node analysis/helpers/delete-photo-file.mjs <storage_path>`でStorage上のPDF原本を削除する
     (理由は`pdf_mock_exam`と同じ)。
4. **読み取り不能な場合**(表構造が崩れている、パスワード保護、想定外レイアウト等):
   手順1の写真読み取りと同様に`mark-photo-status.mjs <photo_id> failed '<result_json>'`で
   `failed`にし、理由を記録する。日次レポートで必ず報告する。
5. 全pending PDFを処理し終えるまで1〜4を繰り返す。PDFが0件ならこのステップはスキップしてよい。

### 2. weakness_scores の再計算

`node analysis/helpers/recompute-weakness-scores.mjs` を実行する。
このスクリプトは DESIGN.md セクション4の式をそのまま実装している:

```
score = (1 - 直近30件の正答率) × (1 + log(1 + 経過日数) / 2)
```

- 正答率: 単元ごとの `question_results` を作成日時降順で直近30件に絞って算出。
- 経過日数: その単元の最終学習日から実行時点までの日数。「最終学習日」は
  `study_sessions.started_at` / `question_results.created_at` / **完了済み
  `review_tasks`(`status=completed`)の `completed_at`** の3つの信号のうち最も新しいものを
  採用する(正誤データが伴わない自己申告の復習完了でも忘却の時計をリセットしてよい、という
  運用方針)。学習記録が全く無い単元は999日として重く評価する。
- `weakness_scores` は全置換(既存行を削除してから再挿入)される。

出力される `{ recomputed, rows }` を確認し、異常(全件score=0など)がないかざっと見る。

参考: 忘却重み `1 + log(1+経過日数)/2` が暗黙に意味する目安間隔は、正答率50%の単元で
おおよそ3〜4日ごと、正答率90%の単元で2〜3週間ごとに復習優先度が高くなる程度である
(厳密なSM-2ではなく、この近似で十分というのがDESIGN.mdの方針)。

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
   - `evidence_json.unreviewedErrors` が多い単元、または直近7日の未復習大問が多い科目を
     優先材料にする。単元が不明でも `subject_id` を指定した科目別タスクを作成してよい。
   - `next_review_date` が今日以前の単元は、弱点スコアが同程度なら先に並べる。
   - `historical-context.mjs` の `planExecution.proposalCountHint` が3なら、提案を3件に抑える。
3. 各タスクについて、手順0で取得した教材マスタから該当科目の教材を選び、
   **具体的な範囲**(`range_text`、例:「青チャート 例題40〜43」「Vintage 単語1〜50」)を
   決める。ちょうど良い教材が無ければ `material_id` は null にし、`range_text` は
   「教科書の該当単元を復習」等、単元名から導ける具体的な指示にする。
   - `historical-context.mjs` の `evidence_json.rangeHistory` にその単元の
     `study_sessions.range_text` 履歴が入っている場合は、直前の範囲の**次の範囲**を
     推定して `range_text` に反映する(例: 直近が「例題12-15」なら次は「例題16-19」)。
   - `evidence_json.topicTagHistory` に知識トピック(地理・政経などの `topic_tag`)の履歴が
     ある場合は、単元名だけでなく**弱点トピック名を具体的に**`reason`/`range_text` に含める
     (例:「地理: EU統合の理解が弱い」)。
4. `reason` には根拠を簡潔に記す。**間隔ベースの言い回し**を使うこと
   (例:「前回復習から6日、目安は5日周期」「正答率52%、5日未学習」「直近3回連続で誤答」)。
   `estimated_minutes`、`priority_score`、`source_kind`
   (`weakness`/`retention`/`diagnostic`) と数値根拠の `evidence_json` も必ず保存する。
   提案時間の合計は週間学習可能時間を超えないようにする。
5. `due_date` は翌日の日付(YYYY-MM-DD)を指定する。
6. `node analysis/helpers/insert-review-tasks.mjs '<JSON配列>'` で `review_tasks` に挿入する。

### 3b. 知識系科目のコラム生成

地理・政経など、設定画面で「知識コラム生成」がONになっている科目
(`historical-context.mjs` の出力 `subjects` のうち `columns_enabled=true`)を対象に、
弱点補強コラムを生成する。

1. `node analysis/helpers/list-recent-columns.mjs 14` で直近14日以内に生成済みの
   コラム(単元・トピック)を取得し、重複生成を避ける。
2. `columns_enabled=true` の科目のうち、`weakness_scores`(または手順0の
   `stateRows`)でスコアが高く、かつ直近14日以内に同一単元/トピックのコラムが
   未生成のものから、**1晩あたり最大1〜2件**を選ぶ(復習提案と同程度の負荷に抑える)。
   対象が無ければこのステップはスキップしてよい。
3. 各コラムは、`historical-context.mjs` の `evidence_json`(誤答タイプの内訳
   `errors.knowledge` や `topicTagHistory` など)を根拠に、**300〜600字程度**で
   具体的な弱点を補強する解説を書く。単元名だけでなく、`topicTagHistory` があれば
   その具体的なトピックを扱う。
4. `node analysis/helpers/insert-knowledge-column.mjs '<JSONオブジェクト>'` で
   `knowledge_columns` に挿入する。形式:
   ```json
   {"subject_id": "...", "unit_id": "...", "topic_tag": "EU統合", "title": "EU統合の歴史と仕組み", "body_md": "...", "trigger_reason": "正答率38%が3週間継続", "weakness_score_at_generation": 1.2, "analysis_run_id": "<手順0で保持したid>"}
   ```
5. 生成したコラムのタイトル一覧は、手順4の日次レポートに「今日のコラム」として記載する。

### 4. 日次レポート(日曜は週次総括も)

1. `node analysis/helpers/daily-summary.mjs` で過去24時間の勉強時間・正誤集計を取得する。
2. `node analysis/helpers/list-failed-photos.mjs` で今回 `failed` にした写真があれば取得し、
   レポートに「判読できなかった写真: N件」として明記する。
3. 以下を含む Markdown レポートを作成する:
   - 今日の総学習時間・科目別内訳
   - 演習の正答状況(正解/不正解数、誤答タイプの傾向があれば言及)
   - 小論文答案があれば講評の要約
   - 模試を取り込んだ日は、模試名・総合得点/偏差値・科目別偏差値・志望判定(A〜E/Z)の要約
   - 判読不能だった写真の件数と再撮影のお願い(該当する場合)
   - 明日の復習提案(手順3で生成した内容)の要約
   - 今日生成した知識コラム(手順3bで生成した内容)があればタイトルを列挙
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
- 生成したknowledge_columnsの件数とタイトル(0件ならその旨)
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
