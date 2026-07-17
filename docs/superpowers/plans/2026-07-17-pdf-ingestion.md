# PDF取り込み(模試結果・演習解説) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 東進の模試結果PDF・大問別演習解説PDFをrecord画面からアップロードし、夜間分析バッチが読み取って`question_results`(設問別正誤)と新設の`mock_exams`/`mock_exam_scores`(模試の科目別得点・偏差値)に蓄積し、分析画面に反映できるようにする。

**Architecture:** 既存の「写真アップロード→`photos`テーブルにpending登録→夜間バッチがAIで読み取り→`question_results`等に挿入→ステータス更新」という一連の仕組みをそのまま流用する。`photos`テーブルの`kind`にPDF用の値を追加するだけで、`list-pending-photos.mjs`・`download-photo.mjs`・`mark-photo-status.mjs`は変更なしにそのまま動く(いずれもkindでフィルタしていない汎用実装のため)。新規に必要なのは(1)スキーマ拡張、(2)模試サマリ専用の挿入ヘルパー1本、(3)`nightly.md`へのPDF読み取り手順追加、(4)record画面のアップロードUI拡張、(5)分析画面への模試偏差値推移カード追加、の5点のみ。

**Tech Stack:** Next.js 15 (App Router) + MUI + Supabase (Postgres/Storage/REST) + Node.js (ESM,依存追加なしの`analysis/helpers/*.mjs`)。

## Global Constraints

- 対象PDFは東進の「Web成績表」(模試本体)と「大問別演習の解説PDF」の2種類のみ。問題PDF(`GetMondaiPdf`相当)は自動採点対象にしない(design docスコープ外)。
- `analysis/`以外のディレクトリ変更は夜間バッチのプロンプト(`nightly.md`)からは一切行わない、という既存ルールは変えない。ただし本計画のTask 4・5は人間(実装者)が`src/`を直接編集するタスクであり、これは既存ルールの対象外(あのルールは「バッチ実行時にAIエージェントが`src/`を触らないこと」を指しており、開発作業自体を禁じるものではない)。
- **このリポジトリには`src/`にも`analysis/helpers/`にも自動テストが存在しない**(`analysis/menubar-app/test/`のみ`node:test`を使うが、これは独立したElectronサブプロジェクト)。既存パターンに合わせ、本計画でも新しいテストフレームワークは導入しない。スキーマ変更は`supabase db query`で実DBに適用して確認、`analysis/helpers/*.mjs`は実際にSupabaseへ呼び出して目視確認、`src/app/`のUI変更はブラウザプレビューで確認する(このセッションで実際に使った方法と同じ)。
- スキーマ変更は`supabase/schema.sql`に**冪等な形で追記**する(`create table if not exists` / `add column if not exists` / `drop constraint if exists` → `add constraint`)。既存の書き方を厳密に踏襲する。
- Supabase CLIは`~/.local/share/fnm/aliases/default/bin`にPATHを通せば使える(`supabase`コマンド)。プロジェクトは既にlinked済み(`supabase projects list`で確認可能)。DDL適用は`supabase db query --linked --file <path>`で行う。
- `analysis/.env`には実際の`SUPABASE_URL`・`SUPABASE_SERVICE_ROLE_KEY`が設定済み(このセッションで確認済み)。ヘルパー動作確認はこの実DBに対して行ってよい(個人の学習アプリであり、他ユーザーへの影響はない)。

---

### Task 1: スキーマ拡張(`photos.kind`・`question_results`・`mock_exams`・`mock_exam_scores`)

**Files:**
- Modify: `supabase/schema.sql:113-123`(question_results定義の直後に新カラムを追記)
- Modify: `supabase/schema.sql:217-234`(既存の`alter table`群と同じブロックに`photos.kind`制約更新を追記)
- Modify: `supabase/schema.sql:207-215`(analysis_runsテーブル定義の直後に`mock_exams`・`mock_exam_scores`テーブル定義を追記)
- Modify: `supabase/schema.sql:259-275`(インデックスセクションに新規インデックスを追記)
- Modify: `supabase/schema.sql:281-311`(RLS有効化とポリシー配列に新テーブルを追加)

