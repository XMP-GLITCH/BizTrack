/**
 * Forwards analytics events to PostHog, server-side.
 *
 * Called on a schedule, same shape as `notify`: read what is pending, send it,
 * mark it. Events are only marked forwarded AFTER PostHog accepts them, so a
 * failed batch is retried on the next run rather than silently lost.
 *
 * Why not a PostHog SDK in the app:
 *
 *  - Bundle. First load was just cut from 920 KB to 580 KB; a client library
 *    hands back ~50 KB of that for a dashboard.
 *  - Cookies. A client SDK sets analytics identifiers, which would make "we use
 *    no tracking cookies" false and put a consent dialog in front of every
 *    user. Nothing here touches the device.
 *  - Offline. A client SDK drops events when the network is gone, which for
 *    this audience is most of the time.
 *  - Ownership. The raw events stay in our database. PostHog is a view onto
 *    them, not the system of record, and can be removed without losing data.
 *
 * WHAT IS FORWARDED IS WHAT WE ALREADY HOLD: usage only. The events table
 * contains no item names, no amounts and no customer data by construction, so
 * there is nothing here that could leak business content to a third party.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { callerIsCron } from "../_shared/secret.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const NOTIFY_SECRET = env("NOTIFY_SECRET");
const POSTHOG_KEY = env("POSTHOG_API_KEY");
const POSTHOG_HOST = env("POSTHOG_HOST", "https://eu.i.posthog.com").replace(/\/+$/, "");

/** One run's worth. Keeps a single invocation inside the CPU limit. */
const BATCH = Number(env("FORWARD_BATCH", "200"));

/**
 * Free text never leaves for PostHog.
 *
 * The privacy policy tells people PostHog "never receive your item names,
 * prices, sales figures or customers". The client allowlist keeps business
 * data out of every OTHER property, but `message` and `stack` are on that
 * allowlist deliberately, because a crash report without them is useless -- and
 * they are free text captured from arbitrary runtime errors. `scrubText`
 * removes email addresses and numbers of six digits or more, and XAF prices in
 * this app are routinely four and five: 2,500, 9,500, 45,500.
 *
 * So the allowlist could not keep that promise, and the promise was absolute.
 * Rather than soften the sentence, the two free-text fields are dropped here.
 * PostHog still gets the event, the code location and the counts, which is what
 * "which parts of the app are used and which are breaking" actually needs.
 *
 * Nothing is lost: the raw events stay in our own database under the 90-day
 * rule, which is where the full crash text remains queryable. That is the
 * function's own stated position -- PostHog is a view onto the data, not the
 * system of record.
 */
const FREE_TEXT = new Set(["message", "stack"]);

function forwardable(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (!FREE_TEXT.has(k)) out[k] = v;
  }
  return out;
}

interface Row {
  id: number;
  user_id: string | null;
  session_id: string;
  event: string;
  props: Record<string, unknown>;
  app_version: string | null;
  occurred_at: string;
  created_at: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  // Same shared secret as the notification sender: the caller is cron, not a
  // person, so there is no JWT to check. Same constant-time comparison too --
  // these two share a secret, so a timing signal on either one leaks both.
  if (!callerIsCron(req, NOTIFY_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }

  // Loud rather than silent. A forwarder that returns 200 while unconfigured
  // looks healthy in a cron dashboard while no data ever reaches the charts.
  if (!POSTHOG_KEY) return json({ error: "missing config: POSTHOG_API_KEY" }, 500);
  if (!SERVICE_KEY) return json({ error: "missing config: SUPABASE_SERVICE_ROLE_KEY" }, 500);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await db
    .rpc("pending_analytics", { p_limit: BATCH })
    .returns<Row[]>();

  if (error) return json({ error: `pending_analytics: ${error.message}` }, 500);
  if (!rows?.length) return json({ ok: true, forwarded: 0 });

  const batch = rows.map((r) => ({
    event: r.event,
    // PostHog groups a person by distinct_id. The user id is already a random
    // UUID and carries no personal information on its own, so it identifies a
    // person across sessions without exporting who they are. Anonymous events
    // fall back to the session so they still form a coherent journey.
    distinct_id: r.user_id ?? `anon:${r.session_id}`,
    timestamp: r.occurred_at,
    properties: {
      ...forwardable(r.props),
      $session_id: r.session_id,
      app_version: r.app_version ?? undefined,
      // The offline gap, kept as a first-class property: it is the measurement
      // a client-side SDK could never have made.
      queued_seconds: Math.max(
        0,
        Math.round((Date.parse(r.created_at) - Date.parse(r.occurred_at)) / 1000),
      ),
    },
  }));

  let res: Response;
  try {
    res = await fetch(`${POSTHOG_HOST}/batch/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_KEY, batch }),
    });
  } catch (err) {
    // Network failure: leave everything pending and retry next run.
    return json({ error: `posthog unreachable: ${(err as Error).message}`, forwarded: 0 }, 503);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return json(
      { error: `posthog ${res.status}: ${text.slice(0, 300)}`, forwarded: 0 },
      res.status >= 500 ? 503 : 500,
    );
  }

  // Only now are they marked. Anything that failed above stays pending, which
  // is the whole reason forwarded_at is set here rather than when the batch was
  // assembled.
  const { data: marked, error: markErr } = await db.rpc("mark_analytics_forwarded", {
    p_ids: rows.map((r) => r.id),
  });

  if (markErr) {
    // Sent but not marked: the next run re-sends them. PostHog de-duplicates
    // poorly, so this is worth knowing about rather than swallowing.
    return json({ ok: false, forwarded: batch.length, error: `mark failed: ${markErr.message}` }, 500);
  }

  return json({ ok: true, forwarded: batch.length, marked });
});
