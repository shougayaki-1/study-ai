# 夜間分析バッチ プロンプト

このファイルは、Mac上でエージェント型CLI(Claude Code の `claude -p`、または
Codex CLI の `codex exec`)をheadless実行する際に読み込ませる、夜間分析バッチの
本体プロンプトである。
docs/superpowers/specs/2026-07-24-vault-file-cli-architecture-design.md「夜間バッチの新フロー」を実装する。
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
`vault/_inbox/` に溜まった演習写真・模試PDFなどの原本をマルチモーダルで直接読み取り、
科目/教材/単元・正誤・確信度を判定し、正しい場所へ仕分け、各科目の`弱点カルテ.md`を
差分更新し、日次(日曜は週次も)レポートを`vault/`配下に保存する。

**`vault/`へのアクセスは `analysis/helpers/*.mjs` の Node スクリプトを、シェルコマンド実行
(Claude Codeでは `Bash` ツール、Codex CLIでは組み込みのシェル実行)で
`node analysis/helpers/xxx.mjs ...` として呼び出すことで行う。** 各スクリプトは
環境変数 `STUDY_AI_VAULT_DIR`(vaultルートの絶対パス。シェル環境または `analysis/.env`)を
内部で参照し、標準出力にJSONを返す。`STUDY_AI_VAULT_DIR`が未設定の場合、スクリプトは
即座にエラーで終了する(黙って別の場所を使わない)。スクリプトの一覧と使い方は各ファイル冒頭の
コメントを参照(不明な場合は `cat analysis/helpers/<name>.mjs` で確認してよい)。

作業ディレクトリはリポジトリルート。**`analysis/` 以外のディレクトリ(`src/` 等)は
一切変更しないこと。** `npm install` や `npm run build` も実行しないこと(このバッチは
Node標準機能のみで完結する)。**Supabaseへは、手順7のvaultミラー同期(`sync-vault-to-supabase.mjs`)を除いて
アクセスしない。** その同期は`vault/`の`.md`を読み取り専用ミラーへ一方向にコピーする
だけで、Supabaseから読んで判断材料にすることはない(分析の入力は`vault/`のみ)。
勉強記録・予定の手入力はWeb/対話側の担当で、夜間バッチの担当外。

---

## 処理フロー

### 1. 準備

1. `node analysis/helpers/read-vault-file.mjs index.md` を実行し、`vault/index.md` が
   読めることを確認する。エラーになる場合(`STUDY_AI_VAULT_DIR`未設定・vault未セットアップ等)は、
   写真の仕分けやカルテ更新を一切始めず、エラー内容を表示して終了する
   (Supabase時代の「-1. スキーマの最新化」に相当する安全確認。中身が壊れた状態で
   仕分けを始めない)。
2. 今日の日付(`YYYY-MM-DD`、ローカルタイム)を`TODAY`として以後使う。
   `node analysis/helpers/start-run.mjs "$TODAY"` を実行し、`runs/$TODAY.md` に
   ラン開始を記録する。返り値の`started_at`を手順7で使う。

### 2. Inbox解析

1. `node analysis/helpers/list-inbox-items.mjs` で `_inbox/` の未処理エントリ一覧
   (`relPath`, `name`, `ext`, `mtime`)を取得する。`corrections.md`・隠しファイル・
   Google Drive同期の一時ファイル(`.tmp` `.crdownload` `.icloud` `.part`)は
   自動的に除外されている。0件ならこのステップと次の「3. 仕分け」はスキップしてよい。
2. 各エントリについて、画像を読み込むツール(Claude Codeでは `Read` ツール、
   Codex CLIでは組み込みの`view_image`/PDF読み取りツール)でファイルを直接読む
   (`STUDY_AI_VAULT_DIR`配下のローカルファイルなので、パスをそのまま渡せばよい)。
3. **読み取り規約**(親スペック「夜間バッチの新フロー」2.を具体化):
   - 撮影対象は「丸付け済み(○✕記入済み)の問題集・演習ページ」または模試/演習の結果PDF。
   - 読み取るべき情報:
     - 各設問の**○✕**(採点結果)。二重線・書き直し等で判断が割れる場合は、
       最終的に残っている記号を採用する。
     - **問題番号/設問ラベル**(例:「大問2(1)」「Q3」)。ページ内の表記をそのまま使う。
     - **科目・単元の推定**: ページの見出し・問題内容から科目名と単元を推定する。
       `vault/subjects/`配下の既存ディレクトリ名(科目名)と可能な限り一致させる。
       根拠が弱い場合は誤った科目/単元を選ばず、後述の「要確認TODO」に回す。
     - **誤答タイプの推定**(✕の設問のみ): `calc`(計算ミス)/ `knowledge`(知識不足)/
       `reading`(読み取りミス)/ `logic`(論理・解法の誤り)/ `other`(判断不能)。
     - 設問(または写真全体)ごとに判定確信度(0〜1)を自己申告する。
       **0.7未満の判定は必ず「要確認TODO」に回す**(黙って誤配置しない。契約の確信度ルール)。
   - **判読不能な場合**(画像が不鮮明、問題集ページではない等)は、無理に埋めず
     「要確認TODO」に回す(選択肢に「不明」を含める)。
