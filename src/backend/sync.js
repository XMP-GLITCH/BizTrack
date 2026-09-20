/**
 * Sync.
 *
 * Deliberately an outbox-and-pull loop rather than live subscriptions. The
 * shape of this product is one owner on one or two devices, on metered and
 * intermittent mobile data. A websocket would cost battery and bytes to solve a
 * problem nobody has yet; realtime becomes worth it when staff accounts mean
 * two people really are recording sales at the same moment.
 *
 * The conflict rules are the part worth reading:
 *
 *  - Stock movements are append-only facts and NEVER conflict. They merge as a
 *    union by id. This is the whole reason stock is a ledger: two devices each
 *    selling the last unit both keep their sale.
 *  - Businesses, items and sales are mutable, and resolve last-write-wins on
 *    updatedAt. For one owner editing a name on two devices, whoever saved last
 *    winning is both correct and unsurprising.
 *  - Soft deletes travel like any other update, so a tombstone can win over an
 *    older edit and the delete propagates.
 *
 * Pure merge logic lives here alongside the IO so the rules can be tested
 * exhaustively without a server; only pushChanges/pullChanges touch the network.
 */

import { supabase, isBackendConfigured } from "./supabase.js";
import { flattenBusinesses, assembleBusinesses } from "./mappers.js";

/** Rows changed since the last successful push. */
export function collectChanges(businesses, since) {
  const cutoff = since ? String(since) : "";
  const newer = (ts) => !cutoff || String(ts || "") > cutoff;

  const dirty = (businesses || []).map((b) => ({
    ...b,
    items: (b.items || []).filter((i) => newer(i.updatedAt)),
    sales: (b.sales || []).filter((s) => newer(s.updatedAt)),
    // Movements are immutable, so their creation time is their only watermark.
    stockMovements: (b.stockMovements || []).filter((m) => newer(m.createdAt || m.occurredAt)),
    invoices: (b.invoices || []).filter((v) => newer(v.updatedAt)),
  }));

  // A business is worth pushing if it changed itself or has changed children;
  // its parent row must go first anyway to satisfy the foreign keys.
  return dirty.filter((b) =>
    newer(b.updatedAt) || b.items.length || b.sales.length || b.stockMovements.length || b.invoices.length);
}

const newest = (a, b) => (String(a?.updatedAt || "") >= String(b?.updatedAt || "") ? a : b);

/** Merge one collection of mutable records by id, last write wins. */
function mergeById(local, incoming) {
  const byId = new Map((local || []).map((r) => [r.id, r]));
  for (const record of incoming || []) {
    const existing = byId.get(record.id);
    byId.set(record.id, existing ? newest(existing, record) : record);
  }
  return [...byId.values()];
}

/** Union of immutable records by id. Order is restored by the readers. */
function unionById(local, incoming) {
  const byId = new Map((local || []).map((r) => [r.id, r]));
  for (const record of incoming || []) if (!byId.has(record.id)) byId.set(record.id, record);
  return [...byId.values()];
}

export function mergeBusinesses(local, incoming) {
  const byId = new Map((local || []).map((b) => [b.id, b]));

  for (const remote of incoming || []) {
    const mine = byId.get(remote.id);
    if (!mine) {
      byId.set(remote.id, remote);
      continue;
    }
    // Scalar fields follow the newer of the two business rows; children are
    // merged independently, because a stale parent must not drag back a child
    // that was edited more recently.
    const winner = newest(mine, remote);
    byId.set(remote.id, {
      ...winner,
      items: mergeById(mine.items, remote.items),
      sales: mergeById(mine.sales, remote.sales).sort(
        (a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))),
      stockMovements: unionById(mine.stockMovements, remote.stockMovements),
      // Mutable, like items and sales: an invoice gets marked paid, so the
      // newer of the two wins rather than the union keeping whichever arrived
      // first. Without this line a "paid" recorded on one phone would be
      // dropped silently on the other.
      invoices: mergeById(mine.invoices, remote.invoices).sort(
        (a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt))),
    });
  }

  return [...byId.values()];
}

/* ── network ───────────────────────────────────────────────────────────────── */

const CHUNK = 500;

