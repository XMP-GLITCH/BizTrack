/**
 * Product analytics.
 *
 * Built first-party against the Supabase project already in use, rather than
 * pulling in PostHog or similar. Three reasons, in order of weight:
 *
 *  1. Bundle. The bundle is already 859 KB and the open plan is to cut it. A
 *     hosted SDK is 50 KB+ gzipped of new weight on a low-end Android over
 *     metered data, to answer questions a table can answer.
 *  2. Offline. Every hosted SDK assumes a connection and drops what it cannot
 *     send. Here, being offline for hours is the normal case, so the queue is
 *     durable and flushes when the network returns -- the same reasoning that
 *     shaped the sync layer.
 *  3. Legal surface. One more processor means one more cross-border transfer
 *     to disclose and one more DPA to hold. The data already lives in Supabase.
 *
 * WHAT THIS MUST NEVER SEND: business content. No item names, no sale amounts,
 * no customer details, no business names. `sanitizeProps` enforces that with an
 * allowlist rather than trusting call sites, because a call site added in six
 * months will not remember the rule.
 */

import { supabase, isBackendConfigured } from "../backend/supabase.js";

const QUEUE_KEY = "biztrack-analytics-queue";
const CONSENT_KEY = "biztrack-analytics-consent";
const SESSION_KEY = "biztrack-analytics-session";

/** Dropped oldest-first beyond this, so a long offline stretch cannot fill storage. */
const MAX_QUEUE = 400;
const BATCH = 50;
const FLUSH_EVERY_MS = 30_000;

/**
 * Prop keys allowed to leave the device. Anything not listed is dropped
 * silently. Adding a key here is a deliberate act; ask whether it could ever
 * carry a name, an amount, or a note someone typed.
 */
const ALLOWED_PROPS = new Set([
  "screen", "from", "to", "tab", "modal", "source",
  "count", "ms", "index", "days",
  "ok", "offline", "first_run",
  "kind", "reason", "provider", "currency", "plan",
  "message", "stack", "line", "column", "file",
]);

/** Strings that look like an address or a long number never leave. */
const scrubText = (s) =>
  String(s)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .slice(0, 500);

function sanitizeProps(props) {
  const out = {};
  for (const [key, value] of Object.entries(props || {})) {
    if (!ALLOWED_PROPS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = scrubText(value);
    // Objects and arrays are refused outright: they are how nested business
    // data would get in without anyone noticing.
  }
  return out;
}

/* ── consent ──────────────────────────────────────────────────────────────── */

/** null = never asked. Nothing is collected until this is explicitly true. */
export function getConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw === null ? null : raw === "true";
  } catch {
    return null;
  }
}

export function setConsent(allowed) {
  try {
    localStorage.setItem(CONSENT_KEY, allowed ? "true" : "false");
    // Withdrawing consent must discard what has not yet been sent. Keeping a
    // queue to flush "just this last batch" would make the opt-out a lie.
    if (!allowed) localStorage.removeItem(QUEUE_KEY);
  } catch { /* storage unavailable; treated as no consent */ }
}

/* ── queue ────────────────────────────────────────────────────────────────── */

const readQueue = () => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (rows) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-MAX_QUEUE)));
  } catch { /* full or unavailable: telemetry is never worth breaking the app */ }
};

function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
}

let appVersion = "";
export function setAppVersion(v) { appVersion = String(v || "").slice(0, 32); }

/**
 * Record an event. Never throws, never awaits, never blocks a user action.
 * Analytics failing must be invisible; the alternative is a bookkeeping app
 * that will not record a sale because a telemetry call failed.
 */
export function track(event, props = {}) {
  try {
    if (getConsent() !== true) return;
    if (!isBackendConfigured) return;

    const rows = readQueue();
    rows.push({
      session_id: sessionId(),
      event: String(event).slice(0, 64),
      props: sanitizeProps(props),
      app_version: appVersion,
      occurred_at: new Date().toISOString(),
    });
    writeQueue(rows);
  } catch { /* ignore */ }
}

let flushing = false;

/**
 * Send what is queued. Rows are only dropped once the insert has succeeded, so
 * a failure mid-flight replays rather than disappears.
 */
export async function flush() {
  if (flushing) return;
  if (getConsent() !== true || !isBackendConfigured) return;

  const rows = readQueue();
  if (!rows.length) return;

  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data?.session?.user?.id;
    // Only signed-in users may insert, per RLS. Anonymous users keep their
    // queue rather than losing it -- they may sign in later.
    if (!userId) return;

    const batch = rows.slice(0, BATCH);
    const { error } = await supabase
      .from("analytics_events")
      .insert(batch.map((r) => ({ ...r, user_id: userId })));

    if (error) return; // offline or rejected: keep the queue and retry later
    writeQueue(rows.slice(batch.length));
  } catch {
    /* keep the queue */
  } finally {
    flushing = false;
  }
}

let started = false;

/** Wire up periodic and lifecycle flushes. Safe to call more than once. */
export function startAnalytics() {
  if (started || typeof window === "undefined") return;
  started = true;

  setInterval(flush, FLUSH_EVERY_MS);

  // The reliable moment on mobile: 'beforeunload' frequently never fires when
  // a phone backgrounds or kills the tab, but visibilitychange does.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  window.addEventListener("online", flush);
}
