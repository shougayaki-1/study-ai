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
  created_at timestamptz not null default now()
);

-- 単元マスタ
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 教材マスタ
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('問題集', '参考書', '過去問')),
  created_at timestamptz not null default now()
);

-- 勉強記録
create table if not exists study_sessions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete restrict,
  unit_id uuid references units(id) on delete set null,
  material_id uuid references materials(id) on delete set null,
  minutes integer not null check (minutes > 0),
  started_at timestamptz not null default now(),
  memo text,
  created_at timestamptz not null default now()
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

-- 写真から抽出した問題ごとの正誤
create table if not exists question_results (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  unit_id uuid references units(id) on delete set null,
  question_label text,
  is_correct boolean,
  error_type text check (error_type in ('calc', 'knowledge', 'reading', 'logic', 'other')),
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
create index if not exists idx_photos_session_id on photos(session_id);
create index if not exists idx_photos_status on photos(status);
create index if not exists idx_question_results_photo_id on question_results(photo_id);
create index if not exists idx_question_results_unit_id on question_results(unit_id);
create index if not exists idx_essay_reviews_photo_id on essay_reviews(photo_id);
create index if not exists idx_weakness_scores_unit_id on weakness_scores(unit_id);
create index if not exists idx_review_tasks_due_date on review_tasks(due_date);
create index if not exists idx_events_due_date on events(due_date);

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

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'subjects', 'units', 'materials', 'study_sessions', 'photos',
      'question_results', 'essay_reviews', 'weakness_scores',
      'review_tasks', 'events', 'reports', 'push_subscriptions'
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