**Interfaces:**
- Produces: `photos.kind`が`'pdf_mock_exam'`・`'pdf_quiz'`を許容するようになる。`question_results.source`(text, default `'photo'`)・`question_results.raw_topic_tags`(jsonb)・`question_results.mock_exam_id`(uuid, nullable FK)。新テーブル`mock_exams(id, photo_id, provider, exam_title, taken_date, total_score, total_deviation, judgments_json, created_at)`と`mock_exam_scores(id, mock_exam_id, subject_id, score, max_score, score_rate, deviation_value, national_avg_score, rank, total_test_takers, created_at)`。これらは以後のTask 2・3・4・5が前提として使う。

- [ ] **Step 1: `photos.kind`制約を更新する**

`supabase/schema.sql:113`の直前(`question_results`テーブル定義の直前)に以下を挿入する:

```sql
-- 演習写真・小論文答案・模試/演習PDFの取り込み対応
alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('exercise', 'essay', 'pdf_mock_exam', 'pdf_quiz'));
```

- [ ] **Step 2: `analysis_runs`定義の直後に`mock_exams`・`mock_exam_scores`テーブルを追加する**

`supabase/schema.sql:215`(`analysis_runs`テーブル定義を閉じる`);`の直後)に以下を挿入する:

```sql
-- 模試サマリ(東進「Web成績表」PDF等から取り込む科目別得点・偏差値・志望判定)
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

-- 模試の科目別得点・偏差値
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
```

- [ ] **Step 3: `question_results`にPDF由来カラムを追加する**

`supabase/schema.sql:220-221`(既存の`alter table question_results add column if not exists confidence numeric;`の直後)に以下を挿入する:

```sql
alter table question_results add column if not exists source text not null default 'photo';
alter table question_results drop constraint if exists question_results_source_check;
alter table question_results add constraint question_results_source_check
  check (source in ('photo', 'pdf_mock_exam', 'pdf_quiz'));
alter table question_results add column if not exists raw_topic_tags jsonb;
alter table question_results add column if not exists mock_exam_id uuid references mock_exams(id) on delete set null;
```

- [ ] **Step 4: インデックスを追加する**

`supabase/schema.sql:275`(`create index if not exists idx_review_tasks_status_due ...`の直後)に以下を追加する:

```sql
create index if not exists idx_mock_exam_scores_subject_id on mock_exam_scores(subject_id);
create index if not exists idx_mock_exam_scores_mock_exam_id on mock_exam_scores(mock_exam_id);
create index if not exists idx_mock_exams_taken_date on mock_exams(taken_date desc);
create index if not exists idx_question_results_mock_exam_id on question_results(mock_exam_id);
```

- [ ] **Step 5: RLSを有効化し、ポリシー配列に追加する**

`supabase/schema.sql:298`(`alter table event_units enable row level security;`の直後)に以下を追加する:

```sql
alter table mock_exams enable row level security;
alter table mock_exam_scores enable row level security;
```

同ファイルのDOブロック内の配列(`supabase/schema.sql:304-311`)を以下のように書き換える(`'mock_exams', 'mock_exam_scores'`を追加):

```sql
    select unnest(array[
      'subjects', 'units', 'materials', 'study_sessions', 'photos',
      'question_results', 'essay_reviews', 'weakness_scores',
      'review_tasks', 'events', 'reports', 'push_subscriptions',
      'material_units', 'unit_state_snapshots', 'weekly_plans', 'analysis_runs',
      'event_subjects', 'event_units', 'mock_exams', 'mock_exam_scores'
    ])
```

- [ ] **Step 6: 実DBに適用する**

