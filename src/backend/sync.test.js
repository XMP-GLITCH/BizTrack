import test from "node:test";
import assert from "node:assert/strict";

import { collectChanges, mergeBusinesses } from "./sync.js";
import { makeBusiness, makeItem, makeSale, makeStockMovement } from "../domain/schema.js";
import { deriveInventory } from "../domain/inventory.js";
import { calcBizStats } from "../domain/stats.js";

const T = {
  old:    "2026-01-01T00:00:00.000Z",
  mid:    "2026-06-01T00:00:00.000Z",
  recent: "2026-09-01T00:00:00.000Z",
};

const biz = (over = {}) => ({ ...makeBusiness({ id: "b1", name: "Sabi Crochet" }), ...over });
const item = (over = {}) => makeItem({ id: "i1", name: "Bucket Hat", unitPrice: 4500, ...over });
const sale = (over = {}) => makeSale({ id: "s1", itemId: "i1", itemName: "Bucket Hat", qty: 1, unitPrice: 4500, unitCost: 1500, ...over });
const move = (over = {}) => makeStockMovement({ id: "m1", itemId: "i1", delta: 10, unitCost: 1500, reason: "initial", ...over });

/* ── what gets pushed ──────────────────────────────────────────────────────── */

test("a first sync pushes everything", () => {
  const local = [{ ...biz(), items: [item()], sales: [sale()], stockMovements: [move()] }];
  const out = collectChanges(local, null);
  assert.equal(out.length, 1);
  assert.equal(out[0].items.length, 1);
  assert.equal(out[0].sales.length, 1);
  assert.equal(out[0].stockMovements.length, 1);
});

test("an unchanged account pushes nothing", () => {
  const local = [{
    ...biz({ updatedAt: T.old }),
    items: [item({ updatedAt: T.old })],
    sales: [sale({ updatedAt: T.old })],
    stockMovements: [move({ createdAt: T.old })],
  }];
  assert.deepEqual(collectChanges(local, T.recent), [], "nothing newer than the cursor");
});

test("only records changed since the cursor are pushed", () => {
  const local = [{
    ...biz({ updatedAt: T.old }),
    items: [item({ id: "i-old", updatedAt: T.old }), item({ id: "i-new", updatedAt: T.recent })],
    sales: [sale({ id: "s-old", updatedAt: T.old }), sale({ id: "s-new", updatedAt: T.recent })],
    stockMovements: [move({ id: "m-old", createdAt: T.old }), move({ id: "m-new", createdAt: T.recent })],
  }];
  const [out] = collectChanges(local, T.mid);
  assert.deepEqual(out.items.map((i) => i.id), ["i-new"]);
  assert.deepEqual(out.sales.map((s) => s.id), ["s-new"]);
  assert.deepEqual(out.stockMovements.map((m) => m.id), ["m-new"]);
});

test("a business with only changed children is still pushed, for the foreign keys", () => {
  const local = [{ ...biz({ updatedAt: T.old }), items: [], sales: [sale({ updatedAt: T.recent })], stockMovements: [] }];
  const out = collectChanges(local, T.mid);
  assert.equal(out.length, 1, "the parent row must accompany its children");
});

test("a soft delete is pushed like any other change", () => {
  const local = [{ ...biz({ updatedAt: T.old }), items: [item({ updatedAt: T.recent, deletedAt: T.recent })], sales: [], stockMovements: [] }];
  const [out] = collectChanges(local, T.mid);
  assert.equal(out.items.length, 1);
  assert.ok(out.items[0].deletedAt, "the tombstone travels");
});

/* ── merge: mutable records ────────────────────────────────────────────────── */

test("a newer remote edit wins", () => {
  const local = [{ ...biz({ name: "Old Name", updatedAt: T.old }), items: [], sales: [], stockMovements: [] }];
  const remote = [{ ...biz({ name: "New Name", updatedAt: T.recent }), items: [], sales: [], stockMovements: [] }];
  assert.equal(mergeBusinesses(local, remote)[0].name, "New Name");
});

test("a newer local edit is not clobbered by a stale server row", () => {
  const local = [{ ...biz({ name: "Local Edit", updatedAt: T.recent }), items: [], sales: [], stockMovements: [] }];
  const remote = [{ ...biz({ name: "Stale", updatedAt: T.old }), items: [], sales: [], stockMovements: [] }];
  assert.equal(mergeBusinesses(local, remote)[0].name, "Local Edit");
});

