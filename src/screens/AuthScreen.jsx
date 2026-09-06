import { useState } from "react";
import { Store, Loader } from "lucide-react";

import { signUp, signIn, sendPasswordReset, describeAuthError } from "../backend/auth.js";

/**
 * Sign in / sign up.
 *
 * Email and password rather than magic-link-only: on Android a link often opens
 * a different browser than the installed PWA, and "the link signs me out" is a
 * support burden with no end. Errors are shown in plain language, and being
 * offline is presented as a normal condition rather than a failure, because for
 * these users intermittent data is the default.
 */
export default function AuthScreen({ styles: S, onSkip, hasLocalData }) {
  const [mode, setMode] = useState("signin"); // signin | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const submit = async (e) => {
    e?.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim()) return setError("Enter your email address.");
    if (mode !== "reset" && password.length < 6) {
      return setError("Use a password of at least 6 characters.");
    }
    if (mode === "signup" && !name.trim()) return setError("What should we call you?");

    setBusy(true);
    try {
      if (mode === "reset") {
        const { error: err } = await sendPasswordReset(email);
        if (err) setError(describeAuthError(err));
        else setNotice("Check your email for a reset link.");
      } else if (mode === "signup") {
        const { data, error: err } = await signUp({ email, password, displayName: name });
        if (err) setError(describeAuthError(err));
        else if (!data?.session) setNotice("Almost there — confirm your email, then sign in.");
      } else {
        const { error: err } = await signIn({ email, password });
        if (err) setError(describeAuthError(err));
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "signup" ? "Create your account"
    : mode === "reset" ? "Reset your password"
    : "Welcome back";

  const subtitle = mode === "signup"
    ? "Your books are backed up and follow you to any device."
    : mode === "reset" ? "We'll email you a link to set a new password."
    : "Sign in to reach your businesses.";

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
              style={{ ...S.input, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#FAF8F4" }}
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name" autoComplete="name"
            />
          )}

          <input
            style={{ ...S.input, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#FAF8F4" }}
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" type="email"
            autoComplete="email" inputMode="email" autoCapitalize="none"
          />

          {mode !== "reset" && (
            <input
              style={{ ...S.input, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "#FAF8F4" }}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          )}

          {error && (
            <p style={{ fontSize: 12, color: "#FF9B8A", margin: 0, fontWeight: 600, lineHeight: 1.4 }}>{error}</p>
          )}
          {notice && (
            <p style={{ fontSize: 12, color: "#9BD4A0", margin: 0, fontWeight: 600, lineHeight: 1.4 }}>{notice}</p>
          )}

          <button
            type="submit" disabled={busy}
            style={{ ...S.primaryBtn, background: "#FAF8F4", color: "#2C1810", opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {busy && <Loader size={16} className="spin" />}
            {mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
          </button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", marginTop: 22 }}>
          {mode !== "signup" && (
            <button style={{ ...S.textBtn, color: "rgba(255,255,255,0.85)" }} onClick={() => { setMode("signup"); setError(null); setNotice(null); }}>
              New here? Create an account
            </button>
          )}
          {mode !== "signin" && (
            <button style={{ ...S.textBtn, color: "rgba(255,255,255,0.85)" }} onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>
              Already have an account? Sign in
            </button>
          )}
          {mode === "signin" && (
            <button style={{ ...S.textBtn, color: "rgba(255,255,255,0.45)", fontSize: 12 }} onClick={() => { setMode("reset"); setError(null); setNotice(null); }}>
              Forgot your password?
            </button>
          )}
        </div>

        {onSkip && (
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
