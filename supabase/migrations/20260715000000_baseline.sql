-- Reproducible baseline for environments that predate migration tracking.
-- Existing linked environments must mark this version applied after confirming
-- an empty supabase db diff --linked; do not execute it against production.
-- study-ai データベーススキーマ
-- DESIGN.md セクション4に基づく。シングルユーザー(受験生本人)専用。
-- Supabase SQL Editor で実行するか `supabase db push` を利用する。

-- ============================================================
-- 拡張
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- テーブル定義
-- ============================================================

-- 科目マスタ
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#3f51b5', -- MUIパレットに合う hex カラー
  sort_order integer not null default 0,
  is_target boolean not null default true,
  created_at timestamptz not null default now()
);

-- 単元マスタ
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_target boolean not null default true,
  created_at timestamptz not null default now()
);

-- 教材マスタ
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('問題集', '参考書', '過去問')),
  difficulty text not null default 'standard' check (difficulty in ('basic', 'standard', 'advanced')),
  created_at timestamptz not null default now()
);

-- 勉強記録
create table if not exists study_sessions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete restrict,
  unit_id uuid references units(id) on delete set null,
  material_id uuid references materials(id) on delete set null,
  minutes integer not null check (minutes > 0),
  study_date date not null default current_date,
  record_type text not null default 'material' check (record_type in ('common_test', 'secondary', 'material')),
  common_test_year integer,
  common_test_section text,
  understanding text check (understanding in ('understood', 'uncertain', 'not_understood')),
  batch_id uuid,
  started_at timestamptz not null default now(),
  memo text,
  created_at timestamptz not null default now()
);

-- 既存のDBにも後方互換で記録日・演習区分を追加する。
alter table study_sessions
  add column if not exists study_date date not null default current_date;
alter table study_sessions
  add column if not exists record_type text not null default 'material';
alter table study_sessions
  add column if not exists common_test_year integer;
alter table study_sessions
  add column if not exists common_test_section text;
alter table study_sessions
  add column if not exists understanding text;
alter table study_sessions
  add column if not exists batch_id uuid;
alter table study_sessions
  drop constraint if exists study_sessions_record_type_check;
alter table study_sessions
  add constraint study_sessions_record_type_check
  check (record_type in ('common_test', 'secondary', 'material'));
alter table study_sessions
  drop constraint if exists study_sessions_understanding_check;
alter table study_sessions
  add constraint study_sessions_understanding_check
  check (understanding is null or understanding in ('understood', 'uncertain', 'not_understood'));

alter table subjects add column if not exists is_target boolean not null default true;
alter table units add column if not exists is_target boolean not null default true;
alter table materials add column if not exists difficulty text not null default 'standard';
alter table materials drop constraint if exists materials_difficulty_check;
alter table materials add constraint materials_difficulty_check
  check (difficulty in ('basic', 'standard', 'advanced'));

-- 教材が対応する単元。1教材を複数単元に関連付けられる。
create table if not exists material_units (
  material_id uuid not null references materials(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  primary key (material_id, unit_id)
);

-- 演習写真・小論文答案
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references study_sessions(id) on delete set null,
  storage_path text not null,
  kind text not null check (kind in ('exercise', 'essay')),
  status text not null default 'pending' check (status in ('pending', 'analyzed', 'failed')),
  analyzed_at timestamptz,
  result_json jsonb,
  created_at timestamptz not null default now()
);

-- 演習写真・小論文答案・模試/演習PDF・Notion取り込みの対応
-- 'notion_import' は写真/PDFを伴わない外部データ取り込み(例: Notionの模試ログ)用の
-- プレースホルダーphotos行に使う(question_results.photo_idがnot nullのため)。
alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('exercise', 'essay', 'pdf_mock_exam', 'pdf_quiz', 'notion_import'));

-- 写真から抽出した問題ごとの正誤
create table if not exists question_results (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,
  question_label text,
  is_correct boolean,
  error_type text check (error_type in ('calc', 'knowledge', 'reading', 'logic', 'other')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  corrected_at timestamptz,
  created_at timestamptz not null default now()
);

-- 小論文の観点別講評
create table if not exists essay_reviews (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  structure_comment text,
  logic_comment text,
  vocab_comment text,
  overall text,
  created_at timestamptz not null default now()
);

-- 単元ごとの弱点スコア(夜間バッチが全置換)
create table if not exists weakness_scores (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  score numeric not null default 0,
  accuracy numeric,
  last_studied_at timestamptz,
  computed_at timestamptz not null default now()
);

-- AI復習提案
create table if not exists review_tasks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  material_id uuid references materials(id) on delete set null,
  range_text text,
  reason text,
  due_date date not null default (current_date),
  done boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired')),
  completed_at timestamptz,
  priority_score numeric,
  source_kind text check (source_kind in ('weakness', 'retention', 'diagnostic')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  evidence_json jsonb,
  created_at timestamptz not null default now()
);

-- スケジュール(締切)
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('assignment', 'application', 'mock_exam', 'exam', 'other')),
  title text not null,
  due_date date not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- 分析レポート(Markdown)
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('daily', 'weekly')),
  body_md text not null,
  created_at timestamptz not null default now()
);

