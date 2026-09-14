/**
 * Moving books between devices, and between origins.
 *
 * This is the route for someone who will not create an account, and it is also
 * the only route across a domain change: browser storage is per-origin, so
 * books saved at one address are simply invisible at another. A user who moves
 * from the old address to a new one without carrying a file sees an empty app,
 * which is indistinguishable from having lost everything.
 *
 * A FILE rather than a pasted code. The clipboard route already exists and
 * breaks exactly when it matters: a few hundred sales is tens to hundreds of
 * kilobytes, and pasting that into a single-line prompt() on Android is
 * fragile. Worse, it fails quietly -- a truncated paste is still valid-looking
 * JSON right up until it is not, and a partial restore of someone's books is a
 * far worse outcome than a refusal.
 *
 * A file also survives the app being closed, can be kept, and can be sent over
 * WhatsApp, which is how this audience actually moves things between phones.
 */

/** Everything needed to rebuild this device's state somewhere else. */
export function buildBackup({ businesses, userName, userEmail, currency, lowStockThreshold }) {
  return {
    // Read by parseBackup; also what a human opening the file sees first.
    format: "biztrack-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    businesses: businesses || [],
    userName: userName ?? "",
    userEmail: userEmail ?? "",
    currency: currency ?? "XAF",
    lowStockThreshold: lowStockThreshold ?? 3,
  };
}

/** Save the backup as a file the user keeps. Returns false if the browser refused. */
export function saveBackupFile(payload) {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BizTrack_Backup_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file with FileReader rather than Blob.text().
 *
 * Blob.text() needs Chrome 76+, and this ships to whatever Android build
 * someone already owns. The transfer path is the last thing that should fail
 * on an old device, because it is what a person reaches for when they are
 * already worried about losing their records.
 */
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsText(file);
  });
}

/**
 * Ask for a file and return its parsed contents.
 *
 * Resolves null when the user cancels, which is not an error and must not
 * produce a message. Rejects only when a file was chosen and could not be used.
 *
 * The input is created on demand rather than living in the tree: it is used
 * once, and a hidden input in a 3,000-line component is a thing that gets
 * accidentally styled or removed later.
 */
export function pickBackupFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    // Some Android file pickers ignore accept and offer everything; the parse
    // below is the real guard, not this hint.
    input.accept = "application/json,.json,text/plain";

    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);

      try {
        const text = await readAsText(file);
        if (!text.trim()) return reject(new Error("That file is empty."));

        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          return reject(new Error("That file isn't a BizTrack backup — it isn't readable as one."));
        }

        // Truncation is the failure this whole module exists to avoid, and a
        // half-written file parses as valid JSON often enough to matter.
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.businesses)) {
          return reject(new Error("That file is missing its business records. It may be damaged or incomplete."));
        }

        resolve(parsed);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Could not read that file."));
      }
    };

    // Never appended to the document. click() works on a detached input in
    // every browser this ships to, and there is no reliable cross-browser
    // cancel event -- so an attached element would leak on every cancelled
    // pick, with nothing to clean it up. Detached, it is simply garbage
    // collected when this promise is dropped.
    input.click();
  });
}
