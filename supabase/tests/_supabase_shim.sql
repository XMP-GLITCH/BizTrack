-- Minimal stand-in for the parts of Supabase our migrations depend on, so the
-- real migration files can be run and tested locally, unmodified.
create schema if not exists auth;

create table if not exists auth.users (
  id                    uuid primary key default gen_random_uuid(),
  email                 text unique,
  raw_user_meta_data    jsonb default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

-- Supabase derives the caller from the request JWT. Locally we set the same
-- GUC directly, so policies see exactly what they would in production.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