-- 単元状態の推移。夜間バッチが毎日追記する。
create table if not exists unit_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  snapshot_date date not null default current_date,
  state text not null check (state in ('undiagnosed', 'learning', 'review', 'mastered', 'foundation')),
  weakness_score numeric not null default 0,
  accuracy numeric,
  understanding text,
  last_studied_at timestamptz,
  evidence_json jsonb,
  created_at timestamptz not null default now(),
  unique(unit_id, snapshot_date)
);

create table if not exists weekly_plans (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  estimated_minutes integer not null check (estimated_minutes >= 0),
  adjusted_minutes integer check (adjusted_minutes is null or adjusted_minutes >= 0),
  focus_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analysis_runs (
  id uuid primary key default gen_random_uuid(),
  engine text not null,
  model text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  summary_json jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

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

-- 科目ごとの記録入力プロファイル。知識系科目は設定画面でON/OFFできる。
alter table subjects add column if not exists input_profile text not null default 'range';
alter table subjects drop constraint if exists subjects_input_profile_check;
alter table subjects add constraint subjects_input_profile_check
  check (input_profile in ('range', 'knowledge_tag', 'none'));
alter table subjects add column if not exists columns_enabled boolean not null default false;

-- 勉強記録に具体的な学習範囲・知識トピックを追加
alter table study_sessions add column if not exists range_text text;
alter table study_sessions add column if not exists topic_tag text;

-- 知識タグのチップ選択用マスタ(自由入力を避け、既出タグから選ばせる)
create table if not exists topic_tags (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(subject_id, name)
);
create index if not exists idx_topic_tags_subject_id on topic_tags(subject_id);

-- AI生成の知識補強コラム(地理・政経など知識系科目向け)
create table if not exists knowledge_columns (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,
  topic_tag text,
  title text not null,
  body_md text not null,
  trigger_reason text,
  weakness_score_at_generation numeric,
  read_at timestamptz,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_columns_subject_id on knowledge_columns(subject_id);
create index if not exists idx_knowledge_columns_created_at on knowledge_columns(created_at desc);

-- 学習時間割(何時から何時まで勉強するかの計画)。締切管理の events とは別概念。
create table if not exists plan_blocks (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  start_time time not null,
  end_time time not null,
  subject_id uuid references subjects(id) on delete set null,
  unit_id uuid references units(id) on delete set null,
  memo text,
  recurrence_rule text,
  source_plan_id uuid references plan_blocks(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  linked_session_batch_id uuid,
  created_at timestamptz not null default now()
);
alter table plan_blocks drop constraint if exists plan_blocks_time_order_check;
alter table plan_blocks add constraint plan_blocks_time_order_check check (end_time > start_time);
create index if not exists idx_plan_blocks_plan_date on plan_blocks(plan_date);

alter table reports add column if not exists analysis_run_id uuid references analysis_runs(id) on delete set null;
alter table photos add column if not exists confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1));
alter table photos add column if not exists needs_review boolean not null default false;
alter table photos add column if not exists file_hash text;
alter table photos add column if not exists original_name text;
alter table photos add column if not exists mime_type text;
alter table photos add column if not exists byte_size bigint;
alter table photos drop constraint if exists photos_file_hash_check;
alter table photos add constraint photos_file_hash_check check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$');
alter table photos drop constraint if exists photos_byte_size_check;
alter table photos add constraint photos_byte_size_check check (byte_size is null or byte_size >= 0);
alter table question_results add column if not exists confidence numeric;
alter table question_results add column if not exists source text not null default 'photo';
alter table question_results drop constraint if exists question_results_source_check;
alter table question_results add constraint question_results_source_check
  check (source in ('photo', 'pdf_mock_exam', 'pdf_quiz', 'notion_import'));
alter table question_results add column if not exists raw_topic_tags jsonb;
alter table question_results add column if not exists mock_exam_id uuid references mock_exams(id) on delete set null;
alter table question_results add column if not exists corrected_at timestamptz;
alter table question_results add column if not exists subject_id uuid references subjects(id) on delete set null;
alter table question_results add column if not exists score_rate numeric;
alter table question_results add column if not exists result_granularity text not null default 'question';
alter table question_results add column if not exists source_ref text;
alter table question_results drop constraint if exists question_results_score_rate_check;
alter table question_results add constraint question_results_score_rate_check check (score_rate is null or (score_rate >= 0 and score_rate <= 100));
alter table question_results drop constraint if exists question_results_granularity_check;
alter table question_results add constraint question_results_granularity_check check (result_granularity in ('question', 'section'));
alter table mock_exams add column if not exists source text;
alter table mock_exams add column if not exists source_ref text;
alter table mock_exam_scores add column if not exists source_ref text;
alter table review_tasks add column if not exists status text not null default 'pending';
alter table review_tasks add column if not exists completed_at timestamptz;
alter table review_tasks add column if not exists priority_score numeric;
alter table review_tasks add column if not exists source_kind text;
alter table review_tasks add column if not exists estimated_minutes integer;
alter table review_tasks add column if not exists evidence_json jsonb;
alter table review_tasks add column if not exists subject_id uuid references subjects(id) on delete cascade;
update review_tasks rt set subject_id = u.subject_id from units u where rt.subject_id is null and rt.unit_id = u.id;
alter table review_tasks alter column unit_id drop not null;
alter table review_tasks drop constraint if exists review_tasks_target_check;
alter table review_tasks add constraint review_tasks_target_check check (subject_id is not null or unit_id is not null);
update review_tasks set status = case when done then 'completed' else status end;
alter table review_tasks drop constraint if exists review_tasks_status_check;
alter table review_tasks add constraint review_tasks_status_check check (status in ('pending', 'completed', 'expired'));
alter table review_tasks drop constraint if exists review_tasks_source_kind_check;
alter table review_tasks add constraint review_tasks_source_kind_check check (source_kind is null or source_kind in ('weakness', 'retention', 'diagnostic'));
alter table question_results drop constraint if exists question_results_confidence_check;
alter table question_results add constraint question_results_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1));

