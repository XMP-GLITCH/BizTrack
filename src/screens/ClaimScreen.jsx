import { useState } from "react";
import { Cloud, Download, Loader } from "lucide-react";

import { downloadLocalCopy } from "../backend/claim.js";

/**
 * Shown once, the first time books already on this device meet an account.
 *
 * The audience matters here more than usual. These are people whose only copy
 * of their business records is on this phone, being asked to let software do
 * something to it. So the screen states the actual numbers rather than saying
 * "your data", offers the file export before either button, and never uses a
 * word like "sync" that hides what is about to happen.
 */
export default function ClaimScreen({ styles: S, local, remote, businesses, onResolve }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const accountHasBooks = (remote?.businesses ?? 0) > 0;

  const choose = (strategy) => {
    setError(null);
    setBusy(true);
    const result = onResolve(strategy);
    if (!result?.ok) {
      setError(result?.error || "Something went wrong. Nothing was changed.");
      setBusy(false);
    }
  };

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  return (
    <div style={{ ...S.shell, background: "#2C1810", color: "#FAF8F4" }}>
      <div style={{ ...S.phone, background: "#2C1810", justifyContent: "center", padding: 32, overflowY: "auto" }}>
        <div style={{ background: "rgba(255,255,255,0.08)", width: 62, height: 62, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Cloud size={30} color="#FAF8F4" />
        </div>

        <h1 style={{ ...S.userName, color: "#FAF8F4", fontSize: 24, marginBottom: 10 }}>
          {accountHasBooks ? "Two sets of books" : "Back up your books"}
        </h1>

        {/* The numbers, stated plainly. "Your data" is what people do not trust. */}
        <div style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 14, padding: "14px 16px", marginBottom: 16,
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "0 0 6px", letterSpacing: 0.4 }}>
            ON THIS PHONE
          </p>
          <p style={{ fontSize: 14, color: "#FAF8F4", margin: 0, lineHeight: 1.6 }}>
            {count(local?.businesses ?? 0, "business", "businesses")} ·{" "}
            {count(local?.items ?? 0, "item", "items")} ·{" "}
            {count(local?.sales ?? 0, "sale", "sales")}
          </p>

          {accountHasBooks && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "14px 0 6px", letterSpacing: 0.4 }}>
                ALREADY IN THIS ACCOUNT
              </p>
              <p style={{ fontSize: 14, color: "#FAF8F4", margin: 0, lineHeight: 1.6 }}>
                {count(remote?.businesses ?? 0, "business", "businesses")} ·{" "}
                {count(remote?.items ?? 0, "item", "items")} ·{" "}
                {count(remote?.sales ?? 0, "sale", "sales")}
              </p>
            </>
          )}
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.78)", margin: "0 0 18px" }}>
          {accountHasBooks
            ? "This account already has records, and so does this phone. Choose what happens — nothing is deleted either way, and a copy of what is on this phone is saved before anything changes."
            : "Your records will be copied to your account, so they survive a lost or replaced phone and follow you to another device. Nothing on this phone is removed."}
        </p>

        {error && (
          <p style={{ fontSize: 12, color: "#FF9B8A", fontWeight: 600, margin: "0 0 12px", lineHeight: 1.5 }}>{error}</p>
        )}

        {/* Offered before the decision, not after it. */}
        <button
          type="button" disabled={busy}
          onClick={() => { setSaved(downloadLocalCopy(businesses)); }}
          style={{
            ...S.primaryBtn, marginTop: 0, marginBottom: 10,
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
            color: "#FAF8F4", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Download size={16} />
          {saved ? "Copy saved — save again" : "Save a copy to this phone first"}
        </button>

        <button
          type="button" disabled={busy}
          onClick={() => choose("merge")}
          style={{
            ...S.primaryBtn, marginTop: 0, background: "#FAF8F4", color: "#2C1810",
            opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {busy && <Loader size={16} className="spin" />}
          {accountHasBooks ? "Keep both — put them together" : "Back up my books"}
        </button>

        {accountHasBooks && (
          <>
            <button
              type="button" disabled={busy}
              onClick={() => choose("adopt")}
              style={{
                ...S.primaryBtn, marginTop: 10, background: "transparent",
                border: "1px solid rgba(255,255,255,0.25)", color: "#FAF8F4", opacity: busy ? 0.6 : 1,
              }}
            >
              Use the account's books on this phone
            </button>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, margin: "10px 2px 0" }}>
              Putting them together is the safe choice — nothing is lost, and duplicates can be
              deleted afterwards. The second option sets this phone's records aside; they stay in
              the saved copy above and in the account they were never added to.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
