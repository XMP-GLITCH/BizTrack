import { useState, useEffect } from "react";

import { fetchBetaStatus, joinWaitlist } from "../backend/beta.js";
import { Store, Loader, Check } from "lucide-react";

import {
  signUp, signIn, sendPasswordReset, describeAuthError, signInWithGoogle,
  verifyEmailCode, resendConfirmation, setNewPassword, hasSignedInBefore,
} from "../backend/auth.js";
import { DOCUMENTS, LEGAL_VERSION } from "../legal/documents.js";
import LegalScreen from "./LegalScreen.jsx";

/**
 * Google's mark, inline because lucide-react carries no trademarked logos.
 * Their guidelines require the four-colour G at its published geometry, so it
 * is reproduced rather than redrawn or recoloured.
 */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.9 35.6 44 30.4 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

/** One minute between requests, matching Supabase's own send throttle. */
const RESEND_COOLDOWN_MS = 60_000;

/**
 * Sign in / sign up.
 *
 * Email and password rather than magic-link-only: on Android a link often opens
 * a different browser than the installed PWA, and "the link signs me out" is a
 * support burden with no end.
 *
 * The same reasoning is why `verify` exists. Every email we send carries a
 * numeric code next to its button, and this screen is where that code is
 * spent, so confirming an address or resetting a password can be finished
 * inside the app the user already has open, without depending on a link
 * landing in the right browser.
 *
 * Errors are shown in plain language, and being offline is presented as a
 * normal condition rather than a failure, because for these users intermittent
 * data is the default.
 */
