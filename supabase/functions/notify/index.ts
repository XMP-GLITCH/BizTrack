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
import { callerIsCron } from "../_shared/secret.ts";
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
/** Where feedback lands. Defaults to the reply-to address, which is already the
 *  inbox a person reads, so this needs no new configuration to work. */
const FEEDBACK_EMAIL = env("FEEDBACK_EMAIL", REPLY_TO);

/** How many to send per invocation. Keeps one run inside the CPU limit. */
const BATCH = Number(env("NOTIFY_BATCH", "50"));

interface FeedbackRow {
  id: number;
  rating: number | null;
  message: string | null;
  app_version: string | null;
  created_at: string;
  user_id: string | null;
}

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
  // Shared secret rather than a JWT: the caller is cron, not a person. The
  // comparison is constant-time, which the comment here used to claim while the
  // line under it used `!==` and short-circuited on the first wrong byte.
  if (!callerIsCron(req, NOTIFY_SECRET)) {
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

  // ── phase 3: forward feedback ─────────────────────────────────────────────
  //
  // Not through `notification_queue`. That table's `user_id` is not null and
  // the drain above resolves the recipient from it, so everything in it goes
  // back to the person it is about. Feedback goes the OTHER way, to the owner,
  // and can come from a local-only user with no account at all.
  //
  // Same safety shape as the drain: read unmarked rows, send, mark. A run that
  // dies halfway leaves correct state and the next run continues.
  //
  // ONE EMAIL PER RUN, not one per row, and that is a security fix rather than
  // a tidiness one.
  //
  // `feedback` accepts inserts from `anon` by design -- a local-only user is
  // the person most likely to have something to say. The migration reasoned
  // that the spam surface was acceptable because junk rows are "small enough to
  // clear by hand". That was true when it was written and stopped being true
  // the moment this phase existed: every junk row became an outbound email on a
  // paid Brevo quota, sent from the domain that also carries password resets
  // and sign-in codes. `.limit(BATCH)` bounds a single run; nothing bounded the
  // aggregate, because the drain fires every fifteen minutes forever.
  //
  // Batching caps outbound mail at one message per run whatever arrives, so
  // flooding the table can no longer flood the inbox or the sending reputation.
  // It also reads better: several messages in one digest rather than a stream.
  let feedbackSent = 0;
  if (FEEDBACK_EMAIL) {
    const { data: notes, error: fErr } = await db
      .from("feedback")
      .select("id, rating, message, app_version, created_at, user_id")
      .is("notified_at", null)
      .order("created_at", { ascending: true })
      .limit(BATCH);

    if (fErr) problems.push(`feedback: ${fErr.message}`);

    const batch = notes ?? [];
    if (batch.length > 0) {
      const faces = ["", "very unhappy", "unhappy", "ok", "happy", "delighted"];
      const one = (note: FeedbackRow) => {
        const rating = note.rating ? `${note.rating}/5 (${faces[note.rating] ?? ""})` : "not rated";
        const who = note.user_id ? "a signed-in owner" : "someone using it without an account";
        // ESCAPED. This is text a person typed, going into an HTML email. Left
        // raw, an apostrophe or an angle bracket breaks the mail and anything
        // deliberate does worse.
        return `
          <p><strong>Rating:</strong> ${esc(rating)}</p>
          <p><strong>From:</strong> ${esc(who)}</p>
          <p><strong>App:</strong> ${esc(note.app_version || "unknown")} &middot; ${esc(String(note.created_at))}</p>
          <p style="white-space:pre-wrap">${esc(note.message || "(no message, rating only)")}</p>
        `;
      };

      const subject = batch.length === 1
        ? `BizTrack feedback: ${batch[0].rating ? `${batch[0].rating}/5` : "not rated"}`
        : `BizTrack feedback: ${batch.length} messages`;

      const result = await brevo.send({
        to: FEEDBACK_EMAIL,
        toName: SENDER_NAME,
        subject,
        html: batch.map(one).join("<hr>"),
        tag: "feedback",
      });

      if (result.ok) {
        feedbackSent = batch.length;
        // Marked together, because they were sent together. A partial mark
        // would re-send the rest in the next digest.
        await db.from("feedback")
          .update({ notified_at: new Date().toISOString() })
          .in("id", batch.map((n) => n.id));
      } else {
        // Left unmarked so the next run tries again, which is right for a
        // transient Brevo failure and harmless otherwise.
        problems.push(`feedback: ${result.error ?? "unknown"}`);
      }
    }
  }

  return json({ ok: problems.length === 0, enqueued, sent, failed, skipped, feedbackSent, problems });
});

/** Minimal HTML escape, for text a person typed reaching an email body. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
