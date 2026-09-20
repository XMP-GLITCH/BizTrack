import { useCallback, useEffect, useRef, useState } from "react";

import { useStore } from "../store/useStore.js";
import { isBackendConfigured } from "./supabase.js";
import { syncOnce } from "./sync.js";
import { pushPhotos } from "./photoSync.js";
import { flushFeedback } from "./feedback.js";

/**
 * Drives the sync loop.
 *
 * Triggers are deliberately sparse: on sign-in, when the tab regains focus, and
 * a slow interval. There is no sync-on-every-keystroke, because every request
 * costs the user money on metered data. Failures are silent by design -- being
 * offline is the normal state here, not an error worth interrupting someone
 * mid-sale to report.
 */
const INTERVAL_MS = 5 * 60 * 1000;

export function useSync(userId, { paused = false } = {}) {
  // idle | syncing | synced | offline | failed. `failed` is NOT `offline`:
  // one is a dead network, the other is the server refusing or our own code
  // throwing, and conflating them is what hid a total outage for days.
  const [status, setStatus] = useState("idle");
  const [lastError, setLastError] = useState(null);
  const running = useRef(false);

  const run = useCallback(async () => {
    // `paused` is how the claim flow holds the loop while the user decides what
    // should happen to books already on this device. Pushing first and asking
    // afterwards would make the question meaningless.
    if (!isBackendConfigured || !userId || paused || running.current) return;
    running.current = true;
    setStatus("syncing");

    const { businesses, lastPushedAt, lastPulledAt, replaceBusinesses, setSyncCursors } = useStore.getState();
    const result = await syncOnce({ businesses, userId, lastPushedAt, lastPulledAt });

    if (result.ok) {
      // Merge before cursors: if writing state throws, the cursors stay put and
      // the next attempt re-pulls rather than skipping data.
      replaceBusinesses(result.businesses);
      setSyncCursors({ lastPushedAt: result.lastPushedAt, lastPulledAt: result.lastPulledAt });
      setStatus("synced");
      setLastError(null);

      // AFTER the ledger, never before, and never gating it. Photos are large
      // and the books are what the trial and the whole product are about, so a
      // slow or failing photo upload must not delay or break a sale reaching
      // the server. It is also not awaited into the status: `status` means
      // "are my books safe", and a pending photo should not make it say no.
      pushPhotos(userId);
      // Cheap, and this is the moment we know there is a connection.
      flushFeedback();
    } else {
      setStatus(result.reason === "offline" ? "offline" : "failed");
      setLastError(result.error ?? null);
    }
    running.current = false;
  }, [userId, paused]);

  useEffect(() => {
    if (!isBackendConfigured || !userId || paused) return;

    // Deferred rather than immediate: the first sync should not compete with
    // first paint on a low-end phone, and it keeps setState out of the effect
    // body where it would cascade renders.
    const initial = setTimeout(run, 800);

    const onFocus = () => { if (document.visibilityState === "visible") run(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = setInterval(run, INTERVAL_MS);

    return () => {
      clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(timer);
    };
  }, [userId, paused, run]);

  return { status, lastError, syncNow: run };
}
