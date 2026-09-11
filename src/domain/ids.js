/**
 * Identifier generation.
 *
 * Ids are minted on the client so a record created offline gets its permanent
 * identity immediately, with no server round trip. That is what makes an
 * offline-first sync possible: every row can be upserted by id, so a retried
 * push is idempotent instead of creating duplicates.
 *
 * crypto.randomUUID() is unavailable in insecure contexts and on older Android
 * WebViews, so we fall back to getRandomValues and, failing that, Math.random.
 */

const hex = (n) => n.toString(16).padStart(2, "0");

function uuidFromBytes(bytes) {
  // RFC 4122 version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const s = Array.from(bytes, hex).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function newId() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* not a secure context; fall through */
    }
  }

  if (c && typeof c.getRandomValues === "function") {
    return uuidFromBytes(c.getRandomValues(new Uint8Array(16)));
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return uuidFromBytes(bytes);
}

/** True for ids we minted before the UUID migration (base36 timestamp + noise). */
export const isLegacyId = (id) => typeof id === "string" && !/^[0-9a-f-]{36}$/i.test(id);