```bash
export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH"
cd /Users/shoug/Documents/GitHub/study-ai
supabase db query --linked --file supabase/schema.sql
```

Expected: エラーなく完了し、最終出力にRLSポリシー適用のログが出る(`schema.sql`は冪等なので既存データは壊れない)。

- [ ] **Step 7: 適用結果を確認する**

```bash
supabase db query --linked "select table_name from information_schema.tables where table_name in ('mock_exams','mock_exam_scores');"
supabase db query --linked "select column_name from information_schema.columns where table_name = 'question_results' and column_name in ('source','raw_topic_tags','mock_exam_id');"
```

Expected: 前者は2行(`mock_exams`, `mock_exam_scores`)、後者は3行(`source`, `raw_topic_tags`, `mock_exam_id`)が返る。

- [ ] **Step 8: コミット**

```bash
git add supabase/schema.sql
git commit -m "feat(schema): add mock_exams/mock_exam_scores tables and PDF-sourced question_results columns"
```

---

### Task 2: 模試サマリ挿入ヘルパー `insert-mock-exam.mjs`

**Files:**
- Create: `analysis/helpers/insert-mock-exam.mjs`

**Interfaces:**
- Consumes: `analysis/helpers/lib.mjs`の`restClient()`・`printJson()`(既存、変更なし)。
- Produces: CLI `node analysis/helpers/insert-mock-exam.mjs '<examJSON>' '<scoresJSON配列>'` → 標準出力に`{ exam, scores }`のJSON。`exam.id`が後続の`question_results`挿入時に`mock_exam_id`として使われる(Task 3で`nightly.md`から参照)。

- [ ] **Step 1: ヘルパーを作成する**

`analysis/helpers/insert-mock-exam.mjs`を新規作成する:

```js
#!/usr/bin/env node
// mock_exams(模試サマリ) + mock_exam_scores(科目別得点)への挿入
// 使い方: node helpers/insert-mock-exam.mjs '<模試サマリJSON>' '<科目別得点JSON配列>'
//   模試サマリJSON例:
//     {"photo_id":"...","exam_title":"2024年 大学入学共通テスト 地理","taken_date":"2026-05-09","total_score":81,"total_deviation":null,"judgments_json":null}
//   科目別得点JSON配列例:
//     [{"subject_id":"...","score":81,"max_score":100,"score_rate":81.0,"deviation_value":null,"national_avg_score":null,"rank":null,"total_test_takers":null}]
import { restClient, printJson } from './lib.mjs';

const [, , examArg, scoresArg] = process.argv;
if (!examArg || !scoresArg) {
  console.error("使い方: node helpers/insert-mock-exam.mjs '<模試サマリJSON>' '<科目別得点JSON配列>'");
  process.exit(1);
}
const examRow = JSON.parse(examArg);
const scoreRows = JSON.parse(scoresArg);

const db = restClient();
const [exam] = await db.insert('mock_exams', [examRow]);
const scoresWithExamId = scoreRows.map((row) => ({ ...row, mock_exam_id: exam.id }));
const scores = await db.insert('mock_exam_scores', scoresWithExamId);
printJson({ exam, scores });
```

- [ ] **Step 2: 実際にSupabaseへ挿入して動作確認する**

会話中に共有された東進PDF(2024年 大学入学共通テスト 地理、1回目 2026/05/09実施、大問合計 81/100)を使って実データで検証する。まず地理科目の`subject_id`を取得する:

```bash
cd /Users/shoug/Documents/GitHub/study-ai
node -e "
import('./analysis/helpers/lib.mjs').then(async ({restClient}) => {
  const db = restClient();
  const subjects = await db.select('subjects', 'select=id,name&name=eq.地理');
  console.log(JSON.stringify(subjects));
});
"
```

Expected: `地理`科目の`id`が1件返る。その`id`を使って挿入する:

