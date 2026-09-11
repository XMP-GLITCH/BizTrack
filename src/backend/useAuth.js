import { useCallback, useEffect, useState } from "react";

import { isBackendConfigured } from "./supabase.js";
import { getSession, onAuthChange, fetchProfile, evaluatePlan } from "./auth.js";

/**
 * Session and plan state.
 *
 * Kept in React rather than the persisted store on purpose: supabase-js already
 * owns session storage and refresh, and duplicating it into our own persisted
 * blob is how you end up showing someone as signed in against a token that
 * expired days ago.
 *
 * `ready` starts false and becomes true once we know whether there is a
 * session, so the app can avoid flashing a sign-in screen at someone who is
 * already signed in.
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(!isBackendConfigured);

  useEffect(() => {
    if (!isBackendConfigured) return;
    let alive = true;

    getSession()
      .then((s) => { if (alive) { setSession(s); setReady(true); } })
      .catch(() => { if (alive) setReady(true); });

    const unsubscribe = onAuthChange((s) => {
      if (!alive) return;
      setSession(s);
      setReady(true);
    });

    return () => { alive = false; unsubscribe(); };
  }, []);

  const userId = session?.user?.id ?? null;

  const reloadProfile = useCallback(async () => {
    if (!userId) return null;
    const p = await fetchProfile(userId);
    setProfile(p);
    return p;
  }, [userId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!userId) { if (alive) setProfile(null); return; }
      const p = await fetchProfile(userId);
      if (alive) setProfile(p);
    })();
    return () => { alive = false; };
  }, [userId]);

  return {
    ready,
    session,
    userId,
    email: session?.user?.email ?? null,
    profile,
    reloadProfile,
    // No backend configured means local-only, which must never be read-only.
    plan: isBackendConfigured ? evaluatePlan(profile) : { canWrite: true, state: "local", daysLeft: null },
  };
}
