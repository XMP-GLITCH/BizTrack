-- The beta: who is in it, how many fit, and where the overflow goes.
--
-- Three things in one migration, because the trigger at the end needs all of
-- them to exist.
--
-- WHY A COHORT COLUMN WHEN `created_at` ALREADY EXISTS. "Everyone who signed up
-- before date X" is reconstructible at any time from `profiles.created_at`, so
-- the cohort boundary is genuinely deferrable and this column is not strictly
-- required. It exists for the one case a date gets WRONG: `created_at` records
-- when the profile row was made, not when the person started using BizTrack.
-- Someone who used the app right through the beta and only claimed an account
-- afterwards would be excluded by a date and included by a decision. The column
-- records the decision at the moment it was made.

-- ── settings, so the beta can be closed without a deploy ───────────────────
--
-- One row, enforced by a primary key that can only ever hold true. A settings
-- table able to grow a second row is a settings table where two rows can
-- disagree and nothing says which one wins.
create table if not exists public.app_settings (
  id         boolean primary key default true check (id),
  beta_open  boolean not null default true,
  -- 50, and it is a DIAL rather than a door. The support load of a beta is not
  -- knowable in advance, so this is a number to revise from the SQL editor
  -- after two weeks, not a constant that needs a deploy to change.
  beta_limit integer not null default 50 check (beta_limit >= 0),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "anyone may read the beta settings" on public.app_settings;

-- Readable by anyone, writable by nobody. The sign-up screen has to ask whether
-- there are places left BEFORE it offers a form, and it asks before anyone has
-- signed in, so anon needs the read. Two integers and a boolean is the whole
-- exposure. Writes go through the service role, which RLS does not apply to,
-- which means the dashboard or the SQL editor.
create policy "anyone may read the beta settings"
  on public.app_settings for select
  to anon, authenticated
  using (true);

-- ── which cohort a profile belongs to ──────────────────────────────────────
--
-- Null for everyone who was already here, which is exactly right: the two
-- existing accounts predate the beta and are NOT part of the fifty. Every count
-- below reads cohort = 'beta', so they are excluded by construction rather than
-- by a date comparison somebody has to get right.
alter table public.profiles
  add column if not exists cohort text check (cohort is null or cohort in ('beta'));

comment on column public.profiles.cohort is
  'beta = signed up during the capped beta. Null = everyone else, including accounts that predate it.';

create index if not exists profiles_cohort_idx on public.profiles (cohort) where cohort is not null;

-- ── the waitlist ───────────────────────────────────────────────────────────
--
-- The same shape as `feedback`, for the same reasons: insert for anon and
-- authenticated, and deliberately NO select policy, so nobody using the app can
-- read the list back. The owner reads it through the service role.
--
-- The spam surface is identical to feedback's and is accepted on the same
-- terms: the publishable key is inlined in the bundle by design, so this
-- endpoint is reachable by anyone who reads it. Filling it costs rows and
-- nothing else. Unlike feedback, nothing here is ever emailed, so there is no
-- outbound quota to flood.
create table if not exists public.waitlist (
  id         uuid primary key,
  email      text not null check (length(email) between 3 and 320 and position('@' in email) > 1),
  created_at timestamptz not null default now(),
  -- Where they came from, so a later read can tell a landing-page signup from
  -- one that reached the wall. Not personal data.
  source     text not null default 'app'
);

-- One row per address. Someone who taps twice should not appear twice, and the
-- insert below is written to swallow the conflict rather than report an error
-- that would read as "we could not take your email".
create unique index if not exists waitlist_email_idx on public.waitlist (lower(email));
create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;

drop policy if exists "anyone may join the waitlist" on public.waitlist;

create policy "anyone may join the waitlist"
  on public.waitlist for insert
  to anon, authenticated
  with check (length(email) <= 320 and length(source) <= 40);

-- No select, update or delete policy at all. Omitted, not forgotten.

-- ── what the sign-up screen is allowed to ask ──────────────────────────────
--
-- SECURITY DEFINER because an honest answer needs a COUNT over `profiles`, and
-- granting anon a select on that table to get it would mean handing out the
-- user list in order to answer "are there places left". This returns the
-- answer and never the rows.
--
-- `search_path` is pinned, as all fourteen SECURITY DEFINER functions in this
-- project are. Without it the body resolves table names against the CALLER's
-- path, which is how a definer function turns into a way to run code against
-- tables it was never meant to touch.
create or replace function public.beta_status()
returns json
language plpgsql
security definer
set search_path = public
stable
as $fn$
declare
  s     record;
  taken integer;
begin
  select beta_open, beta_limit into s from public.app_settings where id;
  if not found then
    -- No settings row means this migration is half applied. Say the beta is
    -- CLOSED rather than open: refusing a signup is recoverable in a minute,
    -- and letting an uncapped cohort in is not.
    return json_build_object('open', false, 'full', true, 'left', 0);
  end if;

  select count(*) into taken from public.profiles where cohort = 'beta';

  return json_build_object(
    'open', s.beta_open,
    'full', taken >= s.beta_limit,
    'left', greatest(0, s.beta_limit - taken)
  );
end;
$fn$;

revoke all on function public.beta_status() from public;
grant execute on function public.beta_status() to anon, authenticated;

-- ── stamp the cohort at signup ─────────────────────────────────────────────
--
-- This trigger CANNOT refuse a signup, and that shapes everything above it. It
-- runs AFTER insert on auth.users, so by the time it fires the account exists,
-- and with Google sign-in the account exists before any of our code sees it at
-- all. The screen is what turns people away; this decides what they get if they
-- arrive anyway.
--
-- A beta profile is plan = 'active' with a NULL plan_expires_at. That is not a
-- new state: `evaluatePlan` in the client already reads exactly that as
-- writable with no expiry. Without it a beta user would inherit the 30-day
-- default and go read-only in the middle of the beta.
--
-- THE RACE IS KNOWN AND ACCEPTED. Two signups landing in the same instant can
-- both read 49 and both become the fiftieth. At fifty places that is one extra
-- person; the alternative is a lock held across an auth trigger, which risks
-- blocking authentication for everyone. That is a trade this project has
-- already refused once, in the auth.sessions trigger whose whole body is
-- wrapped so it can never raise.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s       record;
  taken   integer := 0;
  is_beta boolean := false;
begin
  select beta_open, beta_limit into s from public.app_settings where id;
  if found and s.beta_open then
    select count(*) into taken from public.profiles where cohort = 'beta';
    is_beta := taken < s.beta_limit;
  end if;

  insert into public.profiles (id, display_name, cohort, plan, plan_expires_at)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Business Owner'),
    case when is_beta then 'beta' else null end,
    case when is_beta then 'active' else 'trialing' end,
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;
