-- Trial and plan state.
--
-- Two columns and nothing else on purpose. Billing is collected manually while
-- the user base is small enough to talk to, which is the cheapest way to learn
-- what people will actually pay; these columns just record the outcome so the
-- app can enforce it and so automated billing later needs no migration.
--
-- The app must never lock someone out of their own records. An expired plan
-- makes the app READ-ONLY -- everything stays visible and exportable, only new
-- writes stop. Enforcing that in the database would put a user's books behind
-- their subscription status, so it is deliberately a client-side gate.

alter table public.profiles
  add column plan            text        not null default 'trialing'
    check (plan in ('trialing', 'active', 'expired')),
  add column trial_ends_at   timestamptz not null default (now() + interval '30 days'),
  add column plan_expires_at timestamptz;

comment on column public.profiles.plan is
  'trialing | active | expired. Expired means read-only in the client, never data denial.';