4. 全エントリの読み取りが終わるまで2〜3を繰り返す。

### 3. 仕分け

1. 各エントリについて、`node analysis/helpers/archive-inbox-photo.mjs "<relPath>" "$TODAY"`
   を実行し、原本を`_inbox/`から`_archive/YYYY/MM/`へ移動する
   (**原本は削除しない。誤仕分けは翌朝のTODO修正で遡及訂正できるようにするため**)。
   返り値の`archivedPath`を、そのエントリの`ref`として要確認TODO・誤答ログに使う。
2. 確信度0.7以上で科目/単元が確定したエントリは、該当科目の`subjects/<科目名>/誤答ログ.md`に
   誤答を追記する。追記内容(例)を一時ファイルに書き出す:
   ```
   - 大問2(1) / ✕ / calc(計算ミス) / confidence=0.9 / ref=_archive/2026/07/xxxxx.jpg
   - 大問3 / ✕ / knowledge(知識不足) / confidence=0.85 / ref=_archive/2026/07/xxxxx.jpg
   ```
   一時ファイルへの書き出し先は`analysis/tmp/mistake-<科目名>.md`とし、
   `node analysis/helpers/append-vault-section.mjs "subjects/<科目名>/誤答ログ.md" "$TODAY" analysis/tmp/mistake-<科目名>.md '{"type":"karte","subject":"<科目名>","source":"nightly-batch"}'`
   で`誤答ログ.md`に「## $TODAY」セクションとして追記する(**全置換しない。既存の記述は残る**)。
   正解(○)のみのエントリは誤答ログへの追記不要。
3. 確信度0.7未満、または科目/単元が確定できなかったエントリは、仕分けを行わず
   (誤答ログへの追記も行わず)手順6の要確認TODOにのみ回す。原本のアーカイブ移動
   (手順1)は確信度に関わらず必ず行う(未処理のまま`_inbox/`に残さない。
   翌朝の訂正はTODO経由で行う設計のため)。
4. 全エントリを処理し終えるまで1〜3を繰り返す。

### 4. 訂正反映

1. `node analysis/helpers/read-corrections.mjs` を実行し、`_inbox/corrections.md`の
   訂正指示(`CorrectionEntry[]`)を取得する。0件ならこのステップはスキップし、
   手順5(クリア)も不要。
2. 各訂正指示(`report`, `todo`, `choice`, `note`)について、対象の
   `reports/daily/<report>`から`ref`(元の要確認TODO行の`ref`、つまり`_archive/...`の
   相対パス)を読み、対応する科目の`誤答ログ.md`・`弱点カルテ.md`を訂正する
   (例: 誤った科目に記載してしまった誤答ログの行を、正しい科目の`誤答ログ.md`へ
   移す。移す際は`node analysis/helpers/append-vault-section.mjs`で正しい科目側に
   「## 訂正($TODAY)」セクションとして追記し、誤って記載した側は次回のカルテ差分更新
   (手順5)で「$choiceへの訂正済み」と明記する)。
   **画像原本(`_archive/`)自体は移動しない**(監査用に元の場所を保つ。
   科目/単元の再分類は`誤答ログ.md`/`弱点カルテ.md`側の記述で表現する)。
3. 全訂正指示を反映し終えたら、`node analysis/helpers/clear-corrections.mjs` を実行し、
   `_inbox/corrections.md`を空にする(**消化済みの訂正は必ずクリアする。
   クリアするまではWebが追記した訂正が残り続け、翌晩また同じ訂正を繰り返してしまう**)。

### 5. カルテ差分更新

1. 手順3・4で誤答ログを更新した科目それぞれについて、
   `node analysis/helpers/read-vault-file.mjs "subjects/<科目名>/誤答ログ.md"` で
   直近の誤答ログを読み、`node analysis/helpers/read-vault-file.mjs "subjects/<科目名>/弱点カルテ.md"`
   で**前回までのカルテ本文**を読む(ファイルが無ければ新規扱いとして本文は空とみなす)。
2. 前回のカルテ内容と今回の誤答ログを踏まえ、**誤答パターン・教材横断の関連・根本原因**を
   地の文で分析する(例:「計算ミスが3日連続。符号の見落としが多く、検算習慣の欠如が
   根本原因と考えられる」)。この分析文を`analysis/tmp/karte-<科目名>.md`に書き出す。
