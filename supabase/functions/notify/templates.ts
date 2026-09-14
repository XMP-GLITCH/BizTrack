/**
 * One renderer per notification kind.
 *
 * Copy rules this product has already committed to, and which the wording here
 * has to keep honest:
 *
 *  * An expired plan makes the app READ-ONLY. It never hides, withholds or
 *    deletes anything, and everything stays exportable. Billing email that
 *    implies otherwise would be a lie, and the kind that spreads.
 *  * Annual is the hero price. Mobile-money auto-renewal is unreliable, so
 *    twelve monthly decisions are twelve chances to lose a happy customer.
 *  * These readers keep their only business records in this app. Alarm is
 *    cheap to cause and expensive to undo.
 */

import { COLORS, escapeHtml, formatMoney, p, shell, statRow } from "../_shared/render.ts";

const MONTHLY = "3,500 XAF / month";
const ANNUAL = "30,000 XAF / year";

export interface Ctx {
  displayName: string;
  appUrl: string;
  unsubscribeUrl: (category: "billing" | "alerts") => string;
}

export interface Rendered {
  subject: string;
  html: string;
}

type Payload = Record<string, unknown>;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function trialEnding(payload: Payload, ctx: Ctx): Rendered {
  const days = Math.max(0, Number(payload.days_left ?? 0));
  const when = days <= 1 ? "tomorrow" : `in ${days} ${plural(days, "day", "days")}`;

  return {
    subject: days <= 1
      ? "Your BizTrack trial ends tomorrow"
      : `Your BizTrack trial ends in ${days} days`,
    html: shell({
      preheader: `Keep writing to your books — your trial ends ${when}.`,
      heading: days <= 1 ? "Your trial ends tomorrow" : `Your trial ends ${when}`,
      body:
        p(`Your free month of BizTrack ends ${when}.`) +
        p(
          `After that the app becomes <strong>read-only</strong>. Every sale, item and figure stays exactly where it is — you can still open your books, search them and export them. Only recording <em>new</em> sales and stock stops until you subscribe.`,
        ) +
        p(`<strong style="color:${COLORS.BROWN};">${ANNUAL}</strong>, or ${MONTHLY}. The yearly price works out cheaper and saves renewing every month.`),
      ctaLabel: "Keep my books open",
      ctaUrl: `${ctx.appUrl}/#account`,
      footerNote: "Not ready yet? Nothing is lost. Your records wait for you, and subscribing later picks up exactly where you left off.",
      unsubscribeUrl: ctx.unsubscribeUrl("billing"),
    }),
  };
}

function trialEnded(_payload: Payload, ctx: Ctx): Rendered {
  return {
    subject: "Your BizTrack trial has ended",
    html: shell({
      preheader: "Your books are safe and still yours — recording new sales is paused.",
      heading: "Your trial has ended",
      body:
        p("Your free month is over, so BizTrack is now read-only.") +
        p(
          `<strong>Nothing has been deleted.</strong> Open the app and everything is still there — every sale, every item, every figure — and you can export all of it whenever you want. What is paused is recording new sales and stock.`,
        ) +
        p(`Subscribing turns writing back on immediately: <strong style="color:${COLORS.BROWN};">${ANNUAL}</strong>, or ${MONTHLY}.`),
      ctaLabel: "Start recording again",
      ctaUrl: `${ctx.appUrl}/#account`,
      footerNote: "Your records stay yours whether or not you subscribe. We will not delete them, and we will not hold them hostage.",
      unsubscribeUrl: ctx.unsubscribeUrl("billing"),
    }),
  };
}