```bash
node analysis/helpers/insert-mock-exam.mjs \
  '{"exam_title":"2024年 大学入学共通テスト 地理","taken_date":"2026-05-09","total_score":81,"total_deviation":null,"judgments_json":null}' \
  '[{"subject_id":"<上で取得したid>","score":81,"max_score":100,"score_rate":81.0}]'
```

Expected: `{ "exam": {...id, exam_title: "2024年 大学入学共通テスト 地理", ...}, "scores": [{...mock_exam_id, subject_id, score: 81, ...}] }` が出力される。

- [ ] **Step 3: 挿入結果をSupabase側で確認する**

```bash
node -e "
import('./analysis/helpers/lib.mjs').then(async ({restClient}) => {
  const db = restClient();
  const exams = await db.select('mock_exams', 'select=*&order=created_at.desc&limit=1');
  const scores = await db.select('mock_exam_scores', 'select=*&order=created_at.desc&limit=1');
  console.log(JSON.stringify({exams, scores}, null, 2));
});
"
```

Expected: 直前に挿入した模試サマリと科目別得点がそれぞれ1件ずつ返る。

- [ ] **Step 4: コミット**

```bash
git add analysis/helpers/insert-mock-exam.mjs
git commit -m "feat(analysis): add insert-mock-exam helper for mock exam PDF ingestion"
```

---

### Task 3: `analysis/nightly.md`にPDF読み取り手順を追加

**Files:**
- Modify: `analysis/nightly.md:107`(既存セクション「1. pending写真の読み取り」の直後、「2. weakness_scoresの再計算」の直前)

**Interfaces:**
- Consumes: Task 1で追加した`photos.kind`の新しい値(`pdf_mock_exam`、`pdf_quiz`)、Task 2の`insert-mock-exam.mjs`、既存の`insert-question-results.mjs`(変更不要、任意のJSON行をそのまま挿入する汎用実装のため`source`・`raw_topic_tags`・`mock_exam_id`を含む行も渡せる)。
- Produces: 夜間バッチ実行時にPDFが`question_results`・`mock_exams`・`mock_exam_scores`に反映されるようになる。

- [ ] **Step 1: セクション「1b. pending PDFの読み取り」を追加する**

`analysis/nightly.md:107`(「4. 全pending写真を処理し終えるまで1〜3を繰り返す。写真が0件ならこのステップはスキップしてよい。」の直後、`### 2. weakness_scores の再計算`の直前)に以下を挿入する:

```markdown
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
     で`mock_exams`・`mock_exam_scores`に挿入し、返り値の`exam.id`を保持する。
   - PDF内に「小問一覧」(設問ごとの正誤・得点・配点・出題項目①②③)があれば、設問ごとに
     読み取り、出題項目タグ(例:「通信文の読解」「メール」「内容一致」)と単元マスタを
     突き合わせて`unit_id`を推定する。単元推定の確信度ルールは手順1の写真読み取りと同じ
     (0.7未満は`confidence`を下げ、そのPDFの`needs_review`をtrueにする)。
     `node analysis/helpers/insert-question-results.mjs '<JSON配列>'`で挿入する。各行の形式:
     ```json
     {"photo_id": "...", "unit_id": "...", "question_label": "大問1-3", "is_correct": true, "source": "pdf_mock_exam", "raw_topic_tags": {"level1": "通信文の読解", "level2": "メール", "level3": "内容一致"}, "mock_exam_id": "<上で保持したexam.id>", "confidence": 0.9}
     ```
   - 挿入後、`node analysis/helpers/mark-photo-status.mjs <photo_id> analyzed '<result_json>'` で
     `photos.status`を`analyzed`にする。
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
   - 挿入後、`mark-photo-status.mjs <photo_id> analyzed`で`analyzed`にする。
4. **読み取り不能な場合**(表構造が崩れている、パスワード保護、想定外レイアウト等):
   手順1の写真読み取りと同様に`mark-photo-status.mjs <photo_id> failed '<result_json>'`で
   `failed`にし、理由を記録する。日次レポートで必ず報告する。
5. 全pending PDFを処理し終えるまで1〜4を繰り返す。PDFが0件ならこのステップはスキップしてよい。
```

