/**
 * Crash and error capture.
 *
 * Answers "which part breaks" without a third-party error service. Stack traces
 * go through the same allowlist and scrubbing as every other event, because a
 * stack frame can carry a variable holding a customer's name or an amount.
 *
 * Deliberately never re-throws and never swallows the original handler: this
 * observes, it does not participate.
 */

import { track, flush } from "./analytics.js";

/** Trim to the top frames — the tail is framework noise and pure payload. */
const topFrames = (stack, n = 6) =>
  String(stack || "").split("\n").slice(0, n).join("\n").slice(0, 1500);

let installed = false;

export function installErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    // Resource load failures (a missing image) surface here too, with no
    // `error` object. They are not crashes and would drown the real ones.
    if (!e?.error && !e?.message) return;
    track("error.uncaught", {
      message: e.message || "unknown",
      stack: topFrames(e.error?.stack),
      file: String(e.filename || "").split("/").pop() || "",
      line: e.lineno || 0,
      column: e.colno || 0,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e?.reason;
    track("error.unhandled_rejection", {
      message: String(reason?.message || reason || "unknown"),
      stack: topFrames(reason?.stack),
    });
    // A rejected sync promise while offline is the common case here, and it is
    // expected behaviour rather than a defect. Recorded, not alarming.
  });

  // A crash is exactly when the queue is most likely to be lost, so push.
  window.addEventListener("error", flush);
}
