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

-- 演習写真・小論文答案・模試/演習PDFの取り込み対応
alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('exercise', 'essay', 'pdf_mock_exam', 'pdf_quiz'));

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

alter table reports add column if not exists analysis_run_id uuid references analysis_runs(id) on delete set null;
alter table photos add column if not exists confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1));
alter table photos add column if not exists needs_review boolean not null default false;
alter table question_results add column if not exists confidence numeric;
alter table question_results add column if not exists source text not null default 'photo';
alter table question_results drop constraint if exists question_results_source_check;
alter table question_results add constraint question_results_source_check
  check (source in ('photo', 'pdf_mock_exam', 'pdf_quiz'));
alter table question_results add column if not exists raw_topic_tags jsonb;
alter table question_results add column if not exists mock_exam_id uuid references mock_exams(id) on delete set null;
alter table question_results add column if not exists corrected_at timestamptz;
alter table review_tasks add column if not exists status text not null default 'pending';
alter table review_tasks add column if not exists completed_at timestamptz;
alter table review_tasks add column if not exists priority_score numeric;
alter table review_tasks add column if not exists source_kind text;
alter table review_tasks add column if not exists estimated_minutes integer;
alter table review_tasks add column if not exists evidence_json jsonb;
update review_tasks set status = case when done then 'completed' else status end;
alter table review_tasks drop constraint if exists review_tasks_status_check;
alter table review_tasks add constraint review_tasks_status_check check (status in ('pending', 'completed', 'expired'));
alter table review_tasks drop constraint if exists review_tasks_source_kind_check;
alter table review_tasks add constraint review_tasks_source_kind_check check (source_kind is null or source_kind in ('weakness', 'retention', 'diagnostic'));
alter table question_results drop constraint if exists question_results_confidence_check;
alter table question_results add constraint question_results_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1));

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
create index if not exists idx_question_results_photo_id on question_results(photo_id);
create index if not exists idx_question_results_unit_id on question_results(unit_id);
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
      'event_subjects', 'event_units', 'mock_exams', 'mock_exam_scores'
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