- [ ] **Step 2: 日次レポートのテンプレート説明にPDF由来の項目を追加する**

`analysis/nightly.md`の`### 4. 日次レポート(日曜は週次総括も)`セクション内、
「3. 以下を含む Markdown レポートを作成する:」の箇条書きに以下の1行を追加する
(既存の「小論文答案があれば講評の要約」の直後に挿入):

```markdown
   - 模試を取り込んだ日は、模試名・総合得点/偏差値・科目別偏差値・志望判定(A〜E/Z)の要約
```

- [ ] **Step 3: 変更内容を読み直して確認する**

```bash
cat analysis/nightly.md | grep -n "pdf_mock_exam\|pdf_quiz\|模試"
```

Expected: 追加した見出し・手順がすべて出力される。プロンプトの一部なので実行はできないが、
矛盾や誤字がないか目視で確認する。

- [ ] **Step 4: コミット**

```bash
git add analysis/nightly.md
git commit -m "docs(analysis): add PDF ingestion steps to nightly batch prompt"
```

---

### Task 4: record画面でPDFアップロードに対応する

**Files:**
- Modify: `src/app/record/page.tsx:95`(`photoKind`のstate型)
- Modify: `src/app/record/page.tsx:248-252`(アップロードUIのToggleButtonGroupとinput要素)

**Interfaces:**
- Consumes: なし(既存の`uploadPhotos`関数(`src/app/record/page.tsx:201-225`)は`kind: photoKind`をそのまま`photos`テーブルに挿入する汎用実装のため無変更で流用できる)。
- Produces: ユーザーが「模試PDF」「演習PDF」を選んでアップロードすると、`photos`テーブルに`kind='pdf_mock_exam'`または`'pdf_quiz'`の行が作られ、Task 1で拡張した制約と整合する。

- [ ] **Step 1: `photoKind`のstate型を拡張する**

`src/app/record/page.tsx:95`を変更する:

```tsx
// 変更前
  const [photoKind, setPhotoKind] = useState<"exercise" | "essay">("exercise");
```

```tsx
// 変更後
  const [photoKind, setPhotoKind] = useState<"exercise" | "essay" | "pdf_mock_exam" | "pdf_quiz">("exercise");
```

- [ ] **Step 2: アップロードUIにPDF用の選択肢とファイル種別を追加する**

`src/app/record/page.tsx:246-256`を変更する:

```tsx
// 変更前
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>丸付け済み写真・小論文を追加</Typography>
            <ToggleButtonGroup exclusive value={photoKind} onChange={(_, value) => value && setPhotoKind(value)} size="small" sx={{ mb: 1 }}>
              <ToggleButton value="exercise">演習</ToggleButton>
              <ToggleButton value="essay">小論文</ToggleButton>
            </ToggleButtonGroup>
            <input ref={fileInputRef} hidden multiple accept="image/*" type="file" onChange={(event) => uploadPhotos(event.target.files)} />
            <Button fullWidth variant="outlined" startIcon={<PhotoCameraIcon />} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? "アップロード中..." : "写真を選ぶ"}
            </Button>
          </Paper>
```

