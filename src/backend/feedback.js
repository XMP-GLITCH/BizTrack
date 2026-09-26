/**
 * Feedback that actually reaches someone.
 *
 * What was here before said "Feedback sent! Thank you" and sent nothing. The
 * textarea was not even wired to state, so the words were never read by
 * anything. Someone typing a considered message was told it had gone and it
 * evaporated. That is the same shape as the Sign Out that did not sign out,
 * and worse in one way: the person ACTED on the claim and then waited.
 *
 * NOT through the analytics queue, deliberately. That pipe is allowlisted to
 * usage only and must never carry content; feedback is content by definition.
 * They are separate channels because they have opposite rules.
 *
 * Queued locally first, always. This audience is offline most of the time, and
 * a message that only sends when the network happens to be up is the same
 * broken promise wearing a different hat.
 */

import { supabase, isBackendConfigured } from "./supabase.js";

const QUEUE_KEY = "biztrack-feedback-queue";
/** Small on purpose: this is someone's words, not telemetry. If it ever fills,
 *  something is wrong that dropping messages would only hide. */
const MAX_QUEUED = 20;

function readQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUED)));
    return true;
  } catch {
    // The books share this quota. Failing to save feedback is a nuisance;
    // failing to save a sale is not, so this never throws upward.
    return false;
  }
}

export function queuedFeedbackCount() {
  return readQueue().length;
}

/**
 * Send everything waiting. Returns how many got through.
 *
 * Each row is deleted from the queue only after the insert succeeds, so a
 * failure halfway leaves the rest for next time rather than losing them.
 */
export async function flushFeedback() {
  if (!isBackendConfigured) return 0;
  const queue = readQueue();
  if (!queue.length) return 0;

  let sent = 0;
  const remaining = [];
  for (const item of queue) {
    try {
      const { error } = await supabase.from("feedback").insert({
        id: item.id,
        rating: item.rating ?? null,
        message: item.message ?? "",
        app_version: item.appVersion ?? "",
        created_at: item.createdAt,
      });
      // A duplicate is success that arrived earlier: a previous attempt landed
      // and the queue was not written before the app closed.
      if (error && error.code !== "23505") { remaining.push(item); continue; }
      sent += 1;
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return sent;
}

/**
 * Take a message and try to deliver it.
 *
 * Resolves with what ACTUALLY happened, because the caller has to say so:
 *   "sent"   it is on the server
 *   "queued" it is on this phone and will go when there is signal
 *   "failed" it could not even be saved, which the person must be told
 *
 * There is no fourth answer where the app claims success it cannot back.
 */
export async function sendFeedback({ rating = null, message = "", appVersion = "" } = {}) {
  const text = String(message || "").trim();
  if (!text && rating === null) return "empty";

  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    rating,
    message: text,
    appVersion,
    createdAt: new Date().toISOString(),
  };

  if (!writeQueue([...readQueue(), item])) return "failed";
  if (!isBackendConfigured) return "queued";

  // The queue write above is the durable part; the network is not. Waiting on
  // a request that may never answer leaves the button saying "Sending..." for
  // as long as the phone takes to give up, which on a weak connection is tens
  // of seconds, and this audience is on a weak connection most of the time.
  //
  // So the send is RACED against a short wait. Win and the person is told it
  // arrived; lose and they are told it is saved and will go later, which is
  // true either way because the flush carries on in the background and runs
  // again on the next launch and the next sync.
  const raced = await Promise.race([
    flushFeedback().then((n) => (n > 0 ? "sent" : "queued")),
    new Promise((resolve) => setTimeout(() => resolve("queued"), 2500)),
  ]);
  return raced;
}
