# 模試・演習結果PDF取り込み 設計

## 背景・目的

study-ai の夜間分析バッチ(`analysis/nightly.md`)は「丸付け済み演習写真」を撮影・
アップロードし、AIが○✕を読み取って`question_results`に蓄積する設計だったが、実際には
写真アップロードが一度も使われておらず、`question_results`は空、全71単元が「未診断」の
まま止まっていた(2026-07-17の手動実行で判明)。

一方で、ユーザーは東進の学習アプリ(スタディサプリ/東進ネットスクール系ポータル)から
以下のPDFを日常的にダウンロードできる:

1. **東進「Web成績表」PDF(模試本体)** — 模試1回分の科目別得点・偏差値・順位に加え、
   **設問ごとの正誤・得点・「出題項目①②③」という3階層タグ**まで含む、非常に構造化された
   レポート。
2. **大問別演習の解説PDF(`GetKaisetsuPdf`)** — 普段の大問別演習(ドリル)の、設問ごとの
   正解・自分の解答・得点と、プローズ形式の解説(「語の意味の問題」等、出題ジャンルの言及あり)。
3. **問題PDF(`GetMondaiPdf`)** — 問題そのもの(画像ベースでテキスト抽出不可)。今回は
   正誤データの抽出には使わず、人間の参考資料として保存するに留める。

これらは写真より遥かに高精度・高頻度にデータ化できるため、`question_results`を実際に
埋めていく主要な入力経路として写真と並行してPDF取り込みに対応する。あわせて、模試の
科目別偏差値推移という、写真からは得られない新しい情報も蓄積・可視化する。

## スコープ

含む:
- 東進「Web成績表」PDF(模試本体)の取り込み: 科目別集計 → `mock_exam_scores`、
  設問別正誤+出題項目タグ → `question_results`
- 大問別演習解説PDF(`GetKaisetsuPdf`)の取り込み: 設問別正誤 → `question_results`
  (単元はAIが解説文から推定。東進タグが無いため写真パイプラインに近い推定精度になる)
- record画面でのPDFアップロード対応(既存の写真アップロードと同じ導線に追加)
- `analysis/nightly.md` へのPDF処理ステップ追加(pending PDF一覧 → AI読み取り → 挿入 →
  ステータス更新、写真と同様の流れ)
- 分析画面(`/stats`)への模試偏差値推移の追加表示
- 東進の出題項目タグとアプリの`units`のマッピングを、人間が検証・修正できる仕組み
  (`needs_review`相当のフラグ+生タグの保持)

含まない(既知の制約として明示的に見送る):
- 問題PDF(`GetMondaiPdf`)からの自動採点・単元推定(画像ベースで抽出不可のため、当面は
  「参考資料」として保存するのみ)
- 東進以外の模試提供元(河合・駿台等)のPDFフォーマット対応(将来必要になれば都度追加)
- 東進の「合格判定」ロジックそのものの再実装(判定結果はテキストとしてそのまま保存するのみ)
- 既存の写真パイプライン(`analysis/nightly.md`の処理フロー1)への変更

## データモデルの変更

### `photos` テーブル(実質「解析待ちアップロード」テーブル)

`kind` の check constraint に `'pdf_mock_exam'`・`'pdf_quiz'` を追加する。
テーブル名は変更しない(リネームは影響範囲が大きく本設計のスコープ外)。

```sql
alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('exercise', 'essay', 'pdf_mock_exam', 'pdf_quiz'));
```

`storage_path` は既存同様Supabase Storageのパスを指す(PDFも同じ`photos`バケットに
保存する。画像かPDFかは拡張子とkindで判別できるため専用バケットは作らない)。

### `question_results` テーブル

PDF由来のデータを見分け、東進独自の出題項目タグをそのまま残すためのカラムを追加する。

```sql
alter table question_results add column if not exists source text not null default 'photo'
  check (source in ('photo', 'pdf_mock_exam', 'pdf_quiz'));
alter table question_results add column if not exists raw_topic_tags jsonb;
alter table question_results add column if not exists mock_exam_id uuid references mock_exams(id) on delete set null;
```

- `raw_topic_tags`: 例 `{"level1": "通信文の読解", "level2": "メール", "level3": "内容一致"}`。
  東進タグは今後もアプリの単元名と完全一致しない前提で、生の情報を失わず保持する。
- `unit_id`(既存カラム)は、AIが`raw_topic_tags`とunit一覧を突き合わせて推定した結果を
  そのまま使う(写真パイプラインの単元推定と同じ扱い)。確信が持てない場合は
  既存の`confidence`カラムを使い、0.7未満なら`photos.needs_review=true`にする既存ルールを
  そのまま踏襲する。

### 新テーブル: `mock_exams`(模試1回分のサマリ)

```sql
create table if not exists mock_exams (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references photos(id) on delete set null,
  provider text not null default 'toshin',
  exam_title text not null,
  taken_date date not null,
  total_score numeric,
  total_deviation numeric,
  judgments_json jsonb,
  created_at timestamptz not null default now()
);
```

- `judgments_json`: 東進PDFの「現在の偏差値による志望判定」表をそのまま配列で保持する。
  例: `[{"rank": 1, "school": "金沢大学 融合 観光デザ学類(文系) 前", "deviation": 62.7, "judgment": "A"}, ...]`
- 志望校名・学部名は将来的に正規化が必要になり得るが、今回はテキストのまま保存する
  (YAGNI: 現時点で志望校マスタは存在しないため)。

### 新テーブル: `mock_exam_scores`(模試の科目別得点)

