-- Upload reliability, normalized learning evidence, and staged analytics foundations.

alter table photos add column if not exists file_hash text;
alter table photos add column if not exists original_name text;
alter table photos add column if not exists mime_type text;
alter table photos add column if not exists byte_size bigint;
alter table photos drop constraint if exists photos_file_hash_check;
alter table photos add constraint photos_file_hash_check
  check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$');
alter table photos drop constraint if exists photos_byte_size_check;
alter table photos add constraint photos_byte_size_check
  check (byte_size is null or byte_size >= 0);
create unique index if not exists idx_photos_file_hash_unique
  on photos(file_hash) where file_hash is not null;

alter table question_results add column if not exists subject_id uuid references subjects(id) on delete set null;
alter table question_results add column if not exists score_rate numeric;
alter table question_results add column if not exists result_granularity text not null default 'question';
alter table question_results add column if not exists source_ref text;
alter table question_results drop constraint if exists question_results_score_rate_check;
alter table question_results add constraint question_results_score_rate_check
  check (score_rate is null or (score_rate >= 0 and score_rate <= 100));
alter table question_results drop constraint if exists question_results_granularity_check;
alter table question_results add constraint question_results_granularity_check
  check (result_granularity in ('question', 'section'));
update question_results qr
set subject_id = u.subject_id
from units u
where qr.subject_id is null and qr.unit_id = u.id;
create index if not exists idx_question_results_subject_id on question_results(subject_id);
create unique index if not exists idx_question_results_source_ref_unique
  on question_results(source, source_ref);

alter table mock_exams add column if not exists source text;
alter table mock_exams add column if not exists source_ref text;
create unique index if not exists idx_mock_exams_source_ref_unique
  on mock_exams(source, source_ref);
alter table mock_exam_scores add column if not exists source_ref text;
create unique index if not exists idx_mock_exam_scores_source_ref_unique
  on mock_exam_scores(source_ref);

alter table review_tasks add column if not exists subject_id uuid references subjects(id) on delete cascade;
update review_tasks rt
set subject_id = u.subject_id
from units u
where rt.subject_id is null and rt.unit_id = u.id;
alter table review_tasks alter column unit_id drop not null;
alter table review_tasks drop constraint if exists review_tasks_target_check;
alter table review_tasks add constraint review_tasks_target_check
  check (subject_id is not null or unit_id is not null);
create index if not exists idx_review_tasks_subject_id on review_tasks(subject_id);

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
create unique index if not exists idx_common_test_unit_map_year_unique
  on common_test_unit_map(subject_id, exam_year, section) where exam_year is not null;
create unique index if not exists idx_common_test_unit_map_default_unique
  on common_test_unit_map(subject_id, section) where exam_year is null;
create index if not exists idx_common_test_unit_map_lookup
  on common_test_unit_map(subject_id, section, exam_year);

-- Only mappings already supported by the existing importer are seeded as
-- high-confidence defaults. Other subjects remain user-confirmed suggestions.
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
alter table unit_state_snapshots add constraint unit_state_snapshots_stability_check
  check (stability_days is null or (stability_days >= 1 and stability_days <= 60));
alter table unit_state_snapshots drop constraint if exists unit_state_snapshots_review_count_check;
alter table unit_state_snapshots add constraint unit_state_snapshots_review_count_check
  check (review_count >= 0);

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
create index if not exists idx_mock_exam_section_timings_score_id
  on mock_exam_section_timings(mock_exam_score_id);

alter table common_test_unit_map enable row level security;
alter table mock_exam_section_timings enable row level security;
drop policy if exists "authenticated_all_common_test_unit_map" on common_test_unit_map;
create policy "authenticated_all_common_test_unit_map" on common_test_unit_map
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_all_mock_exam_section_timings" on mock_exam_section_timings;
create policy "authenticated_all_mock_exam_section_timings" on mock_exam_section_timings
  for all to authenticated using (true) with check (true);
