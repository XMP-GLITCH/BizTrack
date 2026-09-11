/**
 * Claiming local books into an account.
 *
 * This is the path your first users take: they have been running local-only,
 * they now create an account, and the books already on their phone have to end
 * up in it without anyone holding their breath.
 *
 * It resolves the open question of what to do when someone signs into an
 * account that ALREADY has books while their device also holds some. The answer
 * taken here:
 *
 *   - Ask. Never decide silently. Both outcomes are surprising if unannounced,
 *     and this is someone's only copy of their business records.
 *   - Default to merging, because the merge is a union and loses nothing.
 *   - Never destroy without a backup first, and never destroy the remote copy
 *     at all -- the device is the side that can be rebuilt from the server, not
 *     the other way round.
 *
 * The option to "keep only this device's books" deliberately does NOT exist.
 * With a merge-based sync there is no honest way to deliver it: the next pull
 * would bring the account's rows straight back. Offering a choice the code
 * cannot keep is worse than not offering it.
 */

import { supabase, isBackendConfigured } from "./supabase.js";

/** Written once, before the first sync ever touches this device's books. */
export const PRE_CLAIM_KEY = "biztrack-pre-claim-backup";

/** Counts for the copy on this device. Cheap, and no network. */
export function summarizeLocal(businesses) {
  const list = businesses || [];
  let items = 0;
  let sales = 0;
  for (const b of list) {
    items += (b.items || []).filter((i) => !i.deletedAt).length;
    sales += (b.sales || []).filter((s) => !s.deletedAt).length;
  }
  return { businesses: list.filter((b) => !b.deletedAt).length, items, sales };
}

/**
 * What is already in this account. RLS scopes every count to the signed-in
 * user, so this cannot see anyone else's rows.
 *
 * Returns null when the answer is unknown -- offline, or the schema is not
 * applied. A null must never be read as "the account is empty": treating an
 * unreachable server as an empty one is how a merge prompt turns into silent
 * data loss.
 */
export async function inspectRemote() {
  if (!isBackendConfigured) return null;

  try {
    const counts = await Promise.all(
      ["businesses", "items", "sales"].map((table) =>
        supabase.from(table).select("id", { count: "exact", head: true })),
    );

    if (counts.some((c) => c.error)) return null;

    return {
      businesses: counts[0].count ?? 0,
      items: counts[1].count ?? 0,
      sales: counts[2].count ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Preserve the device's books before anything is merged or replaced.
 *
 * Never overwritten once written, matching the pre-ledger backup: the value of
 * a safety copy is that it is the state before the operation, and a second
 * write would replace it with the state after.
 */
export function savePreClaimBackup(businesses) {
  try {
    if (localStorage.getItem(PRE_CLAIM_KEY)) return true;
    localStorage.setItem(PRE_CLAIM_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      reason: "before-first-account-sync",
      businesses: businesses || [],
    }));
    return true;
  } catch {
    // Storage full or unavailable. The caller must treat this as a refusal to
    // proceed with anything destructive.
    return false;
  }
}

export function readPreClaimBackup() {
  try {
    const raw = localStorage.getItem(PRE_CLAIM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** A file the user can keep, independent of the browser. */
export function downloadLocalCopy(businesses) {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      reason: "before-linking-account",
      businesses: businesses || [],
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `BizTrack_Before_Account_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
