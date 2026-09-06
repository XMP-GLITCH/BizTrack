/**
 * Authentication.
 *
 * Email + password is the primary path, deliberately not magic links: on
 * Android a link often opens a different browser than the installed PWA, and
 * "the link logs me out" is a support burden that never ends. Google OAuth is
 * offered as the one-tap alternative.
 *
 * Every function degrades safely when no backend is configured, because the app
 * must keep working local-only -- that is how it ships to beta testers.
 */

import { supabase, isBackendConfigured } from "./supabase.js";

const NO_BACKEND = { data: null, error: { message: "Cloud sync isn't set up on this build." } };

/** Human-readable, actionable text for the errors people actually hit. */
export function describeAuthError(error) {
  if (!error) return null;
  const message = String(error.message || "");
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) return "That email and password don't match.";
  if (lower.includes("email not confirmed")) return "Check your inbox and confirm your email first.";
  if (lower.includes("user already registered")) return "That email already has an account. Try signing in.";
  if (lower.includes("password should be at least")) return "Use a password of at least 6 characters.";
  if (lower.includes("rate limit") || lower.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  // The offline case, which for this audience is routine rather than exceptional.
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("failed to fetch")) {
    return "No internet connection. You can keep working offline — this will sync later.";
  }
  return message || "Something went wrong. Please try again.";
}

export async function signUp({ email, password, displayName }) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.signUp({
    email: String(email || "").trim(),
    password,
    options: { data: { display_name: String(displayName || "").trim() || "Business Owner" } },
  });
}

export async function signIn({ email, password }) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password,
  });
}

export async function signInWithGoogle() {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

export async function sendPasswordReset(email) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.resetPasswordForEmail(String(email || "").trim(), {
    redirectTo: `${window.location.origin}/#reset`,
  });
}

export async function signOut() {
  if (!isBackendConfigured) return { error: null };
  return supabase.auth.signOut();
}

export async function getSession() {
  if (!isBackendConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

/** Subscribe to sign-in/sign-out. Returns an unsubscribe function. */
export function onAuthChange(handler) {
  if (!isBackendConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session));
  return () => data?.subscription?.unsubscribe();
}

/** The user's profile row, created for them by a trigger on signup. */
export async function fetchProfile(userId) {
  if (!isBackendConfigured || !userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, default_currency, low_stock_threshold, plan, trial_ends_at, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[BizTrack] Could not load profile:", error.message);
    return null;
  }
  return data;
}

export async function updateProfile(userId, patch) {
  if (!isBackendConfigured || !userId) return { error: null };
  return supabase.from("profiles").update(patch).eq("id", userId);
}

/**
 * Trial / plan state, evaluated against the server's own timestamps.
 *
 * An expired plan makes the app READ-ONLY. It never hides or withholds data:
 * everything stays visible and exportable, only new writes stop. Locking
 * someone out of their own books over a missed payment is the one thing that
 * would spread faster by word of mouth than the product itself.
 */
export function evaluatePlan(profile, now = new Date()) {
  if (!profile) return { canWrite: true, state: "local", daysLeft: null };

  const at = (v) => (v ? new Date(v) : null);
  const days = (d) => (d ? Math.ceil((d - now) / 86400000) : null);

  if (profile.plan === "active") {
    const expires = at(profile.plan_expires_at);
    if (!expires || expires > now) return { canWrite: true, state: "active", daysLeft: days(expires) };
    return { canWrite: false, state: "expired", daysLeft: 0 };
  }

  if (profile.plan === "trialing") {
    const ends = at(profile.trial_ends_at);
    if (ends && ends > now) return { canWrite: true, state: "trialing", daysLeft: days(ends) };
    return { canWrite: false, state: "trial_ended", daysLeft: 0 };
  }

  return { canWrite: false, state: "expired", daysLeft: 0 };
}
