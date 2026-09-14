# Notification emails

Trial and billing warnings, low-stock and weekly-summary alerts, and new
sign-in notices. Sent through Brevo, scheduled by pg_cron.

## How it fits together

```
pg_cron ──▶ notify (Edge Function)
              │
              ├─ 1. enqueue: ask the DB what is due  ─▶ notification_queue
              │      enqueue_billing_notices()
              │      enqueue_low_stock()
              │      enqueue_weekly_summary()
              │
              └─ 2. drain: pending rows ─▶ render ─▶ Brevo ─▶ mark sent

auth.sessions INSERT ─trigger─▶ notification_queue   (new sign-in)
```

Nothing sends inline. Everything is enqueued first, and the queue's unique key
`(user_id, kind, dedupe_key)` is what makes the whole thing safe to re-run: an
overlapping cron tick, a retry after a crash, or a manual invocation cannot
email someone the same trial warning twice.

**Nothing here can touch a user's books.** These jobs read figures and send
mail. An email that never arrives changes nothing about what the app shows or
what can be exported.

## 1. Brevo

1. Create the account, then **Senders, Domains & Dedicated IPs → Domains** and
   add a domain you control.
2. Add the **SPF and DKIM** records it gives you. Skip this and everything here
   lands in Gmail spam regardless of how the emails look — and most of this
   audience is on Gmail.
3. **SMTP & API → API Keys** → create one.

Use the same domain for the auth emails in [`../emails/README.md`](../emails/README.md)
so both come from one sender identity.

## 2. Secrets

```sh
supabase secrets set \
  BREVO_API_KEY=xkeysib-... \
  BREVO_SENDER_EMAIL=notifications@yourdomain.com \
  BREVO_SENDER_NAME=BizTrack \
  APP_URL=https://your-deployed-app \
  NOTIFY_SECRET="$(openssl rand -hex 32)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not set them, and never put the service key anywhere near the client.

Keep `NOTIFY_SECRET` where you can find it; cron needs it below.

## 3. Deploy

```sh
supabase db push                                   # the notifications migration
supabase functions deploy notify
supabase functions deploy unsubscribe --no-verify-jwt
```

`--no-verify-jwt` on `unsubscribe` is required and safe. It is opened from an
inbox where no session exists, and the token in the link can do exactly one
thing: turn a category off. It cannot read a profile or reach a single sale.

`notify` keeps JWT verification on and additionally requires the
`x-notify-secret` header.

## 4. Schedule

In the SQL Editor. Store the secret in Vault rather than pasting it into the job
body, which is readable by anyone with dashboard access:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<your NOTIFY_SECRET>', 'notify_secret');
```

Then the three schedules:

```sql
-- Trial warnings: daily, 07:00 UTC (08:00 in WAT).
select cron.schedule('biztrack-billing', '0 7 * * *', $$
  select net.http_post(
    url     := 'https://ufyyurmekegbzkqjisdb.supabase.co/functions/v1/notify?jobs=billing',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
    timeout_milliseconds := 55000);
$$);

-- Low stock and the weekly summary: Mondays, 07:00 UTC.
select cron.schedule('biztrack-weekly', '0 7 * * 1', $$
  select net.http_post(
    url     := 'https://ufyyurmekegbzkqjisdb.supabase.co/functions/v1/notify?jobs=alerts,summary',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
    timeout_milliseconds := 55000);
$$);

-- Drain only, every 15 minutes, so a new-sign-in notice is not sitting in the
-- queue for a day. "jobs=none" matches no job, so nothing is enqueued and the
-- function goes straight to sending.
select cron.schedule('biztrack-drain', '*/15 * * * *', $$
  select net.http_post(
    url     := 'https://ufyyurmekegbzkqjisdb.supabase.co/functions/v1/notify?jobs=none',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
    timeout_milliseconds := 55000);
$$);
```

Check them with `select * from cron.job;`, and results with
`select * from cron.job_run_details order by start_time desc limit 20;`.

## Testing without waiting a month

```sql
-- Pretend a trial is nearly over, then run the job.
update public.profiles set trial_ends_at = now() + interval '2 days' where id = '<your-user-id>';
select public.enqueue_billing_notices();
select id, kind, dedupe_key, sent_at, last_error from public.notification_queue order by id desc;
```

Then invoke the sender by hand:

```sh
curl -X POST "https://ufyyurmekegbzkqjisdb.supabase.co/functions/v1/notify?jobs=none" \
  -H "Authorization: Bearer <anon key>" \
  -H "x-notify-secret: <NOTIFY_SECRET>"
```

It returns `{ sent, failed, skipped, problems }`. To re-send the same
notification while testing, delete the queue row — the unique key is doing its
job and will otherwise refuse a duplicate.

## Things worth knowing before this runs unattended

**The `auth.sessions` trigger.** `enqueue_new_signin` fires inside the
transaction that signs a user in. Its entire body is wrapped in an exception
handler, so it can never raise and never block a sign-in — a missed
notification is acceptable, a user locked out of their own books is not. But
Supabase owns that schema and may change it during a platform upgrade. If
sign-in ever misbehaves after one, drop this first:

```sql
drop trigger if exists on_auth_session_created on auth.sessions;
```

**Five attempts, then the row is retired.** A dead address would otherwise be
retried on every run forever. Retryable failures (429, 5xx) deliberately do not
count against that budget, so a Brevo outage cannot silently exhaust it.

**A week with no sales sends no summary.** A cheerful "0 XAF this week" is what
teaches someone to filter your mail — and then they miss the trial warning too.

**Security email cannot be unsubscribed.** "Someone signed into your account" is
exactly what an attacker with inbox access would want to silence.

## Not verified

The SQL and TypeScript here were written without a local Postgres, Docker or
Deno available, so neither has been executed. The logic follows the schema and
the existing domain rules, but expect ordinary first-run integration details —
run the testing section above against one account before scheduling anything.
