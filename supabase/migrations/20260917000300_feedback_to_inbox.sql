-- Feedback has to reach a human, not just a table.
--
-- The previous migration made the box real: messages arrive as rows instead of
-- evaporating into a toast that claimed they had been sent. But a row nobody
-- opens is a more honest kind of nowhere, and nothing notified anyone that one
-- had landed.
--
-- This is the other half. `notified_at` is the watermark the sender reads, in
-- exactly the shape `notification_queue.sent_at` already uses: null means not
-- yet delivered, and marking it after the send makes a re-run safe.
--
-- Deliberately NOT a row in `notification_queue`. That table's `user_id` is
-- `not null references auth.users`, and the sender resolves the recipient from
-- that user, so everything in it goes back to the person it is about.
-- Feedback goes the other way, to the owner's inbox, and it can come from a
-- local-only user who has no account at all. Forcing it through that queue
-- would mean either inventing a user id or emailing the feedback back to
-- whoever wrote it.
alter table public.feedback add column if not exists notified_at timestamptz;

-- The sender's only read pattern: oldest unforwarded first. Partial, because a
-- message already emailed is history.
create index if not exists feedback_unnotified_idx
  on public.feedback (created_at)
  where notified_at is null;

-- No policy change. `feedback` still has an insert policy and no select policy,
-- so the app cannot read the box back; the sender reads it with the service
-- role, which RLS does not apply to.
