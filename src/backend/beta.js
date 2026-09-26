/**
 * The beta cap, and where the overflow goes.
 *
 * The cap is enforced by the SCREEN, not by the database, and the reason is in
 * the migration: `handle_new_user` runs after insert on `auth.users`, so by the
 * time any of our code sees a signup the account already exists. With Google
 * sign-in it exists before we are involved at all. A database that cannot
 * refuse can only stamp what someone gets; refusing has to happen before the
 * form is offered.
 *
 * So this asks first, and the answer decides which screen is drawn.
 */

import { supabase, isBackendConfigured } from "./supabase.js";
import { newId } from "../domain/ids.js";

/**
 * Are there places left?
 *
 * FAILS OPEN, and that is deliberate in the opposite direction to the database
 * function it calls. `beta_status()` answers "closed" when its settings row is
 * missing, because a half-applied migration should not let an uncapped cohort
 * in. Here, a NETWORK failure answers "open", because the alternative is
 * turning away a real person standing in front of the owner because their
 * phone could not reach Supabase for a second.
 *
 * The two are not in conflict: the server refuses when it knows something is
 * wrong, and the client refuses only when the server said so.
 */
export async function fetchBetaStatus() {
  if (!isBackendConfigured) return { open: false, full: false, left: null, known: false };
  try {
    const { data, error } = await supabase.rpc("beta_status");
    if (error || !data) return { open: true, full: false, left: null, known: false };
    return {
      open: Boolean(data.open),
      full: Boolean(data.full),
      left: typeof data.left === "number" ? data.left : null,
      known: true,
    };
  } catch {
    return { open: true, full: false, left: null, known: false };
  }
}

/**
 * Join the waitlist.
 *
 * Returns the same three-outcome shape the feedback box uses, because it obeys
 * the same rule: say what actually happened. There is no fourth outcome where
 * the app claims a success it cannot back.
 *
 * Unlike feedback this is NOT queued locally. Feedback is queued because it is
 * someone's considered words and losing them is a real loss; a waitlist address
 * typed by someone who has just been told the beta is full is worth nothing if
 * it sits on a phone the owner will never read. Better to say it did not send
 * and let them try again than to promise a place in a queue that exists only
 * on their own device.
 */
export async function joinWaitlist(email, source = "app") {
  const clean = String(email || "").trim().toLowerCase();
  // The same shape the database check enforces, so the two cannot disagree
  // about what an address is.
  if (clean.length < 3 || clean.length > 320 || clean.indexOf("@") < 1) {
    return { ok: false, reason: "invalid" };
  }
  if (!isBackendConfigured) return { ok: false, reason: "offline" };

  try {
    const { error } = await supabase
      .from("waitlist")
      .insert({ id: newId(), email: clean, source: String(source).slice(0, 40) });

    // 23505 is the unique index on the address. Tapping twice is not a failure
    // and must not be reported as one: they are on the list either way, which
    // is the only thing the person cares about.
    if (error && error.code !== "23505") return { ok: false, reason: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "offline" };
  }
}