test("a business only on the server is adopted", () => {
  const remote = [{ ...biz({ id: "b2", name: "From Other Device" }), items: [], sales: [], stockMovements: [] }];
  const merged = mergeBusinesses([], remote);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, "From Other Device");
});

test("a business not yet pushed is kept, not dropped", () => {
  const local = [{ ...biz({ id: "b-local" }), items: [], sales: [], stockMovements: [] }];
  const merged = mergeBusinesses(local, []);
  assert.equal(merged.length, 1, "an empty pull must never delete local work");
});

test("a stale parent does not drag back a child edited more recently", () => {
  const local = [{
    ...biz({ updatedAt: T.old }),
    items: [item({ name: "Renamed Locally", updatedAt: T.recent })],
    sales: [], stockMovements: [],
  }];
  const remote = [{
    ...biz({ updatedAt: T.recent }),
    items: [item({ name: "Old Name", updatedAt: T.old })],
    sales: [], stockMovements: [],
  }];
  assert.equal(mergeBusinesses(local, remote)[0].items[0].name, "Renamed Locally");
});

test("a remote tombstone propagates over an older local edit", () => {
  const local = [{ ...biz(), items: [item({ updatedAt: T.old })], sales: [], stockMovements: [] }];
  const remote = [{ ...biz(), items: [item({ updatedAt: T.recent, deletedAt: T.recent })], sales: [], stockMovements: [] }];
  assert.ok(mergeBusinesses(local, remote)[0].items[0].deletedAt, "the delete wins");
});

/* ── merge: the guarantee the ledger exists for ────────────────────────────── */

test("two devices each selling the last unit both keep their sale", () => {
  // The counter model lost one of these: both wrote qty:4, last write won.
  const base = { ...biz(), items: [item()], sales: [], stockMovements: [move({ delta: 5 })] };

  const deviceA = [{ ...base,
    sales: [sale({ id: "sale-A", qty: 1 })],
    stockMovements: [move({ delta: 5 }), move({ id: "mv-A", delta: -1, reason: "sale", saleId: "sale-A" })] }];

  const deviceB = [{ ...base,
    sales: [sale({ id: "sale-B", qty: 1 })],
    stockMovements: [move({ delta: 5 }), move({ id: "mv-B", delta: -1, reason: "sale", saleId: "sale-B" })] }];

  const merged = mergeBusinesses(deviceA, deviceB);
  assert.equal(merged[0].sales.length, 2, "neither sale is lost");
  assert.equal(calcBizStats(merged[0]).revenue, 9000, "both sales count toward revenue");
  assert.equal(deriveInventory(merged[0])[0].qty, 3, "stock reflects both sales");
});

test("stock movements never duplicate when the same sync runs twice", () => {
  const local = [{ ...biz(), items: [item()], sales: [sale()], stockMovements: [move(), move({ id: "m2", delta: -2, reason: "sale" })] }];
  const once = mergeBusinesses(local, local);
  const twice = mergeBusinesses(once, local);
  assert.equal(twice[0].stockMovements.length, 2);
  assert.equal(twice[0].sales.length, 1);
  assert.equal(deriveInventory(twice[0])[0].qty, deriveInventory(local[0])[0].qty);
});

test("merging is idempotent — re-syncing changes nothing", () => {
  const local = [{ ...biz(), items: [item()], sales: [sale()], stockMovements: [move()] }];
  const remote = [{ ...biz(), items: [item()], sales: [sale({ id: "s-remote" })], stockMovements: [move({ id: "m-remote", delta: -1, reason: "sale" })] }];

  const first = mergeBusinesses(local, remote);
  const second = mergeBusinesses(first, remote);
  assert.equal(second[0].sales.length, first[0].sales.length);
  assert.equal(second[0].stockMovements.length, first[0].stockMovements.length);
  assert.equal(calcBizStats(second[0]).revenue, calcBizStats(first[0]).revenue);
});

test("sales stay newest-first after a merge", () => {
  const local = [{ ...biz(), items: [], sales: [sale({ id: "s-old", occurredAt: T.old })], stockMovements: [] }];
  const remote = [{ ...biz(), items: [], sales: [sale({ id: "s-new", occurredAt: T.recent })], stockMovements: [] }];
  assert.deepEqual(mergeBusinesses(local, remote)[0].sales.map((s) => s.id), ["s-new", "s-old"]);
});

test("merging tolerates missing collections", () => {
  assert.doesNotThrow(() => mergeBusinesses([{ id: "b1" }], [{ id: "b1" }]));
  assert.doesNotThrow(() => mergeBusinesses(null, null));
  assert.deepEqual(mergeBusinesses(null, null), []);
});