```tsx
// 変更後
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>丸付け済み写真・小論文・PDFを追加</Typography>
            <ToggleButtonGroup exclusive value={photoKind} onChange={(_, value) => value && setPhotoKind(value)} size="small" sx={{ mb: 1, flexWrap: "wrap" }}>
              <ToggleButton value="exercise">演習写真</ToggleButton>
              <ToggleButton value="essay">小論文写真</ToggleButton>
              <ToggleButton value="pdf_mock_exam">模試PDF</ToggleButton>
              <ToggleButton value="pdf_quiz">演習解説PDF</ToggleButton>
            </ToggleButtonGroup>
            <input
              ref={fileInputRef}
              hidden
              multiple
              accept={photoKind.startsWith("pdf") ? "application/pdf" : "image/*"}
              type="file"
              onChange={(event) => uploadPhotos(event.target.files)}
            />
            <Button fullWidth variant="outlined" startIcon={<PhotoCameraIcon />} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? "アップロード中..." : photoKind.startsWith("pdf") ? "PDFを選ぶ" : "写真を選ぶ"}
            </Button>
          </Paper>
```

- [ ] **Step 3: ブラウザで動作確認する**

```bash
# dev serverが起動していなければ
npm run dev
```

ブラウザで`http://localhost:3000/record`を開き、ログイン後に1件記録を保存 →
「模試PDF」を選択 → ファイル選択ダイアログで`application/pdf`のみが選べることを確認する
(実際に`/Users/shoug/Downloads/東進 Web成績表 - 成績データ.pdf`を選んでアップロードし、
エラーが出ないことを確認する)。アップロード後、Supabaseで確認する:

```bash
node -e "
import('./analysis/helpers/lib.mjs').then(async ({restClient}) => {
  const db = restClient();
  const rows = await db.select('photos', 'select=id,kind,storage_path,status&order=created_at.desc&limit=3');
  console.log(JSON.stringify(rows, null, 2));
});
"
```

Expected: 直近の行に`kind: "pdf_mock_exam"`、`storage_path`が`.pdf`で終わる行が含まれる。

- [ ] **Step 4: コミット**

```bash
git add src/app/record/page.tsx
git commit -m "feat(record): support uploading mock exam / quiz PDFs alongside photos"
```

---

### Task 5: 分析画面に「模試の記録」カードを追加する

**Files:**
- Modify: `src/app/stats/page.tsx:28-52`(型定義)
- Modify: `src/app/stats/page.tsx:100-173`(データ取得の`Promise.all`)
- Modify: `src/app/stats/page.tsx:186-234`(派生データのuseMemo群)
- Modify: `src/app/stats/page.tsx:344-405`(「勉強時間の棒グラフ」カードの直後に新カードを追加)

**Interfaces:**
- Consumes: Task 1で追加した`mock_exams`・`mock_exam_scores`テーブル。
- Produces: `/stats`ページに模試の偏差値推移・志望判定タイムラインが表示される。

- [ ] **Step 1: 型定義を追加する**

`src/app/stats/page.tsx:52`(`type ReviewPhoto = ...`の直後)に以下を追加する:

```tsx
type MockExamJudgment = { rank: number; school: string; deviation: number; judgment: string };
type MockExam = {
  id: string;
  exam_title: string;
  taken_date: string;
  total_score: number | null;
  total_deviation: number | null;
  judgments_json: MockExamJudgment[] | null;
};
type MockExamScore = {
  id: string;
  mock_exam_id: string;
  subject_id: string;
  score: number | null;
  max_score: number | null;
  score_rate: number | null;
  deviation_value: number | null;
};
```

- [ ] **Step 2: stateとデータ取得を追加する**

`src/app/stats/page.tsx:95`(`const [reviewPhotos, setReviewPhotos] = useState<ReviewPhoto[]>([]);`の直後)に追加する:

```tsx
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [mockExamScores, setMockExamScores] = useState<MockExamScore[]>([]);
  const [mockExamSubjectId, setMockExamSubjectId] = useState<string>("");
```

`src/app/stats/page.tsx:116`の`Promise.all`配列に以下の2つを追加する(`reviewPhotosRes`の直後):

```tsx
          supabase.from("mock_exams").select("id, exam_title, taken_date, total_score, total_deviation, judgments_json").order("taken_date", { ascending: true }),
          supabase.from("mock_exam_scores").select("id, mock_exam_id, subject_id, score, max_score, score_rate, deviation_value"),
```

