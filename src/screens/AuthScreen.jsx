import { useState } from "react";
import { Store, Loader, Check } from "lucide-react";

import {
  signUp, signIn, sendPasswordReset, describeAuthError, signInWithGoogle,
  verifyEmailCode, resendConfirmation, setNewPassword,
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
 * six-digit code next to its button, and this screen is where that code is
 * spent — so confirming an address or resetting a password can be finished
 * inside the app the user already has open, without depending on a link
 * landing in the right browser.
 *
 * Errors are shown in plain language, and being offline is presented as a
 * normal condition rather than a failure, because for these users intermittent
 * data is the default.
 */
export default function AuthScreen({ styles: S, onSkip, hasLocalData }) {
  // signin | signup | reset | verify | newpassword
  const [mode, setMode] = useState("signin");
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
      if (code.replace(/\D/g, "").length < 6) return setError("Enter the six-digit code from your email.");
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
        if (err) setError(describeAuthError(err));
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
            setPendingType("signup");
            setCode("");
            go("verify");
            setNotice("Confirm your email first — enter the code we sent you.");
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
      return setNotice(`Hang on — you can ask for another code in ${secs}s.`);
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
    color: "#FAF8F4",
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

  const oauthBtn = {
    ...S.primaryBtn,
    marginTop: 0,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "#FAF8F4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    opacity: busy || oauthBusy ? 0.6 : 1,
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
    verify: `We sent a six-digit code to ${email || "your email"}.`,
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

  return (
    <div style={{ ...S.shell, background: "#2C1810", color: "#FAF8F4" }}>
      <div style={{ ...S.phone, background: "#2C1810", justifyContent: "center", padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ background: "rgba(255,255,255,0.08)", width: 68, height: 68, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
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
              style={{ ...field, textAlign: "center", fontSize: 27, fontWeight: 700, letterSpacing: 9, fontFamily: "monospace" }}
              value={code}
              // Strip as they type: people paste "337 509" from a notification.
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              type="text" inputMode="numeric" maxLength={6}
              // Lets Android offer the code straight from the notification.
              autoComplete="one-time-code" autoFocus
            />
          )}

          {error && (
            <p style={{ fontSize: 12, color: "#FF9B8A", margin: 0, fontWeight: 600, lineHeight: 1.4 }}>{error}</p>
          )}
          {notice && (
            <p style={{ fontSize: 12, color: "#9BD4A0", margin: 0, fontWeight: 600, lineHeight: 1.4 }}>{notice}</p>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 14px" }}>
              <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.14)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>or</span>
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
          <p style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.4)", textAlign: "center", margin: "14px 0 0" }}>
            By continuing you agree to the{" "}
            <button type="button" style={{ background: "none", border: "none", padding: 0, color: "#FAF8F4", textDecoration: "underline", cursor: "pointer", font: "inherit" }} onClick={() => setLegalDoc("terms")}>Terms</button>
            {" "}and{" "}
            <button type="button" style={{ background: "none", border: "none", padding: 0, color: "#FAF8F4", textDecoration: "underline", cursor: "pointer", font: "inherit" }} onClick={() => setLegalDoc("privacy")}>Privacy Policy</button>.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", marginTop: 22 }}>
          {mode === "verify" && (
            <>
              <button type="button" style={{ ...S.textBtn, color: "rgba(255,255,255,0.85)" }} onClick={resend} disabled={busy}>
                Send me another code
              </button>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0, textAlign: "center", lineHeight: 1.5 }}>
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
            <button type="button" style={{ ...S.textBtn, color: "rgba(255,255,255,0.45)", fontSize: 12 }} onClick={() => go("reset")}>
              Forgot your password?
            </button>
          )}
        </div>

        {onSkip && mode !== "verify" && mode !== "newpassword" && (
          <div style={{ marginTop: 28, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 18, textAlign: "center" }}>
            <button style={{ ...S.textBtn, color: "rgba(255,255,255,0.5)", fontSize: 12 }} onClick={onSkip}>
              Continue without an account
            </button>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "6px 0 0", lineHeight: 1.4 }}>
              {hasLocalData
                ? "Your existing records stay on this device. Sign in later to back them up."
                : "Records stay on this device only, and are lost if you clear the app."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
