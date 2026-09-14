-- Fix: the first-ever sign-in never produced a notice.
--
-- enqueue_new_signin selected FROM profiles and required notify_security to be
-- true. On a first signup the auth.sessions row and the profiles row are
-- created in the same instant, so that select frequently found nothing and
-- silently enqueued nothing.
--
-- The result: the one sign-in a user is most likely to want confirmed -- the
-- moment their account first exists -- is the one that never told them. Found
-- on a real signup: the account was created, confirmed and signed in, and no
-- security notice was ever sent.
--
-- Inverted to "enqueue unless explicitly opted out". A missing profile is not
-- an opt-out; it is a row that has not been written yet. The preference is
-- still honoured, because a profile that exists with notify_security = false
-- suppresses the row exactly as before.
--
-- The whole body stays wrapped: this runs inside the transaction that signs a
-- user in, and a missed notification is acceptable where blocking
-- authentication for everyone is not.

create or replace function public.enqueue_new_signin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.notification_queue (user_id, kind, dedupe_key, payload)
    select
      new.user_id,
      'security.new_signin',
      to_char(new.created_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      jsonb_build_object('signed_in_at', new.created_at)
    -- Opted out only if a profile exists AND says so. A profile that has not
    -- been created yet means "too early to know", not "no".
    where not exists (
      select 1 from public.profiles p
      where p.id = new.user_id
        and p.notify_security = false
    )
    on conflict (user_id, kind, dedupe_key) do nothing;
  exception when others then
    -- Deliberately silent. Never block a sign-in over an email.
    null;
  end;
  return new;
end;
$$;

comment on function public.enqueue_new_signin() is
  'Enqueues a sign-in notice unless the user has explicitly opted out. A missing profile row is not an opt-out -- on first signup it simply has not been written yet.';
