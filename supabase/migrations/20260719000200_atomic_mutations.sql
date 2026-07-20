-- Keep multi-table writes atomic so the UI never reports failure after a
-- partially persisted operation.

create or replace function create_recurring_plan(
  p_plan_date date,
  p_start_time time,
  p_end_time time,
  p_subject_id text,
  p_unit_id text,
  p_memo text,
  p_weekdays text[],
  p_weeks integer
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_template_id uuid;
begin
  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time';
  end if;
  if p_weeks < 1 or p_weeks > 12 then
    raise exception 'weeks must be between 1 and 12';
  end if;
  if coalesce(array_length(p_weekdays, 1), 0) = 0
     or not (p_weekdays <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]) then
    raise exception 'weekdays are invalid';
  end if;

  insert into plan_blocks (
    plan_date, start_time, end_time, subject_id, unit_id, memo, recurrence_rule
  ) values (
    p_plan_date, p_start_time, p_end_time, nullif(p_subject_id, '')::uuid, nullif(p_unit_id, '')::uuid, nullif(btrim(p_memo), ''),
    'weekly:' || array_to_string(p_weekdays, ',')
  ) returning id into v_template_id;

  insert into plan_blocks (
    plan_date, start_time, end_time, subject_id, unit_id, memo, recurrence_rule, source_plan_id
  )
  select
    d::date, p_start_time, p_end_time, nullif(p_subject_id, '')::uuid, nullif(p_unit_id, '')::uuid, nullif(btrim(p_memo), ''), null, v_template_id
  from generate_series(p_plan_date, p_plan_date + (p_weeks * 7 - 1), interval '1 day') as d
  where case extract(isodow from d)::integer
    when 1 then 'mon' when 2 then 'tue' when 3 then 'wed'
    when 4 then 'thu' when 5 then 'fri' when 6 then 'sat' else 'sun'
  end = any(p_weekdays);

  return v_template_id;
end;
$$;

create or replace function save_event_with_links(
  p_event_id text,
  p_kind text,
  p_title text,
  p_due_date date,
  p_subject_id text,
  p_unit_id text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if nullif(btrim(p_title), '') is null then
    raise exception 'title is required';
  end if;

  if nullif(p_event_id, '') is null then
    insert into events (kind, title, due_date)
    values (p_kind, btrim(p_title), p_due_date)
    returning id into v_event_id;
  else
    update events
    set kind = p_kind, title = btrim(p_title), due_date = p_due_date
    where id = p_event_id::uuid
    returning id into v_event_id;
    if v_event_id is null then raise exception 'event not found'; end if;
  end if;

  delete from event_subjects where event_id = v_event_id;
  delete from event_units where event_id = v_event_id;
  if nullif(p_subject_id, '') is not null then
    insert into event_subjects (event_id, subject_id) values (v_event_id, p_subject_id::uuid);
  end if;
  if nullif(p_unit_id, '') is not null then
    insert into event_units (event_id, unit_id) values (v_event_id, p_unit_id::uuid);
  end if;
  return v_event_id;
end;
$$;

create or replace function replace_material_units(
  p_material_id uuid,
  p_unit_ids uuid[]
) returns void
language plpgsql
set search_path = public
as $$
begin
  delete from material_units where material_id = p_material_id;
  insert into material_units (material_id, unit_id)
  select p_material_id, unit_id
  from unnest(coalesce(p_unit_ids, array[]::uuid[])) as unit_id;
end;
$$;

create or replace function create_study_session_batch(
  p_sessions jsonb,
  p_topic_tags jsonb,
  p_plan_block_id text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_batch_id uuid := gen_random_uuid();
begin
  if jsonb_typeof(p_sessions) <> 'array' or jsonb_array_length(p_sessions) = 0 then
    raise exception 'at least one study session is required';
  end if;

  insert into study_sessions (
    subject_id, unit_id, material_id, minutes, study_date, record_type,
    common_test_year, common_test_section, understanding, memo, range_text,
    topic_tag, batch_id
  )
  select
    x.subject_id, x.unit_id, x.material_id, x.minutes, x.study_date, x.record_type,
    x.common_test_year, x.common_test_section, x.understanding, x.memo, x.range_text,
    x.topic_tag, v_batch_id
  from jsonb_to_recordset(p_sessions) as x(
    subject_id uuid, unit_id uuid, material_id uuid, minutes integer,
    study_date date, record_type text, common_test_year integer,
    common_test_section text, understanding text, memo text, range_text text,
    topic_tag text
  );

  insert into topic_tags (subject_id, name, usage_count)
  select x.subject_id, btrim(x.name), 1
  from jsonb_to_recordset(coalesce(p_topic_tags, '[]'::jsonb)) as x(subject_id uuid, name text)
  where nullif(btrim(x.name), '') is not null
  on conflict (subject_id, name)
  do update set usage_count = topic_tags.usage_count + 1;

  if nullif(p_plan_block_id, '') is not null then
    update plan_blocks
    set status = 'done', linked_session_batch_id = v_batch_id
    where id = p_plan_block_id::uuid;
    if not found then raise exception 'plan block not found'; end if;
  end if;

  return v_batch_id;
end;
$$;

revoke all on function create_recurring_plan(date,time,time,text,text,text,text[],integer) from public;
revoke all on function save_event_with_links(text,text,text,date,text,text) from public;
revoke all on function replace_material_units(uuid,uuid[]) from public;
revoke all on function create_study_session_batch(jsonb,jsonb,text) from public;
grant execute on function create_recurring_plan(date,time,time,text,text,text,text[],integer) to authenticated;
grant execute on function save_event_with_links(text,text,text,date,text,text) to authenticated;
grant execute on function replace_material_units(uuid,uuid[]) to authenticated;
grant execute on function create_study_session_batch(jsonb,jsonb,text) to authenticated;
