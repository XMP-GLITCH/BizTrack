import { useCallback, useEffect, useRef, useState } from "react";

import { useStore } from "../store/useStore.js";
import { isBackendConfigured } from "./supabase.js";
import { inspectRemote, savePreClaimBackup, summarizeLocal } from "./claim.js";

/**
 * Decides whether this device needs to be asked before its books meet an
 * account, and holds the answer.
 *
 * Only ever relevant on the FIRST sync for an account on this device, which is
 * exactly what a null push cursor means. After that, ordinary merge rules apply
 * and asking again would be noise.
 *
 * Nothing here syncs. It gates: while `needed` is true the caller must not run
 * the sync loop, because the whole point is that the user has not yet said what
 * should happen.
 */
export function useClaim(userId) {
  // checking | needed | resolved | not-needed
  // Resolved up front for a build with no backend, so the effect never has to
  // set state synchronously to reach the same answer.
  const [state, setState] = useState(isBackendConfigured ? "checking" : "not-needed");
  const [remote, setRemote] = useState(null);
  const [local, setLocal] = useState(null);
  const asked = useRef(false);

  useEffect(() => {
    // No user yet: nothing to claim into. State stays "checking", which pauses
    // a sync loop that could not run without a user id anyway.
    if (!isBackendConfigured || !userId) return;
    if (asked.current) return;
    asked.current = true;

    let cancelled = false;

    // Deferred for the same reason as the sync loop: this must not compete with
    // first paint on a low-end phone, and it keeps setState out of the effect
    // body where it would cascade renders.
    const timer = setTimeout(async () => {
      const { businesses, lastPushedAt } = useStore.getState();
      const localSummary = summarizeLocal(businesses);

      // Already synced once on this device, or nothing here to claim.
      if (lastPushedAt || localSummary.businesses === 0) {
        if (!cancelled) setState("not-needed");
        return;
      }

      const remoteSummary = await inspectRemote();

      // Unknown is NOT empty. Offline, or the schema is missing: say nothing,
      // change nothing, and ask again next launch. Guessing "empty" here would
      // let a merge prompt become silent data loss.
      if (!remoteSummary) {
        if (!cancelled) setState("not-needed");
        return;
      }

      if (cancelled) return;
      setLocal(localSummary);
      setRemote(remoteSummary);
      setState("needed");
    }, 900);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [userId]);

  /**
   * Record the decision. `merge` keeps everything from both sides, which is
   * what the ordinary sync already does — so the work here is the backup and
   * getting out of the way.
   *
   * `adopt` sets this device's books aside and takes the account's instead. The
   * backup is not optional for it: if the snapshot cannot be written, the
   * choice is refused rather than performed unsafely.
   */
  const resolve = useCallback((strategy) => {
    const { businesses, replaceBusinesses, resetSyncCursors } = useStore.getState();

    const saved = savePreClaimBackup(businesses);

    if (strategy === "adopt") {
      if (!saved) return { ok: false, error: "Could not save a safety copy, so nothing was changed. Free up some space and try again." };
      replaceBusinesses([]);
      resetSyncCursors();
    }

    setState("resolved");
    return { ok: true };
  }, []);

  return {
    /** True while the user still has to choose. The sync loop must wait. */
    needed: state === "needed",
    checking: state === "checking",
    remote,
    local,
    resolve,
  };
}
