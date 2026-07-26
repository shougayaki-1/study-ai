-- Phase 3: read-only Supabase mirror of vault/*.md, synced by
-- analysis/helpers/sync-vault-to-supabase.mjs (service_role only).
-- Vercel's Web deployment reads this table via the anon/authenticated key;
-- it must only ever be able to `select`, never write.
create table if not exists vault_files (
  path text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);

alter table vault_files enable row level security;

drop policy if exists "authenticated_select_vault_files" on vault_files;
create policy "authenticated_select_vault_files" on vault_files
  for select
  to authenticated
  using (true);

-- supabase/migrations/20260719000300_api_grants.sql runs `alter default
-- privileges ... grant select, insert, update, delete on tables to
-- authenticated`, which fires automatically the moment this table is
-- created (it applies to future tables too, not just tables that existed
-- when it ran). Strip that write access back off explicitly so
-- `vault_files` stays select-only for `authenticated`, while
-- `service_role` (the sync script) keeps full access.
revoke all on vault_files from authenticated;
grant select on vault_files to authenticated;
grant all privileges on vault_files to service_role;
