import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client.
 *
 * The app must keep working with NO backend configured. That is how it ships to
 * beta testers today, and it is the fallback if the project is misconfigured --
 * a bookkeeping app that refuses to open because a cloud service is missing is
 * worse than one that quietly stays local. Every caller checks
 * `isBackendConfigured` and falls back to local-only behaviour.
 */

const url = import.meta.env?.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? "";

export const isBackendConfigured = Boolean(url && anonKey);

export const supabase = isBackendConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Needed for the OAuth redirect flow (Google sign-in) to complete.
        detectSessionInUrl: true,
      },
    })
  : null;

if (!isBackendConfigured && typeof console !== "undefined") {
  console.info("[BizTrack] No Supabase credentials found; running local-only.");
}
