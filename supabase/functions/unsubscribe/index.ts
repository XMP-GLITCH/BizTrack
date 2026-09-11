/**
 * Unsubscribe.
 *
 * Reached from an inbox, so there is no session and no JWT — deploy this one
 * with --no-verify-jwt. The token in the link is the whole credential, and it
 * is scoped so tightly that leaking it costs almost nothing: it can turn a
 * category off and do nothing else. It cannot read a profile, cannot reach a
 * single sale, and cannot turn notifications back on. Re-enabling happens in
 * the app, behind a real login.
 *
 * Security email is not unsubscribable. "Someone signed into your account" is
 * precisely the message an attacker with inbox access would want silenced.
 *
 * One click, no confirmation step. A person who wants out and meets a form
 * marks the message as spam instead, and that costs the sending domain the
 * reputation the trial warnings depend on.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/+$/, "");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(["billing", "alerts", "all"]);

const LABEL: Record<string, string> = {
  billing: "trial and billing emails",
  alerts: "stock and weekly summary emails",
  all: "notification emails",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const category = url.searchParams.get("c") ?? "all";

  if (!UUID.test(token) || !CATEGORIES.has(category)) {
    return page("That link isn't valid", "Check you copied the whole link from the email.", false);
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.rpc("unsubscribe_by_token", {
    p_token: token,
    p_category: category,
  });

  if (error) {
    return page("Something went wrong", "Try again in a moment, or change this in the app under Account.", false);
  }

  // `false` means no profile carried that token — an old link, or one already
  // rotated. Said plainly rather than pretending it worked.
  if (data !== true) {
    return page(
      "That link has expired",
      "Nothing changed. You can turn these off in the app under Account.",
      false,
    );
  }

  return page(
    "You're unsubscribed",
    `You won't get ${LABEL[category]} from BizTrack any more. Your books are untouched, and nothing about your account has changed.`,
    true,
  );
});

function page(heading: string, body: string, ok: boolean): Response {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading} — BizTrack</title>
</head>
<body style="margin:0;background:#FAF8F4;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:460px;margin:0 auto;padding:64px 20px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:26px;">
      <div style="width:34px;height:34px;border-radius:9px;background:#2C1810;color:#FAF8F4;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-weight:700;">B</div>
      <span style="font-family:Georgia,serif;font-size:19px;font-weight:700;color:#2C1810;">BizTrack</span>
    </div>
    <div style="background:#fff;border:1px solid #E0D6C8;border-radius:18px;padding:32px 28px;">
      <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:24px;color:#2C1810;">${heading}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#2C1810;">${body}</p>
      <a href="${APP_URL}" style="display:inline-block;padding:13px 26px;border-radius:12px;background:#2C1810;color:#FAF8F4;text-decoration:none;font-size:15px;font-weight:700;">Open BizTrack</a>
    </div>
    <p style="margin:18px 4px 0;font-size:12px;color:#9B7B5E;line-height:1.6;">
      Security emails — like a new sign-in to your account — are always sent, and cannot be turned off here.
    </p>
  </div>
</body></html>`;

  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
