import { ArrowLeft } from "lucide-react";

/**
 * Renders a legal document from src/legal/documents.js.
 *
 * Reads from that module rather than holding copy of its own, so the text a
 * lawyer reviews is the text the user is shown. A policy that has drifted from
 * the reviewed version is worse than no policy: it is a documented claim nobody
 * checked.
 *
 * Deliberately long-form and scrollable rather than a link out to a website.
 * These users are often on expensive, intermittent data, and a policy that only
 * exists at the other end of a connection is a policy most of them will never
 * read.
 */
export default function LegalScreen({ styles: S, doc, onBack }) {
  if (!doc) return null;

  return (
    <div style={S.screen}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={onBack} aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <h2 style={S.pageTitle}>{doc.title}</h2>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ padding: "0 20px 40px" }}>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px", fontWeight: 600 }}>
          Last updated {doc.updated}
        </p>

        {doc.intro && (
          <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--text-primary)", margin: "12px 0 22px" }}>
            {doc.intro}
          </p>
        )}

        {doc.sections.map((section) => (
          <section key={section.heading} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
              {section.heading}
            </h3>
            {section.body.map((paragraph, i) => (
              <p
                key={i}
                style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-primary)", margin: "0 0 10px", opacity: 0.9 }}
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