function lowStock(payload: Payload, ctx: Ctx): Rendered {
  const business = String(payload.business_name ?? "your business");
  const items = Array.isArray(payload.items) ? payload.items : [];
  const shown = items.slice(0, 12) as Array<{ name?: string; on_hand?: number }>;

  const rows = shown
    .map((it) => {
      const n = Number(it.on_hand ?? 0);
      // Negative on-hand is legal here: overselling is allowed on purpose, and
      // this list is exactly where a reconciliation gets noticed.
      const label = n < 0 ? `${n} — check this` : String(n);
      return statRow(String(it.name ?? "Item"), label, n <= 0 ? COLORS.RED : COLORS.BROWN);
    })
    .join("");

  const more = items.length > shown.length
    ? p(`<span style="color:${COLORS.MUTED};font-size:13px;">and ${items.length - shown.length} more.</span>`)
    : "";

  return {
    subject: `Running low at ${business}`,
    html: shell({
      preheader: `${items.length} ${plural(items.length, "item is", "items are")} low or out of stock.`,
      heading: "Running low",
      body:
        p(`These are low or out of stock at <strong>${escapeHtml(business)}</strong>:`) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 14px;">${rows}</table>` +
        more,
      ctaLabel: "Restock now",
      ctaUrl: `${ctx.appUrl}/#inventory`,
      footerNote: "A negative number means more was sold than the books show in stock — worth reconciling when you have a moment.",
      unsubscribeUrl: ctx.unsubscribeUrl("alerts"),
    }),
  };
}

function weeklySummary(payload: Payload, ctx: Ctx): Rendered {
  const business = String(payload.business_name ?? "your business");
  const currency = String(payload.currency ?? "XAF");
  const revenue = Number(payload.revenue ?? 0);
  const cogs = Number(payload.cogs ?? 0);
  const profit = Number(payload.profit ?? 0);
  const units = Number(payload.units ?? 0);

  return {
    subject: `Last week at ${business}`,
    html: shell({
      preheader: `${formatMoney(profit, currency)} profit on ${units} ${plural(units, "sale", "sales")}.`,
      heading: "Your week",
      body:
        p(`Seven days at <strong>${escapeHtml(business)}</strong>.`) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
           ${statRow("Sold", `${units} ${plural(units, "item", "items")}`)}
           ${statRow("Revenue", formatMoney(revenue, currency))}
           ${statRow("Cost of what sold", formatMoney(cogs, currency))}
           ${statRow("Profit", formatMoney(profit, currency), profit >= 0 ? COLORS.GREEN : COLORS.RED)}
         </table>`,
      ctaLabel: "Open my books",
      ctaUrl: `${ctx.appUrl}/#stats`,
      footerNote: "Profit is what you sold minus what those goods cost you — not revenue.",
      unsubscribeUrl: ctx.unsubscribeUrl("alerts"),
    }),
  };
}

function newSignin(payload: Payload, ctx: Ctx): Rendered {
  const at = payload.signed_in_at ? new Date(String(payload.signed_in_at)) : new Date();
  const when = at.toUTCString().replace("GMT", "UTC");

  return {
    subject: "New sign-in to your BizTrack account",
    html: shell({
      preheader: "If this was you, nothing to do.",
      heading: "New sign-in",
      body:
        p(`Someone signed into your BizTrack account on <strong>${escapeHtml(when)}</strong>.`) +
        p("If that was you, there is nothing to do — this is just so you know.") +
        p(
          `If it was <strong style="color:${COLORS.RED};">not</strong> you, change your password now. Your records cannot be deleted from another device, but someone signed in could read them.`,
        ),
      ctaLabel: "Change my password",
      ctaUrl: `${ctx.appUrl}/#account`,
      // No unsubscribe link: this is the message a compromised account most
      // needs to reach its owner.
      footerNote: "Security emails cannot be turned off from here — this is the one message you would most want to receive.",
    }),
  };
}

const RENDERERS: Record<string, (p: Payload, c: Ctx) => Rendered> = {
  "billing.trial_ending": trialEnding,
  "billing.trial_ended": trialEnded,
  "alert.low_stock": lowStock,
  "alert.weekly_summary": weeklySummary,
  "security.new_signin": newSignin,
};

/** Null for an unknown kind, so the caller can fail that row without throwing. */
export function render(kind: string, payload: Payload, ctx: Ctx): Rendered | null {
  const fn = RENDERERS[kind];
  return fn ? fn(payload ?? {}, ctx) : null;
}