対応する分割代入(`src/app/stats/page.tsx:106-116`の配列)にも
`mockExamsRes, mockExamScoresRes,`を追加し、エラーチェック(`139-147`)にも
`|| mockExamsRes.error || mockExamScoresRes.error`を追加し、
state反映(`153-161`)にも以下を追加する:

```tsx
        setMockExams((mockExamsRes.data ?? []) as MockExam[]);
        setMockExamScores((mockExamScoresRes.data ?? []) as MockExamScore[]);
```

- [ ] **Step 3: 偏差値推移の派生データを追加する**

`src/app/stats/page.tsx:234`(`chartData`の`useMemo`の直後)に追加する:

```tsx
  const mockExamDeviationSeries = useMemo(() => {
    return mockExams.map((exam) => {
      const label = exam.taken_date.slice(5);
      if (!mockExamSubjectId) {
        return { examId: exam.id, label, deviation: exam.total_deviation };
      }
      const row = mockExamScores.find((score) => score.mock_exam_id === exam.id && score.subject_id === mockExamSubjectId);
      return { examId: exam.id, label, deviation: row?.deviation_value ?? null };
    });
  }, [mockExams, mockExamScores, mockExamSubjectId]);
```

- [ ] **Step 4: 「模試の記録」カードを追加する**

`src/app/stats/page.tsx:405`(「勉強時間の棒グラフ」カードを閉じる`</Paper>`の直後、
「レポート/小論文講評」カードの直前)に以下を追加する:

```tsx
        {/* 模試の記録 */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            模試の記録
          </Typography>
          {mockExams.length === 0 ? (
            <Typography variant="body2">まだ模試の記録がありません</Typography>
          ) : (
            <Stack spacing={2}>
              <TextField
                select
                size="small"
                label="偏差値の対象"
                value={mockExamSubjectId}
                onChange={(event) => setMockExamSubjectId(event.target.value)}
              >
                <MenuItem value="">総合</MenuItem>
                {subjects.map((subject) => (
                  <MenuItem key={subject.id} value={subject.id}>{subject.name}</MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, height: 100 }}>
                {mockExamDeviationSeries.map((point) => (
                  <Box key={point.examId} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <Typography variant="caption">{point.deviation != null ? point.deviation.toFixed(1) : "-"}</Typography>
                    <Box
                      sx={{
                        width: "100%",
                        backgroundColor: "primary.main",
                        borderRadius: "3px 3px 0 0",
                        height: point.deviation != null ? `${Math.max(4, Math.min(100, ((point.deviation - 30) / 40) * 100))}%` : 0,
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{point.label}</Typography>
                  </Box>
                ))}
              </Box>
              <Stack divider={<Divider />} spacing={1}>
                {mockExams.slice().reverse().map((exam) => {
                  const topJudgment = exam.judgments_json?.[0];
                  return (
                    <Box key={exam.id}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={700}>{exam.exam_title}</Typography>
                        <Typography variant="caption" color="text.secondary">{exam.taken_date}</Typography>
                      </Stack>
                      <Typography variant="body2">
                        {exam.total_score != null ? `総合得点 ${exam.total_score}` : ""}
                        {exam.total_deviation != null ? ` / 偏差値 ${exam.total_deviation}` : ""}
                        {topJudgment ? ` / ${topJudgment.school} 判定${topJudgment.judgment}` : ""}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Stack>
          )}
        </Paper>
```

- [ ] **Step 5: サンプルデータを使ってブラウザで動作確認する**

Task 2で挿入した「2024年 大学入学共通テスト 地理」の模試データが実DBに残っている前提で、
dev serverを起動しブラウザで`/stats`を確認する:

```bash
npm run dev
```

