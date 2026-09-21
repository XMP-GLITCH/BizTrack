import { useState } from "react";
import { Check, FileText, Loader } from "lucide-react";

import { DOCUMENTS, LEGAL_VERSION } from "../legal/documents.js";
import { recordLegalAcceptance } from "../backend/auth.js";
import LegalScreen from "./LegalScreen.jsx";

/**
 * Consent, collected after authentication rather than on the form.
 *
 * The checkbox on the signup form could not do this job. OAuth draws no
 * distinction between signing in and signing up: "Continue with Google"
 * creates the account when none exists, so a new user arriving through the
 * sign-in path got an account without ever being shown the terms. That is how
 * the first real user arrived, and her account carries no acceptance.
 *
 * Placing the gate after authentication catches every route in: Google from
 * either tab, email and password, a code, or a session restored on a new
 * device. It also handles a bumped LEGAL_VERSION, which is what makes it
 * possible to change the documents materially and ask people again.
 *
 * There is no "skip". Accepting is the only way forward, and the honest
 * alternative, signing out, is offered plainly rather than hidden.
 */
export default function ConsentScreen({ styles: S, email, onAccepted, onSignOut }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [doc, setDoc] = useState(null);

  if (doc) {
    return (
      <div style={{ ...S.shell }}>
        <LegalScreen styles={S} doc={DOCUMENTS[doc]} onBack={() => setDoc(null)} />
      </div>
    );
  }

  const submit = async () => {
    if (!accepted) return setError("Please accept the Terms and Privacy Policy to continue.");
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await recordLegalAcceptance(LEGAL_VERSION);
      if (err) {
        // Offline is the normal case for these users, so it is described as a
        // condition rather than a failure, and nothing is lost by retrying.
        setError("Couldn't save that. Check your connection and try again.");
        setBusy(false);
        return;
      }
      onAccepted();
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
      setBusy(false);
    }
  };

  const link = {
    background: "none", border: "none", padding: 0, color: "#FAF8F4",
    textDecoration: "underline", cursor: "pointer", font: "inherit",
  };

  return (
    <div style={{ ...S.shell, background: "#2C1810", color: "#FAF8F4" }}>
      <div style={{ ...S.phone, background: "#2C1810", justifyContent: "center", padding: 32 }} className="bt-focus">
        <div style={{ background: "rgba(255,255,255,0.08)", width: 62, height: 62, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <FileText size={30} color="#FAF8F4" />
        </div>

        <h1 style={{ ...S.userName, color: "#FAF8F4", marginBottom: 10 }}>
          One thing before you start
        </h1>

        <p style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.78)", margin: "0 0 18px" }}>
          {email ? `You're signed in as ${email}. ` : ""}
          Please read and accept how BizTrack handles your records. It is short, and
          it says plainly what is stored, where it goes, and what you can take away.
        </p>

        {/*
          THIS BOX COULD NOT BE TICKED, and it is the screen every existing
          account has to pass since LEGAL_VERSION moved. Measured in a browser:
          a real click at the centre of the visible box left `checked` false,
          while a synthetic `label.click()` set it true.

          Two faults, both from one wrapper. The whole row was a <label>, and a
          label forwards every click inside it to its control -- so the box
          ALSO carried its own `onClick` calling `setAccepted(!accepted)`, and
          the two handlers fought over the same tap. The same wrapper made the
          Terms and Privacy buttons toggle consent instead of opening the
          document, which is a bug this project already found and fixed in
          AuthScreen and wrote down; this copy never got the fix.

          So: one owner for the change (the input), the label covering only the
          box and the plain words, and the buttons outside any label.
        */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 18px" }}>
          <input
            id="consent-accept"
            type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
          />
          {/*
            The visible box stays 20px; the TAP AREA is 44, which is this
            project's own minimum and what the 20px target was failing. The
            negative margin keeps the layout exactly where it was, and the
            12px it overhangs to the right lands on "I agree to the" -- itself
            a label for this same control, so the overlap costs nothing.
          */}
          <label
            htmlFor="consent-accept"
            style={{
              cursor: "pointer", flexShrink: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              padding: 12, margin: "-12px 0 -12px -12px",
            }}
          >
            <span
              style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: accepted ? "1px solid #FAF8F4" : "1px solid rgba(255,255,255,0.35)",
                background: accepted ? "#FAF8F4" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {accepted && <Check size={14} color="#2C1810" strokeWidth={3} />}
            </span>
          </label>
          <span style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" }}>
            <label htmlFor="consent-accept" style={{ cursor: "pointer" }}>I agree to the</label>{" "}
            <button type="button" style={link} onClick={() => setDoc("terms")}>Terms of Service</button>
            {" "}and{" "}
            <button type="button" style={link} onClick={() => setDoc("privacy")}>Privacy Policy</button>
            <label htmlFor="consent-accept" style={{ cursor: "pointer" }}>
              , and to my records being stored on servers outside Cameroon so they can sync between my devices.
            </label>
          </span>
        </div>

        {error && (
          <p style={S.formErrorDark}>{error}</p>
        )}

        <button
          type="button" disabled={busy}
          onClick={submit}
          style={{ ...S.primaryBtn, background: "#FAF8F4", color: "#2C1810", marginTop: 0, opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {busy && <Loader size={16} className="spin" />}
          Agree and continue
        </button>

        <button
          type="button" disabled={busy}
          onClick={onSignOut}
          style={{ ...S.textBtn, color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 16 }}
        >
          Sign out instead
        </button>

        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", margin: "8px 0 0", lineHeight: 1.45, textAlign: "center" }}>
          Signing out changes nothing on this phone. Your records stay exactly where they are.
        </p>
      </div>
    </div>
  );
}