3. `node analysis/helpers/append-vault-section.mjs "subjects/<科目名>/弱点カルテ.md" "$TODAY" analysis/tmp/karte-<科目名>.md '{"type":"karte","subject":"<科目名>"}'`
   を実行し、カルテに「## $TODAY」セクションとして追記する
   (**全置換しない。過去の分析は消さず、その日の差分だけ積み上げる**)。
4. 今回誤答ログの更新が無かった科目のカルテは変更しない(触らない)。

### 6. レポート生成

1. `analysis/tmp/daily-report-data.json` を作成する。形式:
   ```json
   {
     "confirmTodos": [
       {
         "id": "todo-1",
         "q": "この写真の科目は？",
         "options": ["日本史", "世界史", "不明"],
         "default": "日本史",
         "ref": "_archive/2026/07/abc.jpg"
       }
     ],
     "sections": [
       { "heading": "今日の仕分け結果", "body": "写真5件処理(仕分け4件 / 要確認1件)。..." },
       { "heading": "科目別の更新", "body": "- 日本史: 誤答ログ2件追記、カルテ差分更新\n- 数学: 更新なし" },
       { "heading": "訂正反映", "body": "corrections.mdの訂正2件を反映済み(または: 訂正指示なし)" }
     ]
   }
   ```
   `confirmTodos`は手順2〜3で確信度0.7未満・科目/単元未確定だったエントリを1件1TODOで列挙する
   (`id`は`todo-1`から連番、`options`には確信度上位の候補と`不明`を含める、
   `default`には最有力候補を入れる、`ref`には手順3で得た`archivedPath`を入れる)。
   要確認事項が無ければ`confirmTodos`は空配列でよい。
2. `node analysis/helpers/build-daily-report.mjs "$TODAY" analysis/tmp/daily-report-data.json`
   を実行し、`reports/daily/$TODAY.md`を生成する(冒頭に「## 要確認TODO」が自動で入る)。
3. **実行日が日曜日の場合**、追加で週次総括を作成する:
   - 直近7日分の`reports/daily/*.md`(`node analysis/helpers/read-vault-file.mjs`で
     日付ごとに読む)を踏まえ、学習時間推移・弱点の変化・来週の重点科目をまとめる。
   - `analysis/tmp/weekly-report-data.json`を作成する。形式:
     ```json
     {
       "sections": [
         { "heading": "学習時間推移", "body": "平均105分/日、前週比+10分。..." },
         { "heading": "弱点の変化", "body": "数学: 計算ミスが減少傾向。..." },
         { "heading": "来週の重点科目", "body": "日本史(直近の誤答が集中)、数学(検算習慣)" }
       ]
     }
     ```
   - 今日のISO週番号(`YYYY-Www`、例:`2026-W30`)を`WEEK`として、
     `node analysis/helpers/build-weekly-report.mjs "$WEEK" analysis/tmp/weekly-report-data.json`
     を実行し、`reports/weekly/$WEEK.md`を保存する。

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
3. 標準出力(実行ログ)に、以下を簡潔にまとめて出力して終了する:
   - 処理したInboxエントリの件数(仕分け完了 / 要確認 内訳)
   - 更新した科目(誤答ログ・カルテ)の一覧
   - 訂正反映の件数
   - 保存したレポートの種類(daily / daily+weekly)

---

## 注意事項

- `analysis/tmp/` は作業用の一時ディレクトリ。ダウンロード不要(画像は`vault/`上に
  直接ある)だが、レポート下書きやカルテ差分の一時ファイルを置く。実行後に残っていても
  問題ないが `.gitignore` 済みであることを前提とする(コミットしない)。
- `vault/`操作は必ず `analysis/helpers/*.mjs` 経由で行うこと。`fs`コマンドを
  シェルから直接叩いて`vault/`を書き換えないこと(frontmatterスキーマ・要確認TODO書式・
  corrections書式を壊さないため)。
- `src/` や `supabase/` など `analysis/` 以外のファイルは変更しないこと。
- **原本は非破壊**: `_archive/`に移動した画像・PDFを削除してはならない。
  誤仕分けは画像を移動し直すのではなく、`誤答ログ.md`/`弱点カルテ.md`側の記述を
  訂正することで遡及訂正する。
- **`_inbox/corrections.md`はバッチが読取と消化(クリア)のみ行う**。Webが追記した行を
  書き換えたり、消化前に消してはならない。
- 何らかのエラーで処理を中断した場合、`_inbox/`のエントリは消化(アーカイブ移動)せずに
  残す(次回再試行できるようにする)。`runs/$TODAY.md`には`status: error`で記録する。
- 1件のInboxエントリの処理は「読み取り→アーカイブ移動→誤答ログ/要確認TODO振り分け」を
  ひとかたまりとして扱い、中断時にデータの整合性が崩れないようにする。