```sql
create table if not exists mock_exam_scores (
  id uuid primary key default gen_random_uuid(),
  mock_exam_id uuid not null references mock_exams(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  score numeric,
  max_score numeric,
  score_rate numeric,
  deviation_value numeric,
  national_avg_score numeric,
  rank integer,
  total_test_takers integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_mock_exam_scores_subject_id on mock_exam_scores(subject_id);
create index if not exists idx_mock_exam_scores_mock_exam_id on mock_exam_scores(mock_exam_id);
```

科目名(「現代文」「数学IA」等)は既存の`subjects.name`と表記が一致する前提でAIが
突き合わせる(一致しない場合は`subject_id`をnullにせず、最も近い科目を選ぶ。写真パイプラインの
単元推定と同じ「確信が持てなくても科目レベルでは合わせる」方針を踏襲)。

## 処理フロー(`analysis/nightly.md` への追加)

既存の「1. pending写真の読み取り」と並行する新セクションとして追加する
(既存フローの変更はしない)。

### 1b. pending PDFの読み取り

1. `node analysis/helpers/list-pending-photos.mjs` の対象を`kind in ('pdf_mock_exam','pdf_quiz')`
   にも広げる(既存ヘルパーを拡張、または新規`list-pending-pdfs.mjs`を追加。実装時に判断)。
2. 各PDFを`download-photo.mjs`と同様の方法でダウンロードし、PDF読み取り可能なツールで読む。
3. **`pdf_mock_exam`の場合**:
   - 「科目別得点」表を`mock_exams`(サマリ1行)+`mock_exam_scores`(科目ごとの行)として
     `insert-mock-exam.mjs`(新規ヘルパー)で挿入する。
   - 「小問一覧」表を設問ごとに読み取り、出題項目①②③タグと単元マスタを突き合わせて
     `unit_id`を推定し、`question_results`に`source='pdf_mock_exam'`・`raw_topic_tags`・
     `mock_exam_id`付きで挿入する(`insert-question-results.mjs`を拡張)。
   - 完了後`mark-photo-status.mjs <id> analyzed`。
4. **`pdf_quiz`の場合**:
   - 設問ごとの正解/得点/配点を読み取り、解説文から単元を推定して(写真の演習ページと
     同じ確信度ルールで)`question_results`に`source='pdf_quiz'`で挿入する。
   - 完了後`mark-photo-status.mjs <id> analyzed`。
5. 判読不能・表構造が想定と異なる場合は既存ルール通り`failed`にし、日次レポートで報告する。

### 日次/週次レポートへの反映

既存の「今日の総学習時間・演習正答状況」に加え、模試を取り込んだ日は以下を追記する:
- 模試名・受験日・総合得点/偏差値
- 科目別偏差値(前回模試との差分があれば言及)
- 志望判定(A〜E/Z)に変化があれば言及

## 画面(見せ方)の変更

価値を持たせるため、単なるデータ格納で終わらせず、既存の「分析」ページに
以下を追加する(`src/app/stats/page.tsx`、実装時に正式なファイル名を確認する):

1. **模試偏差値推移カード**: 科目ごとに、模試実施日を横軸、偏差値を縦軸にした折れ線を表示。
   既存の「勉強時間の推移(週別)」カードと同じ並びに追加する。複数科目を切り替えられる
   ようにする(東進PDFのUIを参考に、初期表示は主要教科の合計、科目セレクタで切替)。
2. **志望校判定タイムライン**: 模試ごとの総合判定(A〜E/Z)を時系列の簡易テーブルで表示し、
   直近の判定に変化があれば強調する。
3. **弱点ヒートマップの情報源を明示**: 既存の「弱点ヒートマップ」は`question_results`を
   ソースにしているため、PDF由来のデータが入れば自動的に反映される(コード変更不要)。
   ただし今後どの単元がどの情報源(写真/模試PDF/演習PDF)由来かを区別できるよう、
   セルのツールチップに`source`別の件数を出す(例: 「模試2件・演習PDF3件」)。
4. **要確認(needs_review)キュー**: AIの単元マッピングの確信度が低い設問(既存の
   `confidence < 0.7` → `needs_review`ルールを流用)を、分析(`/stats`)ページに
   新しいカードとして一覧表示する(他の分析要素と同じ並び)。各行は「設問の生タグ・
   AIが推定した単元・得点」を表示し、単元をタップで選び直せるセレクタを置く。
   確定すると該当`question_results`行の`unit_id`を更新し、`needs_review`を解除する。

## エラーハンドリング・エッジケース

- 同じ模試PDFを誤って2回アップロードした場合: `mock_exams`に`exam_title`+`taken_date`の
  一意制約は設けない(同名模試の複数回受験もあり得るため)。バッチは実行のたびに新規行を
  挿入する。重複排除はスコープ外とし、必要なら本人が分析画面から後で気づいて報告する運用とする。
- PDFのテーブル構造が読み取れない(レイアウト崩れ・パスワード保護等): 該当PDFを`failed`にし、
  理由を`result_json`に記録、日次レポートで報告する(写真の判読不能時と同じ扱い)。
- 出題項目タグが単元マスタのどれとも対応しない: `unit_id`は最も近い科目内の単元を選び
  (nullにしない)、`confidence`を下げて`needs_review=true`にする。

## テスト・検証方針

- 今回共有された3つの実PDF(`GetKaisetsuPdf.pdf`、`GetMondaiPdf.pdf`、
  `東進 Web成績表 - 成績データ.pdf`)を`analysis/tmp/`にサンプルとして保存し、
  実装後に実際に読み取らせて`question_results`・`mock_exams`・`mock_exam_scores`への
  挿入結果を目視確認する。
- 分析画面の新カードは、上記サンプル取り込み後にブラウザプレビューで表示確認する。
