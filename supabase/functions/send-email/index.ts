/**
 * Supabase Send Email Hook.
 *
 * Supabase calls this instead of talking to an SMTP server, and this sends
 * through the Brevo API. That exists because Supabase's own SMTP client failed
 * against Brevo with "Error sending recovery email" while the identical host,
 * port, username, password and sender succeeded from outside it -- so the fault
 * was inside Supabase's SMTP path, and the API path was already proven working.
 *
 * It also fixes something that would have bitten later: the branded templates
 * now render from the repo rather than being pasted into five dashboard tabs
 * that nobody can review or diff.
 *
 * SECURITY. This endpoint sends email as a verified BizTrack domain, so an
 * unauthenticated caller could send convincing phishing from an address that
 * passes DKIM and SPF. Every request is therefore verified against the
 * standard-webhooks signature before anything is rendered or sent. It is
 * deployed with --no-verify-jwt because Supabase authenticates with that
 * signature rather than a JWT -- the signature IS the authentication, which is
 * why it is checked first and why failure is a flat rejection.
 */

import { Brevo } from "../_shared/brevo.ts";
import { type EmailData, render } from "./templates.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

const HOOK_SECRET = env("SEND_EMAIL_HOOK_SECRET");
const BREVO_API_KEY = env("BREVO_API_KEY");
const SENDER_EMAIL = env("BREVO_SENDER_EMAIL");
const SENDER_NAME = env("BREVO_SENDER_NAME", "BizTrack");
const SUPABASE_URL = env("SUPABASE_URL");
const REPLY_TO = env("REPLY_TO_EMAIL");

/** Constant-time compare, so a wrong signature leaks nothing through timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * standard-webhooks verification.
 *
 * Secret arrives as `v1,whsec_<base64>`; the signed payload is
 * `{id}.{timestamp}.{body}`; the header may carry several space-separated
 * candidate signatures, any one of which may match.
 */
async function verify(req: Request, body: string): Promise<boolean> {
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader || !HOOK_SECRET) return false;

  // Reject anything older than five minutes, so a captured request cannot be
  // replayed later to spray password-reset mail at an inbox.
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;

  const raw = HOOK_SECRET.replace(/^v1,/, "").replace(/^whsec_/, "");
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return sigHeader
    .split(" ")
    .map((s) => s.replace(/^v1,/, ""))
    .some((candidate) => safeEqual(candidate, expected));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const body = await req.text();

  if (!await verify(req, body)) {
    return json({ error: "invalid signature" }, 401);
  }

  // Loud rather than silent: a misconfigured sender that returns 200 looks
  // healthy while nobody's confirmation email ever goes out.
  const missing = [
    ["BREVO_API_KEY", BREVO_API_KEY],
    ["BREVO_SENDER_EMAIL", SENDER_EMAIL],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return json({ error: `missing config: ${missing.join(", ")}` }, 500);

  let payload: { user?: { email?: string }; email_data?: EmailData };
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "bad payload" }, 400);
  }

  const to = payload.user?.email;
  const data = payload.email_data;
  if (!to || !data?.email_action_type) return json({ error: "incomplete payload" }, 400);

  const mail = render(data.email_action_type, data, SUPABASE_URL, to);
  if (!mail) {
    // Returning an error rather than inventing a message: a wrong email about
    // someone's account is worse than a missing one, and this surfaces in the
    // auth logs instead of being swallowed.
    return json({ error: `no template for ${data.email_action_type}` }, 400);
  }

  const brevo = new Brevo(BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME, REPLY_TO);
  const result = await brevo.send({
    to,
    subject: mail.subject,
    html: mail.html,
    tag: `auth.${data.email_action_type}`,
  });

  if (!result.ok) {
    // A non-200 tells GoTrue the send failed, so the user sees an error rather
    // than being told to check an inbox nothing is coming to.
    return json({ error: result.error ?? "send failed" }, result.retryable ? 503 : 500);
  }

  return json({ ok: true });
});
