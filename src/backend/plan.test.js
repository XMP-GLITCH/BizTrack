import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePlan } from "./auth.js";

/**
 * The gate the commercial model rests on.
 *
 * Until 19 September this function was computed and thrown away: nothing in the
 * interface read `canWrite`, so the Terms promised a read-only state the app
 * did not have. Now `setModal` refuses every write sheet when this says no,
 * which makes these the assertions that decide whether anyone can record a
 * sale.
 */

const NOW = new Date("2026-09-19T12:00:00.000Z");
const at = (days) => new Date(NOW.getTime() + days * 86400000).toISOString();

test("the BETA state is writable with no expiry", () => {
  // This is what 50 beta accounts are stamped with: active, and no
  // `plan_expires_at` at all. If this ever returns canWrite false, every beta
  // user loses the ability to record a sale at once.
  const p = evaluatePlan({ plan: "active", plan_expires_at: null }, NOW);
  assert.equal(p.canWrite, true);
  assert.equal(p.state, "active");
  assert.equal(p.daysLeft, null);
});

test("an active plan is writable until its expiry, and not after", () => {
  assert.equal(evaluatePlan({ plan: "active", plan_expires_at: at(3) }, NOW).canWrite, true);
  const gone = evaluatePlan({ plan: "active", plan_expires_at: at(-1) }, NOW);
  assert.equal(gone.canWrite, false);
  assert.equal(gone.state, "expired");
});

test("a trial is writable while it runs and read-only once it has passed", () => {
  const live = evaluatePlan({ plan: "trialing", trial_ends_at: at(5) }, NOW);
  assert.equal(live.canWrite, true);
  assert.equal(live.state, "trialing");
  assert.equal(live.daysLeft, 5);

  const done = evaluatePlan({ plan: "trialing", trial_ends_at: at(-1) }, NOW);
  assert.equal(done.canWrite, false);
  assert.equal(done.state, "trial_ended");
});

test("daysLeft rounds UP, so a trial with hours left never reads as zero", () => {
  // "0 days left" on a trial that is still running would be the app telling
  // someone they had already lost something they still have. Home shows this
  // figure from seven days out.
  const p = evaluatePlan({ plan: "trialing", trial_ends_at: at(0.4) }, NOW);
  assert.equal(p.canWrite, true);
  assert.equal(p.daysLeft, 1);
});

test("an expired plan is read-only", () => {
  const p = evaluatePlan({ plan: "expired" }, NOW);
  assert.equal(p.canWrite, false);
  assert.equal(p.state, "expired");
});

test("NO PROFILE FAILS OPEN, and that is deliberate", () => {
  // A signed-in user whose profile fetch did not complete -- offline, a slow
  // connection, a server hiccup -- arrives here with null. Failing CLOSED would
  // make the app refuse to record a sale because of a network error, which is
  // locking someone out of their own books for a reason that has nothing to do
  // with whether they have paid. That is the one thing this project has said
  // repeatedly it will never do.
  //
  // Do not "harden" this. The gate is a courtesy backed by a conversation, not
  // a lock, and the database is deliberately not enforcing it either.
  const p = evaluatePlan(null, NOW);
  assert.equal(p.canWrite, true);
  assert.equal(p.state, "local");
});

test("an unknown plan value is read-only rather than writable", () => {
  // The column has a check constraint, so this is defence against a future
  // value arriving from a newer client, not against corruption. Unknown means
  // "this client does not understand your plan", and guessing writable there
  // would be guessing in the direction that costs money.
  const p = evaluatePlan({ plan: "something_new" }, NOW);
  assert.equal(p.canWrite, false);
});
