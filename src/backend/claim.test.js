import test from "node:test";
import assert from "node:assert/strict";

/**
 * The claim flow decides what happens the first time books already on a device
 * meet an account. It is the one path where a mistake destroys someone's only
 * copy of their business records, and it had no tests at all.
 *
 * These cover the rules that actually protect data, not the happy path:
 * counting honestly, never overwriting the safety copy, and never treating an
 * unreachable server as an empty one.
 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const {
  summarizeLocal, savePreClaimBackup, readPreClaimBackup, inspectRemote, PRE_CLAIM_KEY,
} = await import("./claim.js");

const biz = (over = {}) => ({
  id: "b1", name: "Sabi Crochet", items: [], sales: [], stockMovements: [], ...over,
});

test("summarizeLocal counts what the user would count", () => {
  const summary = summarizeLocal([
    biz({ items: [{ id: "i1" }, { id: "i2" }], sales: [{ id: "s1" }] }),
    biz({ id: "b2", items: [{ id: "i3" }], sales: [{ id: "s2" }, { id: "s3" }] }),
  ]);
  assert.deepEqual(summary, { businesses: 2, items: 3, sales: 3 });
});

test("summarizeLocal ignores tombstones, because the user cannot see them", () => {
  // Deletes are soft so they can sync. Showing "5 items" on the claim screen
  // when the user sees 2 would make the whole screen untrustworthy.
  const summary = summarizeLocal([
    biz({
      items: [{ id: "i1" }, { id: "i2", deletedAt: "2026-09-01T00:00:00Z" }],
      sales: [{ id: "s1", deletedAt: "2026-09-01T00:00:00Z" }],
    }),
    biz({ id: "b2", deletedAt: "2026-09-01T00:00:00Z" }),
  ]);
  assert.deepEqual(summary, { businesses: 1, items: 1, sales: 0 });
});

test("summarizeLocal survives empty, null and malformed input", () => {
  assert.deepEqual(summarizeLocal([]), { businesses: 0, items: 0, sales: 0 });
  assert.deepEqual(summarizeLocal(null), { businesses: 0, items: 0, sales: 0 });
  assert.deepEqual(summarizeLocal(undefined), { businesses: 0, items: 0, sales: 0 });
  assert.deepEqual(summarizeLocal([{ id: "b1" }]), { businesses: 1, items: 0, sales: 0 });
});

test("the safety copy is written before anything changes", () => {
  mem.clear();
  const books = [biz({ items: [{ id: "i1" }] })];
  assert.equal(savePreClaimBackup(books), true);

  const saved = readPreClaimBackup();
  assert.equal(saved.businesses.length, 1);
  assert.equal(saved.businesses[0].items[0].id, "i1");
  assert.equal(saved.reason, "before-first-account-sync");
  assert.ok(saved.savedAt, "records when it was taken");
});

test("the safety copy is NEVER overwritten once written", () => {
  // Its whole value is being the state BEFORE the operation. A second write
  // would replace it with the state after -- which is the thing it exists to
  // protect against. Same rule as the pre-ledger snapshot.
  mem.clear();
  savePreClaimBackup([biz({ name: "Original" })]);
  savePreClaimBackup([biz({ name: "Overwritten" })]);

  assert.equal(readPreClaimBackup().businesses[0].name, "Original");
});

test("a refusal to save is reported, so the caller can refuse to destroy", () => {
  // `adopt` sets this device's books aside. If the snapshot cannot be written
  // the caller must abort rather than proceed unsafely, so the false return
  // has to be real rather than swallowed.
  mem.clear();
  const realSet = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  try {
    assert.equal(savePreClaimBackup([biz()]), false);
  } finally {
    globalThis.localStorage.setItem = realSet;
  }
});

test("readPreClaimBackup returns null rather than throwing on damaged JSON", () => {
  mem.clear();
  globalThis.localStorage.setItem(PRE_CLAIM_KEY, "{not json");
  assert.equal(readPreClaimBackup(), null);
});

test("an unreachable backend reports UNKNOWN, never 'empty'", async () => {
  // The single most important rule in this module. inspectRemote returning
  // null means "I could not find out". If that were ever read as "the account
  // is empty", the claim prompt would offer to replace real books with
  // nothing. With no credentials configured there is no backend to ask.
  assert.equal(await inspectRemote(), null);
});