create table if not exists common_test_unit_map (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  exam_year integer,
  section text not null,
  unit_id uuid not null references units(id) on delete cascade,
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  source_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_common_test_unit_map_year_unique on common_test_unit_map(subject_id, exam_year, section) where exam_year is not null;
create unique index if not exists idx_common_test_unit_map_default_unique on common_test_unit_map(subject_id, section) where exam_year is null;
create index if not exists idx_common_test_unit_map_lookup on common_test_unit_map(subject_id, section, exam_year);
insert into common_test_unit_map (subject_id, exam_year, section, unit_id, confidence, source_note)
select s.id, null, v.section, u.id, v.confidence, '既存の高確信度マッピングから移行'
from (values
  ('地学基礎', '大問1', '地球の姿', 0.85::numeric),
  ('地学基礎', '大問2', '大気と海洋', 0.85::numeric),
  ('地学基礎', '大問3', '地球の歴史', 0.85::numeric),
  ('地学基礎', '大問4', '宇宙の構成', 0.85::numeric),
  ('現代文', '大問1', '評論文読解', 0.85::numeric),
  ('現代文', '大問2', '小説読解', 0.85::numeric)
) as v(subject_name, section, unit_name, confidence)
join subjects s on s.name = v.subject_name
join units u on u.subject_id = s.id and u.name = v.unit_name
on conflict do nothing;

alter table unit_state_snapshots add column if not exists stability_days numeric;
alter table unit_state_snapshots add column if not exists next_review_date date;
alter table unit_state_snapshots add column if not exists review_count integer not null default 0;
alter table unit_state_snapshots drop constraint if exists unit_state_snapshots_stability_check;
alter table unit_state_snapshots add constraint unit_state_snapshots_stability_check check (stability_days is null or (stability_days >= 1 and stability_days <= 60));
alter table unit_state_snapshots drop constraint if exists unit_state_snapshots_review_count_check;
alter table unit_state_snapshots add constraint unit_state_snapshots_review_count_check check (review_count >= 0);

create table if not exists mock_exam_section_timings (
  id uuid primary key default gen_random_uuid(),
  mock_exam_score_id uuid not null references mock_exam_scores(id) on delete cascade,
  section text not null,
  actual_seconds integer,
  target_seconds integer,
  source_photo_id uuid references photos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mock_exam_score_id, section),
  check (actual_seconds is null or actual_seconds > 0),
  check (target_seconds is null or target_seconds > 0)
);

