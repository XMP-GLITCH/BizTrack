/**
 * The sender.
 *
 * Runs on a schedule. Two phases, in order:
 *
 *   1. Enqueue -- ask the database what is due (trial warnings, low stock,
 *      weekly summaries). These write rows and send nothing.
 *   2. Drain   -- take pending rows, render, send through Brevo, mark them.
 *
 * Keeping those apart is what makes the whole thing safe to re-run. Enqueue is
 * idempotent through a unique key; drain marks each row before moving on. A run
 * that dies halfway leaves correct state behind, and the next run continues.
 *
 * This function never touches a user's books. It reads figures and sends mail.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Brevo } from "../_shared/brevo.ts";
import { type Ctx, render } from "./templates.ts";

const env = (k: string, fallback = ""): string => Deno.env.get(k) ?? fallback;

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const NOTIFY_SECRET = env("NOTIFY_SECRET");
const BREVO_API_KEY = env("BREVO_API_KEY");
const SENDER_EMAIL = env("BREVO_SENDER_EMAIL");
const SENDER_NAME = env("BREVO_SENDER_NAME", "BizTrack");
const APP_URL = env("APP_URL", "http://localhost:5173").replace(/\/+$/, "");
const REPLY_TO = env("REPLY_TO_EMAIL");

/** How many to send per invocation. Keeps one run inside the CPU limit. */
const BATCH = Number(env("NOTIFY_BATCH", "50"));

interface Pending {
  id: number;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  email: string;
  display_name: string;
  unsubscribe_token: string;
  attempts: number;
}

Deno.serve(async (req) => {
  // Shared secret rather than a JWT: the caller is cron, not a person. Compared
  // in full so a wrong secret costs the same as a missing one.
  const provided = req.headers.get("x-notify-secret") ?? "";
  if (!NOTIFY_SECRET || provided !== NOTIFY_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const missing = [
    ["BREVO_API_KEY", BREVO_API_KEY],
    ["BREVO_SENDER_EMAIL", SENDER_EMAIL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ].filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    // Loud, not silent. A misconfigured sender that returns 200 looks healthy
    // in a cron dashboard while nobody's trial warning ever goes out.
    return json({ error: `missing config: ${missing.join(", ")}` }, 500);
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("jobs"); // e.g. "billing" or "billing,alerts"
  const wants = (name: string) => !only || only.split(",").includes(name);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const brevo = new Brevo(BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME, REPLY_TO);

  const enqueued: Record<string, unknown> = {};
  const problems: string[] = [];

  // ── phase 1: enqueue ──────────────────────────────────────────────────────
  // Each job is independent. One failing must not stop the others, and must not
  // stop the drain -- rows already queued still deserve to go out.
  const jobs: Array<[string, string]> = [
    ["billing", "enqueue_billing_notices"],
    ["alerts", "enqueue_low_stock"],
    ["summary", "enqueue_weekly_summary"],
  ];

  for (const [name, fn] of jobs) {
    if (!wants(name)) continue;
    const { data, error } = await db.rpc(fn);
    if (error) problems.push(`${fn}: ${error.message}`);
    else enqueued[name] = data;
  }

  // ── phase 2: drain ────────────────────────────────────────────────────────
  const { data: pending, error: readErr } = await db
    .rpc("pending_notifications", { p_limit: BATCH })
    .returns<Pending[]>();

  if (readErr) return json({ error: `pending_notifications: ${readErr.message}`, enqueued }, 500);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending ?? []) {
    const ctx: Ctx = {
      displayName: row.display_name,
      appUrl: APP_URL,
      unsubscribeUrl: (category) =>
        `${SUPABASE_URL}/functions/v1/unsubscribe?t=${row.unsubscribe_token}&c=${category}`,
    };

    const mail = render(row.kind, row.payload, ctx);

    if (!mail) {
      // An unknown kind is a deploy-order bug, not a transient fault. Retiring
      // the row keeps it out of every future batch.
      skipped++;
      await db.from("notification_queue")
        .update({ attempts: 99, last_error: `no renderer for kind ${row.kind}` })
        .eq("id", row.id);
      continue;
    }

    const result = await brevo.send({
      to: row.email,
      toName: row.display_name,
      subject: mail.subject,
      html: mail.html,
      tag: row.kind,
    });

    if (result.ok) {
      sent++;
      await db.from("notification_queue")
        .update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null })
        .eq("id", row.id);
      continue;
    }

    failed++;
    // A retryable failure leaves attempts alone so a Brevo outage cannot burn
    // through the five-attempt budget and permanently drop the message.
    await db.from("notification_queue")
      .update({
        attempts: result.retryable ? row.attempts : row.attempts + 1,
        last_error: result.error ?? "unknown",
      })
      .eq("id", row.id);

    // Their daily cap is reached; the rest of this batch would fail too.
    if (result.error?.includes("brevo 429")) {
      problems.push("brevo rate limit reached, stopping this run");
      break;
    }
  }

  return json({ ok: problems.length === 0, enqueued, sent, failed, skipped, problems });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