`http://localhost:3000/stats`を開き、ログイン後に「模試の記録」カードが表示され、
「2024年 大学入学共通テスト 地理」の行に「総合得点 81」が表示されることを確認する。
「偏差値の対象」セレクタで「地理」を選ぶと、棒グラフに1本(その模試の地理偏差値、
Task 2ではnullで挿入したため「-」表示になる想定)が出ることを確認する。

- [ ] **Step 6: コミット**

```bash
git add src/app/stats/page.tsx
git commit -m "feat(stats): add mock exam deviation trend card"
```

---

### Task 6: 実PDFを使ったエンドツーエンド確認

Task 1〜5がすべて完了した状態で、会話中に共有された実PDF3点
(`/Users/shoug/Downloads/GetKaisetsuPdf.pdf`、`/Users/shoug/Downloads/東進 Web成績表 - 成績データ.pdf`)
を使い、record画面アップロードから分析画面表示までの一連の流れを人手で1回通す
(自動テストが無いため、これが本機能の実質的な受け入れテストになる)。

**Files:** なし(既存機能の組み合わせ動作確認のみ)

- [ ] **Step 1: record画面からPDFをアップロードする**

`http://localhost:3000/record`で1件記録を保存 → 「模試PDF」を選択して
`/Users/shoug/Downloads/東進 Web成績表 - 成績データ.pdf`をアップロードする。
続けて「演習解説PDF」を選択して`/Users/shoug/Downloads/GetKaisetsuPdf.pdf`もアップロードする。

- [ ] **Step 2: pendingの状態を確認する**

```bash
cd /Users/shoug/Documents/GitHub/study-ai
node analysis/helpers/list-pending-photos.mjs
```

Expected: `kind: "pdf_mock_exam"`と`kind: "pdf_quiz"`の行がそれぞれ1件、
`status: "pending"`で返る。

- [ ] **Step 3: 対話的セッションでnightly.mdのPDF処理手順を1回実行する**

このセッション(またはこのあと起動する`claude`/`codex`の対話セッション)で、
`analysis/nightly.md`の「1b. pending PDFの読み取り」セクションの指示に従い、
Step 2で見つかった2件のPDFを実際に読み取り、`insert-mock-exam.mjs`・
`insert-question-results.mjs`・`mark-photo-status.mjs`を呼び出して処理する
(このセッションで2026-07-17に夜間バッチを手動実行したときと同じやり方)。

- [ ] **Step 4: 結果をSupabaseで確認する**

```bash
node -e "
import('./analysis/helpers/lib.mjs').then(async ({restClient}) => {
  const db = restClient();
  const photos = await db.select('photos', 'select=id,kind,status&order=created_at.desc&limit=5');
  const exams = await db.select('mock_exams', 'select=id,exam_title,taken_date,total_score&order=created_at.desc&limit=3');
  const results = await db.select('question_results', 'select=id,source,unit_id,is_correct&source=neq.photo&order=created_at.desc&limit=10');
  console.log(JSON.stringify({photos, exams, results}, null, 2));
});
"
```

Expected: アップロードした2件の`photos.status`が`analyzed`になっている、
`mock_exams`に新しい行がある、`question_results`に`source`が`pdf_mock_exam`または
`pdf_quiz`の行が複数件挿入されている。

- [ ] **Step 5: 分析画面で見え方を確認する**

`http://localhost:3000/stats`を再読み込みし、以下を確認する:
- 「模試の記録」カードに今回取り込んだ模試が表示される
- 「弱点ヒートマップ」の該当単元にPDF由来のデータが反映されている(該当単元をタップし、
  単元詳細ダイアログの「最近の設問」にPDF由来の設問が出ることを確認する)
- もし確信度の低い設問があれば、「AI判定の確認が必要な写真が❍件あります」のアラートが
  表示され、単元詳細ダイアログから修正できることを確認する

- [ ] **Step 6: 動作確認が取れたことを記録する**

このタスクはコード変更を伴わないため、コミットは不要。確認結果を会話でユーザーに報告する。