-- 試験予定の対象範囲。
create table if not exists event_subjects (
  event_id uuid not null references events(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  primary key (event_id, subject_id)
);
create table if not exists event_units (
  event_id uuid not null references events(id) on delete cascade,
  unit_id uuid not null references units(id) on delete cascade,
  primary key (event_id, unit_id)
);

-- Web Push購読
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  keys_json jsonb not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- インデックス
-- ============================================================
create index if not exists idx_units_subject_id on units(subject_id);
create index if not exists idx_materials_subject_id on materials(subject_id);
create index if not exists idx_study_sessions_subject_id on study_sessions(subject_id);
create index if not exists idx_study_sessions_unit_id on study_sessions(unit_id);
create index if not exists idx_study_sessions_started_at on study_sessions(started_at desc);
create index if not exists idx_study_sessions_study_date on study_sessions(study_date desc);
create index if not exists idx_study_sessions_batch_id on study_sessions(batch_id);
create index if not exists idx_photos_session_id on photos(session_id);
create index if not exists idx_photos_status on photos(status);
create unique index if not exists idx_photos_file_hash_unique on photos(file_hash) where file_hash is not null;
create index if not exists idx_question_results_photo_id on question_results(photo_id);
create index if not exists idx_question_results_unit_id on question_results(unit_id);
create index if not exists idx_question_results_subject_id on question_results(subject_id);
create unique index if not exists idx_question_results_source_ref_unique on question_results(source, source_ref);
create index if not exists idx_essay_reviews_photo_id on essay_reviews(photo_id);
create index if not exists idx_weakness_scores_unit_id on weakness_scores(unit_id);
create index if not exists idx_review_tasks_due_date on review_tasks(due_date);
create index if not exists idx_events_due_date on events(due_date);
create index if not exists idx_unit_state_snapshots_date on unit_state_snapshots(snapshot_date desc);
create index if not exists idx_review_tasks_status_due on review_tasks(status, due_date);
create index if not exists idx_mock_exam_scores_subject_id on mock_exam_scores(subject_id);
create index if not exists idx_mock_exam_scores_mock_exam_id on mock_exam_scores(mock_exam_id);
create index if not exists idx_mock_exams_taken_date on mock_exams(taken_date desc);
create index if not exists idx_question_results_mock_exam_id on question_results(mock_exam_id);
create index if not exists idx_review_tasks_completed_at on review_tasks(completed_at desc);
create index if not exists idx_review_tasks_subject_id on review_tasks(subject_id);
create unique index if not exists idx_mock_exams_source_ref_unique on mock_exams(source, source_ref);
create unique index if not exists idx_mock_exam_scores_source_ref_unique on mock_exam_scores(source_ref);
create index if not exists idx_mock_exam_section_timings_score_id on mock_exam_section_timings(mock_exam_score_id);

-- ============================================================
-- RLS: 認証済みユーザー(本人)のみ読み書き可
-- シングルユーザー運用のため「authenticated ロールなら全許可」とする。
-- ============================================================
alter table subjects enable row level security;
alter table units enable row level security;
alter table materials enable row level security;
alter table study_sessions enable row level security;
alter table photos enable row level security;
alter table question_results enable row level security;
alter table essay_reviews enable row level security;
alter table weakness_scores enable row level security;
alter table review_tasks enable row level security;
alter table events enable row level security;
alter table reports enable row level security;
alter table push_subscriptions enable row level security;
alter table material_units enable row level security;
alter table unit_state_snapshots enable row level security;
alter table weekly_plans enable row level security;
alter table analysis_runs enable row level security;
alter table event_subjects enable row level security;
alter table event_units enable row level security;
alter table mock_exams enable row level security;
alter table mock_exam_scores enable row level security;
alter table topic_tags enable row level security;
alter table knowledge_columns enable row level security;
alter table plan_blocks enable row level security;
alter table common_test_unit_map enable row level security;
alter table mock_exam_section_timings enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'subjects', 'units', 'materials', 'study_sessions', 'photos',
      'question_results', 'essay_reviews', 'weakness_scores',
      'review_tasks', 'events', 'reports', 'push_subscriptions',
      'material_units', 'unit_state_snapshots', 'weekly_plans', 'analysis_runs',
      'event_subjects', 'event_units', 'mock_exams', 'mock_exam_scores',
      'topic_tags', 'knowledge_columns', 'plan_blocks',
      'common_test_unit_map', 'mock_exam_section_timings'
    ])
  loop
    execute format(
      'drop policy if exists "authenticated_all_%1$s" on %1$s;', t
    );
    execute format(
      'create policy "authenticated_all_%1$s" on %1$s
         for all
         to authenticated
         using (true)
         with check (true);',
      t
    );
  end loop;
end $$;

-- ============================================================
-- Storage: photos バケット(private) + 本人のみアクセス可能なポリシー
-- ============================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "authenticated_all_photos_storage" on storage.objects;
create policy "authenticated_all_photos_storage" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'photos')
  with check (bucket_id = 'photos');