export default function AuthScreen({ styles: S }) {
  // signin | signup | reset | verify | newpassword
  //
  // A device that has never had a session almost certainly belongs to someone
  // without an account, so it opens on "Create your account". Showing a
  // sign-in form first asked the wrong question and nudged new users towards
  // Google from the sign-in tab -- the one path that made an account without
  // showing them the terms.
  const [mode, setMode] = useState(() => (hasSignedInBefore() ? "signin" : "signup"));

  // Places left in the beta. Null while unknown, which is a THIRD state and
  // not a synonym for full: the form renders normally until the server has
  // actually said otherwise, because turning someone away on a slow connection
  // is the one failure here that costs a real person.
  const [beta, setBeta] = useState(null);
  const [wlEmail, setWlEmail] = useState("");
  const [wlBusy, setWlBusy] = useState(false);
  const [wlDone, setWlDone] = useState(false);
  const [wlError, setWlError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchBetaStatus().then((b) => { if (alive) setBeta(b); });
    return () => { alive = false; };
  }, []);

  // The landing page in `index.html` is plain markup outside React, and it is
  // dismissed AFTER this component has already mounted underneath it. So its
  // "I already have an account" button cannot be a prop and cannot be read in
  // the initialiser above: by the time it is tapped, that has long run.
  //
  // It said one thing and did another until this existed -- both landing
  // buttons dropped you on "Create your account" -- which is the plainest kind
  // of broken control.
  useEffect(() => {
    const onMode = (e) => {
      const next = e.detail;
      if (next === "signin" || next === "signup") setMode(next);
    };
    window.addEventListener("bt-auth-mode", onMode);
    return () => window.removeEventListener("bt-auth-mode", onMode);
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [oauthBusy, setOauthBusy] = useState(null);
  // Which kind of code we are waiting on: 'signup' or 'recovery'.
  const [pendingType, setPendingType] = useState("signup");
  // Timestamp rather than a ticking counter: a countdown would need an interval
  // and a re-render every second to show it, for a number nobody watches.
  const [lastSentAt, setLastSentAt] = useState(0);
  // Clickwrap: ticked deliberately, not inferred from a button press.
  const [accepted, setAccepted] = useState(false);
  // Shows a policy without leaving the screen. These users are often on
  // expensive data and a link out is a policy most will never open.
  const [legalDoc, setLegalDoc] = useState(null);

  const clear = () => { setError(null); setNotice(null); };
  const go = (next) => { setMode(next); clear(); };

  const submit = async (e) => {
    e?.preventDefault();
    clear();

    if (mode === "verify") {
      // Supabase decides the OTP length, and it is a dashboard setting that can
      // change under us. Only the minimum is enforced here; the server is what
      // actually validates the code.
      if (code.replace(/\D/g, "").length < 6) return setError("Enter the full code from your email.");
    } else if (mode === "newpassword") {
      if (password.length < 6) return setError("Use a password of at least 6 characters.");
    } else {
      if (!email.trim()) return setError("Enter your email address.");
      if (mode !== "reset" && password.length < 6) {
        return setError("Use a password of at least 6 characters.");
      }
      if (mode === "signup" && !name.trim()) return setError("What should we call you?");
      if (mode === "signup" && !accepted) {
        return setError("Please accept the Terms and Privacy Policy to create an account.");
      }
    }

    setBusy(true);
    try {
      if (mode === "verify") {
        const { data, error: err } = await verifyEmailCode({ email, token: code, type: pendingType });
        if (err) setError(describeAuthError(err));
        else if (pendingType === "recovery") {
          // Verifying a recovery code signs them in, which is exactly the
          // session updateUser needs. Collect the new password here rather
          // than sending them to a web page they may never open.
          setPassword("");
          go("newpassword");
        } else if (!data?.session) {
          setError("That code was accepted but no session came back. Try signing in.");
        }
        // On success with a session, App sees it and this screen unmounts.

      } else if (mode === "newpassword") {
        const { error: err } = await setNewPassword(password);
        if (err) setError(describeAuthError(err));
        else setNotice("Password changed. You're signed in.");

      } else if (mode === "reset") {
        const { error: err } = await sendPasswordReset(email);
        if (err) setError(describeAuthError(err));
        else {
          setLastSentAt(Date.now());
          setPendingType("recovery");
          setCode("");
          go("verify");
        }

      } else if (mode === "signup") {
        const { data, error: err } = await signUp({ email, password, displayName: name, acceptedLegalVersion: LEGAL_VERSION });

        // Supabase deliberately does NOT reveal that an address is already
        // registered: it returns 200, a decoy user id, a confirmation_sent_at
        // that is not true, and no error -- so an attacker cannot discover who
        // has an account. The one honest signal is an empty identities array.
        //
        // Without this check the app believed the signup and sent the user to
        // wait for a code that was never going to arrive. That is where a real
        // user got stuck: she already had an account from signing in with
        // Google, tried to create one with the same address, and sat on the
        // verify screen indefinitely.
        const alreadyRegistered =
          !err && Array.isArray(data?.user?.identities) && data.user.identities.length === 0;

        if (alreadyRegistered) {
          setPassword("");
          go("signin");
          setNotice("You already have an account with this email. Sign in instead. If you used Google before, tap Continue with Google.");
        } else if (err) setError(describeAuthError(err));
        else if (!data?.session) {
          // Confirmation is on. Go straight to the code rather than telling
          // them to check their email and leaving them on a dead form.
          setLastSentAt(Date.now());
          setPendingType("signup");
          setCode("");
          go("verify");
        }

      } else {
        const { error: err } = await signIn({ email, password });
        if (err) {
          // An unconfirmed address is not really an error, it is an unfinished
          // sign-up. Send them to the code instead of a dead end.
          if (String(err.message || "").toLowerCase().includes("email not confirmed")) {
            // Send a FRESH code rather than pointing at one that may not exist.
            //
            // This used to say "enter the code we sent you" and send nothing,
            // which is a dead end for the person most likely to arrive here:
            // someone whose original email never came, or came so long ago the
            // code has expired. They would face a screen demanding a code they
            // do not have, with no way forward.
            setPendingType("signup");
            setCode("");
            go("verify");

            const { error: resendErr } = await resendConfirmation(email);
            if (resendErr) {
              setError(describeAuthError(resendErr));
            } else {
              setLastSentAt(Date.now());
              setNotice("Your email isn't confirmed yet. We've just sent you a new code.");
            }
          } else {
            setError(describeAuthError(err));
          }
        }
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    clear();
    const waited = Date.now() - lastSentAt;
    if (waited < RESEND_COOLDOWN_MS) {
      const secs = Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000);
      return setNotice(`Hang on, you can ask for another code in ${secs}s.`);
    }

    setBusy(true);
    try {
      const { error: err } = pendingType === "recovery"
        ? await sendPasswordReset(email)
        : await resendConfirmation(email);
      if (err) setError(describeAuthError(err));
      else {
        setLastSentAt(Date.now());
        setNotice("Sent. It can take a minute to arrive.");
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * On success the browser leaves for the provider, so this component unmounts
   * mid-call and the spinner never needs clearing. Only the failure paths
   * restore the buttons -- clearing state unconditionally would flash the form
   * back to life for an instant on the way out.
   */
  const oauth = async (provider, start) => {
    clear();
    if (mode === "signup" && !accepted) {
      return setError("Please accept the Terms and Privacy Policy first.");
    }
    setOauthBusy(provider);
    try {
      const { error: err } = await start();
      if (err) {
        setError(describeAuthError(err));
        setOauthBusy(null);
      }
    } catch (err) {
      setError(describeAuthError(err));
      setOauthBusy(null);
    }
  };

  /**
   * Padding and inline-block give these a tappable area. Twelve-pixel inline
   * text is under every touch-target guideline, and this is the one link a
   * regulator would ask whether the user could realistically have read.
   */
  const legalLinkStyle = {
    background: "none",
    border: "none",
    padding: "3px 1px",
    margin: 0,
    display: "inline-block",
    color: "rgba(255,255,255,0.75)",
    textDecoration: "underline",
    cursor: "pointer",
    font: "inherit",
    lineHeight: 1.4,
  };

  const field = {
    ...S.input,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "#FAF8F4",
  };

  // In signup mode the provider buttons are gated on consent. That gate has to
  // be visible before the tap: a big button that silently refuses, with the
  // reason in small red text above the fold, reads as a broken button.
  // Still used to dim the Google button, which is honest: it says the control
  // is not ready without explaining a rule nobody has broken yet.
  const oauthGated = mode === "signup" && !accepted;

  // Deliberately one tier below the form's own button, and it took measuring to
  // see why it had not been. The translucent fill made it look secondary, but it
  // spread `primaryBtn`, so it was the same full width at the same 16/600 in a
  // box within two pixels of the same height. Two controls of identical
  // footprint read as peers whatever colour they are, which left the screen
  // with two primaries and no single way forward. It steps down to the 14px
  // body size and a shorter box, still 46px and well over the 44px target.
  const oauthBtn = {
    ...S.primaryBtn,
    marginTop: 0,
    padding: "14px",
    fontSize: 14,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "#FAF8F4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    opacity: busy || oauthBusy || oauthGated ? 0.5 : 1,
  };

  const title = {
    signup: "Create your account",
    reset: "Reset your password",
    verify: "Check your email",
    newpassword: "Choose a new password",
    signin: "Welcome back",
  }[mode];

  const subtitle = {
    signup: "Your books are backed up and follow you to any device.",
    reset: "We'll send a code and a link to set a new password.",
    verify: `We sent a code to ${email || "your email"}.`,
    newpassword: "Pick something you'll remember on a small keyboard.",
    signin: "Sign in to reach your businesses.",
  }[mode];

  const cta = {
    signup: "Create account",
    reset: "Send me a code",
    verify: "Confirm",
    newpassword: "Save new password",
    signin: "Sign in",
  }[mode];

  const showOAuth = mode === "signin" || mode === "signup";

  if (legalDoc) {
    return (
      <div style={{ ...S.shell }}>
        <LegalScreen styles={S} doc={DOCUMENTS[legalDoc]} onBack={() => setLegalDoc(null)} />
      </div>
    );
  }

  /**
   * The beta is full, and someone is trying to CREATE an account.
   *
   * Only that combination. Signing in still works, and has to: turning away an
   * existing user because a cohort they are already in is full would be the
   * worst thing this screen could do.
   *
   * The cap lives here rather than in the database because the database cannot
   * enforce it. `handle_new_user` runs AFTER insert on auth.users, so by then
   * the account exists; with Google it exists before any of our code runs.
   * A screen that never offers the form is the only refusal available.
   *
   * ONE HOLE, KNOWN AND ACCEPTED: "Continue with Google" from the SIGN IN tab
   * cannot tell a returning user from a new one, so a determined new person can
   * still get an account that way. They get a normal trialing profile rather
   * than a beta one. Closing it would mean removing Google sign-in from
   * everybody who already uses it, to stop a leak of a few against fifty.
   */
  if (beta && (beta.full || !beta.open) && mode === "signup") {
    const joinList = async (e) => {
      e.preventDefault();
      setWlError(null);
      setWlBusy(true);
      const res = await joinWaitlist(wlEmail, "wall");
      setWlBusy(false);
      if (res.ok) return setWlDone(true);
      setWlError(
        res.reason === "invalid" ? "That does not look like an email address."
          : res.reason === "offline" ? "No connection. Try again when you have signal."
          : "That could not be saved. Try again in a moment."
      );
    };

    return (
      <div style={{ ...S.shell, background: "#2C1810", color: "#FAF8F4" }}>
        <div style={{ ...S.phone, background: "#2C1810", justifyContent: "center", padding: 32 }} className="bt-focus">
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.08)", width: 68, height: 68, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
              <Store size={34} color="#FAF8F4" />
            </div>
            <h1 style={{ ...S.userName, color: "#FAF8F4", fontSize: 26, marginBottom: 6 }}>
              {wlDone ? "You are on the list" : "The beta is full"}
            </h1>
            <p style={{ ...S.greeting, color: "rgba(255,255,255,0.65)" }}>
              {wlDone
                ? "We will write to you the moment BizTrack opens properly."
                : "We are taking 50 people in and those places are taken. Leave your email and we will tell you when BizTrack opens properly."}
            </p>
          </div>

          {!wlDone && (
            <form onSubmit={joinList} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                style={field}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={wlEmail}
                onChange={(e) => setWlEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Your email"
              />
              {wlError && <p style={S.formErrorDark}>{wlError}</p>}
              <button type="submit" style={S.primaryBtn} disabled={wlBusy}>
                {wlBusy ? "Saving..." : "Tell me when it opens"}
              </button>
            </form>
          )}

          <div style={{ marginTop: 32, textAlign: "center" }}>
            {/* Always. Someone already in the beta must be able to reach their
                own books from a screen that has just said it is full. */}
            <button type="button" style={{ ...S.textBtn, color: "rgba(255,255,255,0.85)" }} onClick={() => go("signin")}>
              Already have an account? Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.shell, background: "#2C1810", color: "#FAF8F4" }}>
      <div style={{ ...S.phone, background: "#2C1810", justifyContent: "center", padding: 32 }} className="bt-focus">
        {/* 16, not 28. The heading and the form are one idea, "here is what you
            are doing, now do it", and this gap was measured at 28 against the
            32 below the form: two breaks four pixels apart, which reads as a
            mistake rather than as two tiers. Tight here, 32 below, so the one
            real break on the screen falls where the meaning changes. */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.08)", width: 68, height: 68, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <Store size={34} color="#FAF8F4" />
          </div>
          <h1 style={{ ...S.userName, color: "#FAF8F4", fontSize: 26, marginBottom: 6 }}>{title}</h1>
          <p style={{ ...S.greeting, color: "rgba(255,255,255,0.65)" }}>{subtitle}</p>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <input
              style={field} value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name" autoComplete="name"
            />
          )}

          {(mode === "signin" || mode === "signup" || mode === "reset") && (
            <input
              style={field} value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" type="email"
              autoComplete="email" inputMode="email" autoCapitalize="none"
            />
          )}

          {(mode === "signin" || mode === "signup" || mode === "newpassword") && (
            <input
              style={field} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "newpassword" ? "New password" : "Password"} type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          )}

          {mode === "verify" && (
            <input
              style={{ ...field, textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: 6, fontFamily: "monospace" }}
              value={code}
              // Strip as they type: people paste "337 509" from a notification.
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="000000"
              type="text" inputMode="numeric" maxLength={10}
              // Lets Android offer the code straight from the notification.
              autoComplete="one-time-code" autoFocus
            />
          )}

          {error && (
            <p style={{ ...S.formErrorDark, margin: 0 }}>{error}</p>
          )}
          {notice && (
            <p style={{ ...S.formNoticeDark, margin: 0 }}>{notice}</p>
          )}

          {/*
            Not a <label> around the whole row. A label forwards every click
            inside it to its control, so wrapping the Terms and Privacy buttons
            in one made them untappable -- the tap toggled the checkbox instead
            of opening the document. The label now covers only the box and the
            plain words; the buttons sit outside any label.
          */}
          {mode === "signup" && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "2px 0 4px" }}>
              <input
                id="accept-legal"
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                // Visually hidden but focusable and announced, so the control
                // is still reachable by keyboard and screen reader.
                style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
              />

              <label htmlFor="accept-legal" style={{ cursor: "pointer", flexShrink: 0, marginTop: 1, display: "block" }}>
                <span
                  style={{
                    width: 20, height: 20, borderRadius: 6, display: "flex",
                    border: accepted ? "1px solid #FAF8F4" : "1px solid rgba(255,255,255,0.35)",
                    background: accepted ? "#FAF8F4" : "transparent",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {accepted && <Check size={14} color="#2C1810" strokeWidth={3} />}
                </span>
              </label>

              <span style={{ fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.75)" }}>
                <label htmlFor="accept-legal" style={{ cursor: "pointer" }}>I agree to the</label>{" "}
                <button type="button" style={legalLinkStyle} onClick={() => setLegalDoc("terms")}>
                  Terms of Service
                </button>
                <label htmlFor="accept-legal" style={{ cursor: "pointer" }}> and </label>
                <button type="button" style={legalLinkStyle} onClick={() => setLegalDoc("privacy")}>
                  Privacy Policy
                </button>
                <label htmlFor="accept-legal" style={{ cursor: "pointer" }}>
                  , and to my records being stored on servers outside Cameroon so they can sync between my devices.
                </label>
              </span>
            </div>
          )}

          <button
            type="submit" disabled={busy}
            style={{ ...S.primaryBtn, background: "#FAF8F4", color: "#2C1810", opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {busy && <Loader size={16} className="spin" />}
            {cta}
          </button>
        </form>

        {showOAuth && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "32px 0 14px" }}>
              <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.14)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", fontWeight: 600 }}>or</span>
              <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.14)" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button" disabled={busy || oauthBusy !== null}
                onClick={() => oauth("google", signInWithGoogle)}
                style={oauthBtn}
              >
                {oauthBusy === "google" ? <Loader size={16} className="spin" /> : <GoogleMark />}
                Continue with Google
              </button>
            </div>
          </>
        )}

        {mode === "signin" && (
          <p style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.62)", textAlign: "center", margin: "14px 0 0" }}>
            By continuing you agree to the{" "}
            <button type="button" style={{ background: "none", border: "none", padding: 0, color: "#FAF8F4", textDecoration: "underline", cursor: "pointer", font: "inherit" }} onClick={() => setLegalDoc("terms")}>Terms</button>
            {" "}and{" "}
            <button type="button" style={{ background: "none", border: "none", padding: 0, color: "#FAF8F4", textDecoration: "underline", cursor: "pointer", font: "inherit" }} onClick={() => setLegalDoc("privacy")}>Privacy Policy</button>.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", marginTop: 14 }}>
          {mode === "verify" && (
            <>
              <button type="button" style={{ ...S.textBtn, color: "rgba(255,255,255,0.85)" }} onClick={resend} disabled={busy}>
                Send me another code
              </button>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", margin: 0, textAlign: "center", lineHeight: 1.5 }}>
                No email? Check spam. The link in it works too.
              </p>
            </>
          )}

          {mode !== "signup" && mode !== "verify" && mode !== "newpassword" && (
            <button type="button" style={{ ...S.textBtn, color: "rgba(255,255,255,0.85)" }} onClick={() => go("signup")}>
              New here? Create an account
            </button>
          )}
          {mode !== "signin" && mode !== "newpassword" && (
            <button type="button" style={{ ...S.textBtn, color: "rgba(255,255,255,0.85)" }} onClick={() => go("signin")}>
              {mode === "verify" ? "Back to sign in" : "Already have an account? Sign in"}
            </button>
          )}
          {mode === "signin" && (
            <button type="button" style={{ ...S.textBtn, color: "rgba(255,255,255,0.62)", fontSize: 12 }} onClick={() => go("reset")}>
              Forgot your password?
            </button>
          )}
        </div>

        {/* "Use BizTrack without an account" WAS HERE, and it is gone.
            Two reasons, and the second is the one that made it urgent.

            An account is the backup. This app's entire v1.5.3 to v1.5.7
            emergency-rescue history came from books living on one phone and
            nowhere else, and the local-only route reproduced that by design.

            And `evaluatePlan(null)` returns `canWrite: true` with no expiry, so
            a signed-out user was an UNLIMITED FREE TIER. That contradicts the
            commercial model outright -- thirty days then read-only, not a free
            tier -- and it meant read-only enforcement could be bypassed by
            signing out. There was no version of that gate worth building while
            this button existed.

            An account is required. THE NETWORK IS NOT: it is needed once, here,
            and everything after stays exactly as offline as it has always been.
            Do not read this as permission to make the app wait on a server.

            NO DATA-RESCUE DOOR HERE EITHER, and that was a correction. One was
            added when the skip went, on the reasoning that rescue has three
            deliberate entry points and onboarding was one of them. It is still
            one of them: onboarding sits immediately AFTER this screen, and its
            door never moved. So this was a fourth door, on the one screen where
            it makes least sense -- everybody here is either signing in or
            creating an account, and finding local books does not get either
            done. Rescue is for after you are in, which is where all three of
            its doors already are. */}
      </div>
    </div>
  );
}
