/**
 * Authentication.
 *
 * Email + password is the primary path, deliberately not magic links: on
 * Android a link often opens a different browser than the installed PWA, and
 * "the link logs me out" is a support burden that never ends. Google and Apple
 * OAuth are offered as the one-tap alternatives.
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
  // Hit when the provider is wired up in code but not switched on in the
  // Supabase dashboard -- the likeliest failure on a fresh project.
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) {
    return "That sign-in option isn't switched on yet. Use your email and password for now.";
  }
  if (lower.includes("access_denied") || lower.includes("cancelled") || lower.includes("canceled")) {
    return "Sign-in was cancelled.";
  }
  if (lower.includes("token has expired") || lower.includes("invalid token") || lower.includes("otp_expired")) {
    return "That code has expired or isn't right. Ask for a new one below.";
  }
  // The offline case, which for this audience is routine rather than exceptional.
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("failed to fetch")) {
    return "No internet connection. You can keep working offline — this will sync later.";
  }
  return message || "Something went wrong. Please try again.";
}

/**
 * `acceptedLegalVersion` is stored on the user's metadata rather than being
 * assumed. Consent that cannot be evidenced is not much use in a dispute, and
 * knowing WHICH version was accepted is what makes it possible to ask people to
 * re-accept a materially changed policy without nagging everyone over a typo.
 */
export async function signUp({ email, password, displayName, acceptedLegalVersion }) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.signUp({
    email: String(email || "").trim(),
    password,
    options: {
      data: {
        display_name: String(displayName || "").trim() || "Business Owner",
        accepted_legal_version: acceptedLegalVersion ?? null,
        accepted_legal_at: acceptedLegalVersion ? new Date().toISOString() : null,
      },
    },
  });
}

export async function signIn({ email, password }) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password,
  });
}

/**
 * OAuth sign-in.
 *
 * One tap is worth more here than on a desktop product: this audience types on
 * phone keyboards over metered data, and a forgotten password turns into a
 * WhatsApp support conversation rather than a self-service reset.
 *
 * `redirectTo` is the app's own origin so an installed PWA returns to itself.
 * Every origin that ships must also be listed in the dashboard's redirect
 * allowlist, or the provider bounces the user to a blank page with no error.
 */
export async function signInWithProvider(provider, options = {}) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin, ...options },
  });
}

export async function signInWithGoogle() {
  return signInWithProvider("google");
}

/**
 * Apple returns the user's name ONLY on the first authorization, and only when
 * the scopes ask for it. Miss that one response and the name is unrecoverable
 * through the API -- hence requesting it here, even though the profile trigger
 * falls back to "Business Owner".
 */
export async function signInWithApple() {
  return signInWithProvider("apple", { scopes: "name email" });
}

/**
 * Verify a numeric code from an email.
 *
 * The same token Supabase puts behind the link in its emails is also issued as
 * a code, and this exchanges it for a session. That matters more here than the
 * link does: on Android the link frequently opens a browser that is not the
 * installed PWA, so the session lands somewhere the user cannot see it. Typing
 * the code into the app they already have open always works. The LENGTH is a
 * Supabase setting and can change, so nothing here assumes one.
 *
 * `type` is 'signup' after registering, 'recovery' after a password reset, or
 * 'email' for a magic link.
 */
export async function verifyEmailCode({ email, token, type = "email" }) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.verifyOtp({
    email: String(email || "").trim(),
    // People paste "337 509" or "337-509" from a notification shade.
    token: String(token || "").replace(/\D/g, ""),
    type,
  });
}

/** A fresh confirmation email, when the first never arrived. */
export async function resendConfirmation(email) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.resend({ type: "signup", email: String(email || "").trim() });
}

/**
 * Set a new password. Requires a session, which is exactly what verifying a
 * 'recovery' code just produced -- so the reset flow finishes inside the app
 * rather than on a web page the user may never reach.
 */
export async function setNewPassword(password) {
  if (!isBackendConfigured) return NO_BACKEND;
  return supabase.auth.updateUser({ password });
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

/**
 * Delete the account and everything in the cloud database.
 *
 * Calls a privileged Edge Function, because a client cannot delete its own auth
 * user. The function identifies the caller from this session's token, so there
 * is nothing to pass and nothing to spoof.
 *
 * This deletes the SERVER copy. Records on this device are deliberately left
 * alone -- they may be the only copy the person has, and destroying them from
 * a "delete my account" button is the one thing this product promised not to
 * do. The caller is responsible for saying so before asking to confirm.
 */
export async function deleteAccount() {
  if (!isBackendConfigured) return { error: { message: "No account is set up on this build." } };

  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { error: { message: "You are not signed in." } };

  const url = `${import.meta.env?.VITE_SUPABASE_URL ?? ""}/functions/v1/delete-account`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env?.VITE_SUPABASE_ANON_KEY ?? "",
        "content-type": "application/json",
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: { message: body?.error || `Deletion failed (${res.status}).` } };

    // The user is gone; the local session is now meaningless.
    await supabase.auth.signOut();
    return { error: null };
  } catch (err) {
    return { error: { message: `Could not reach the server: ${err.message}` } };
  }
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
