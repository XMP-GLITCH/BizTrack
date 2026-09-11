/**
 * Email rendering.
 *
 * The same shell as supabase/emails/*.html, in code because these bodies are
 * built from data rather than pasted into a dashboard. Design decisions carried
 * over deliberately:
 *
 *  * The logo is the only image, and it degrades. Inboxes block remote images
 *    by default, so the <img> carries alt text styled to look like the wordmark
 *    -- a blocked image reads as "BizTrack" in the brand serif rather than as a
 *    broken box. Nothing else is an image, because every one costs bytes on a
 *    metered connection.
 *  * Table layout with inline styles. Gmail strips <style> blocks.
 *  * Light-only. Fighting each client's dark-mode inversion mangles hand-built
 *    tables differently in Gmail, Outlook and Apple Mail.
 */

const BROWN = "#2C1810";
const CREAM = "#FAF8F4";
const MUTED = "#9B7B5E";
const BORDER = "#E0D6C8";
const RED = "#C0392B";
const GREEN = "#3A7D2C";

/**
 * Absolute URL to the wordmark. Must be publicly reachable without a session --
 * an inbox has no cookies. Defaults to the app's own copy in public/, which
 * ships with every deploy; set BRAND_LOGO_URL to point at Supabase Storage
 * instead if you want it to survive the app being down.
 */
const APP_ORIGIN = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
export const LOGO_URL = Deno.env.get("BRAND_LOGO_URL") || `${APP_ORIGIN}/wordmark-light.png`;

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS =
  "'Inter', 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Mirrors src/domain/money.js. Duplicated because Edge Functions bundle only
 * what lives under supabase/functions, and a network hop to reach a formatter
 * would be worse. If a currency is added there, add it here -- an amount shown
 * with the wrong number of decimals is a bug people notice immediately.
 */
const EXPONENT: Record<string, number> = {
  XAF: 0, NGN: 2, GHS: 2, KES: 2, USD: 2, EUR: 2,
};

export function formatMoney(minor: number, currency: string): string {
  const cur = currency in EXPONENT ? currency : "XAF";
  const digits = EXPONENT[cur];
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

export const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const p = (text: string): string =>
  `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.65;color:${BROWN};">${text}</p>`;

interface ShellOptions {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  unsubscribeUrl?: string;
}

export function shell(o: ShellOptions): string {
  const cta = o.ctaLabel && o.ctaUrl
    ? `<tr><td align="center" style="padding:6px 0 4px;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
           <td align="center" bgcolor="${BROWN}" style="border-radius:12px;">
             <a href="${o.ctaUrl}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;font-weight:700;color:${CREAM};text-decoration:none;border-radius:12px;">${o.ctaLabel}</a>
           </td>
         </tr></table>
       </td></tr>`
    : "";

  const note = o.footerNote
    ? `<tr><td style="padding:18px 0 0;">
         <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${o.footerNote}</p>
       </td></tr>`
    : "";

  // Every non-security email carries a one-click unsubscribe. Someone who wants
  // out and cannot find the door marks the message as spam instead, which costs
  // the sending domain reputation that the trial warnings depend on.
  const unsub = o.unsubscribeUrl
    ? `<p style="margin:6px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">
         <a href="${o.unsubscribeUrl}" style="color:${MUTED};text-decoration:underline;">Stop receiving these emails</a>
       </p>`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>BizTrack</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;font-size:1px;color:${CREAM};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(o.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

    <tr><td align="center" style="padding:0 0 22px;">
      <img src="${LOGO_URL}" alt="BizTrack" width="150" height="47"
           style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:150px;font-family:${SERIF};font-size:19px;font-weight:700;color:${BROWN};">
    </td></tr>

    <tr><td bgcolor="#FFFFFF" style="border:1px solid ${BORDER};border-radius:18px;padding:34px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td>
          <h1 style="margin:0 0 12px;font-family:${SERIF};font-size:25px;line-height:1.25;font-weight:700;color:${BROWN};">${escapeHtml(o.heading)}</h1>
          ${o.body}
        </td></tr>
        ${cta}
        ${note}
      </table>
    </td></tr>

    <tr><td style="padding:22px 8px 0;">
      <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">BizTrack — inventory, sales and profit for small businesses.</p>
      ${unsub}
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}

/** A bordered figure block, used by the weekly summary. */
export function statRow(label: string, value: string, color = BROWN): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid ${BORDER};font-family:${SANS};font-size:14px;color:${MUTED};">${escapeHtml(label)}</td>
    <td align="right" style="padding:9px 0;border-bottom:1px solid ${BORDER};font-family:${SANS};font-size:15px;font-weight:700;color:${color};">${escapeHtml(value)}</td>
  </tr>`;
}

export const COLORS = { BROWN, CREAM, MUTED, BORDER, RED, GREEN, SANS, SERIF };