/**
 * Is this the network failing to answer, or the server answering with a no?
 *
 * They are different events and must never be reported as the same one. Being
 * unreachable is the NORMAL state for this audience and deserves a quiet
 * retry. A refusal, or a fault in our own code, is a DEFECT -- and calling it
 * a connection problem sends someone to check their signal while their books
 * quietly fail to arrive.
 *
 * That exact mislabelling hid a total sync outage from every account on this
 * project for days: the screen said "waiting for a connection" while the
 * server was answering 403 every five minutes, on time, without fail.
 */
function looksOffline(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // What `fetch` throws when it cannot reach the host at all. The wording
  // differs across Chrome, Firefox and Safari, so match the shape. A
  // TypeError from OUR OWN code (reading a property of undefined, say) is
  // also a TypeError and must NOT be mistaken for a dead network.
  return err instanceof TypeError && /fetch|network|load failed/i.test(String(err?.message || ""));
}

async function upsertAll(table, rows) {
  // A missing row set is an empty one, not a crash. `flattenBusinesses` once
  // omitted `invoices` from its accumulator, so this was called with
  // `undefined` and threw on `.length` -- after four tables had already been
  // written, before the pull ran, and before any cursor advanced. One absent
  // key took the whole sync down for everybody.
  for (let i = 0; i < (rows?.length ?? 0); i += CHUNK) {
    // Upsert on the primary key: ids are client-generated, so a retry after a
    // dropped connection updates the same row instead of duplicating a sale.
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function pushChanges({ businesses, userId, since }) {
  if (!isBackendConfigured) return { pushed: 0, at: since };
  const changed = collectChanges(businesses, since);
  if (!changed.length) return { pushed: 0, at: since };

  const flat = flattenBusinesses(changed, userId);
  // Order matters: a sale references an item, a movement references both.
  await upsertAll("businesses", flat.businesses);
  await upsertAll("items", flat.items);
  await upsertAll("sales", flat.sales);
  await upsertAll("stock_movements", flat.movements);
  // Last, and referencing nothing but its business: an invoice deliberately
  // does not point at a sale row, only at a sale GROUP, which is a plain string.
  await upsertAll("invoices", flat.invoices);

  const count = flat.businesses.length + flat.items.length + flat.sales.length
    + flat.movements.length + flat.invoices.length;
  return { pushed: count, at: new Date().toISOString() };
}

async function selectSince(table, since) {
  let query = supabase.from(table).select("*");
  if (since) query = query.gt("updated_at", since);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

export async function pullChanges({ since }) {
  if (!isBackendConfigured) return { businesses: [], at: since };

  // RLS scopes every query to businesses this user is a member of.
  const [businesses, items, sales, movements, invoices] = await Promise.all([
    selectSince("businesses", since),
    selectSince("items", since),
    selectSince("sales", since),
    selectSince("stock_movements", since),
    selectSince("invoices", since),
  ]);

  return {
    businesses: assembleBusinesses({ businesses, items, sales, movements, invoices }),
    at: new Date().toISOString(),
    counts: {
      businesses: businesses.length, items: items.length,
      sales: sales.length, movements: movements.length, invoices: invoices.length,
    },
  };
}

/**
 * One full cycle: push what changed, pull what others changed, merge.
 *
 * Push first so local work is durable before anything can overwrite it, and so
 * the pull sees this device's own rows echoed back with server timestamps.
 */
export async function syncOnce({ businesses, userId, lastPushedAt, lastPulledAt }) {
  if (!isBackendConfigured || !userId) {
    return { ok: false, reason: "not-configured", businesses };
  }
  try {
    const push = await pushChanges({ businesses, userId, since: lastPushedAt });
    const pull = await pullChanges({ since: lastPulledAt });
    return {
      ok: true,
      businesses: mergeBusinesses(businesses, pull.businesses),
      lastPushedAt: push.at,
      lastPulledAt: pull.at,
      pushed: push.pushed,
      pulled: pull.counts,
    };
  } catch (err) {
    // Local data is untouched either way and the same cursors retry next time.
    // What changes is what we CALL it: being offline is the normal case and is
    // deferred quietly; anything else is a fault and says so, loudly enough to
    // find in a console a week later.
    const offline = looksOffline(err);
    if (offline) console.warn("[BizTrack] Sync deferred (offline):", err.message);
    else console.error("[BizTrack] Sync FAILED (not a connection problem):", err.message);
    return { ok: false, reason: offline ? "offline" : "failed", error: err.message, businesses };
  }
}
