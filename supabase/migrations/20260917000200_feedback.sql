-- Feedback, and it has to actually arrive.
--
-- What shipped before showed "Feedback sent! Thank you" and sent nothing: the
-- textarea was not wired to any state, so the words were never read. This table
-- is the other half of fixing that.
--
-- WRITE-ONLY BY DESIGN. There is an insert policy and deliberately NO select
-- policy, so nobody using the app can read the box back, including whoever
-- fills it with rubbish. The owner reads it in the SQL editor or the dashboard,
-- through the service role, which RLS does not apply to.

create table if not exists public.feedback (
  id          uuid primary key,
  -- Null for someone who has never signed in, which is how both real users run
  -- the app today. Their feedback matters as much as anyone's, so an account is
  -- not required to send it.
  user_id     uuid references auth.users (id) on delete set null,
  rating      smallint check (rating is null or rating between 1 and 5),
  message     text not null default '',
  app_version text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "anyone using the app may send feedback" on public.feedback;

-- `anon` as well as `authenticated`, because a local-only user is still a user
-- and is in fact the one most likely to have something to say about an app they
-- have not signed up for.
--
-- The spam surface is real and accepted: the anon key is inlined in the client
-- bundle by design, so this endpoint is reachable by anyone who reads it. The
-- limits are that nothing can be READ back, and nothing here is linked to
-- business data.
--
-- This comment used to end "and the volume at this product's scale is small
-- enough to clear by hand". That was true when it was written and stopped being
-- true when `notify` gained phase 3 and began EMAILING these rows: a junk row
-- was no longer a row to delete, it was an outbound message on a paid Brevo
-- quota, from the domain that also carries password resets.
--
-- The cap now lives where this comment always said it belonged -- in the Edge
-- Function, not in a policy. `notify` sends ONE digest per run whatever
-- arrives, so flooding this table can no longer flood the inbox. Filling it is
-- still possible and still costs only rows.
create policy "anyone using the app may send feedback"
  on public.feedback for insert
  to anon, authenticated
  with check (
    -- A row may claim to be from the caller or from nobody, never from someone
    -- else. Without this, anyone could file feedback against another user's id.
    (user_id is null or user_id = auth.uid())
    and length(message) <= 4000
  );

-- No select, update or delete policy at all. Omitted, not forgotten.
