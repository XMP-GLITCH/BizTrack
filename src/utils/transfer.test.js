import test from "node:test";
import assert from "node:assert/strict";

import { buildBackup } from "./transfer.js";
import { parseBackup } from "../domain/migrate.js";

/**
 * Transfer is how someone moves their books to a new phone, and the only route
 * across a domain change — browser storage is per-origin, so books saved at one
 * address are invisible at another.
 *
 * The guarantee worth testing is the round trip: a file this module writes must
 * be readable by the thing that restores it. Everything else is detail. It had
 * no tests, and it has already shipped one live bug where transfer-between-
 * phones failed on every first attempt.
 */

const biz = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sabi Crochet",
  category: "Crochet",
  currency: "XAF",
  items: [],
  sales: [],
  stockMovements: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

test("a backup carries everything needed to rebuild a device", () => {
  const out = buildBackup({
    businesses: [biz()],
    userName: "Arrey",
    userEmail: "hello@biztrack.store",
    currency: "XAF",
    lowStockThreshold: 5,
  });

  assert.equal(out.format, "biztrack-backup");
  assert.equal(out.version, 1);
  assert.ok(out.exportedAt, "stamped, so a person can tell two files apart");
  assert.equal(out.businesses.length, 1);
  assert.equal(out.userName, "Arrey");
  assert.equal(out.lowStockThreshold, 5);
});

test("missing settings fall back rather than producing undefined", () => {
  // A half-written file is the failure this module exists to avoid, so the
  // writer must never emit holes even when the store is incomplete.
  const out = buildBackup({ businesses: [biz()] });
  assert.equal(out.currency, "XAF");
  assert.equal(out.lowStockThreshold, 3);
  assert.equal(out.userName, "");
  assert.equal(out.userEmail, "");
});

test("no businesses still produces a valid file, not a broken one", () => {
  const out = buildBackup({});
  assert.deepEqual(out.businesses, []);
  assert.ok(parseBackup(out), "an empty backup is still restorable");
});

test("ROUND TRIP: what we write, the restorer can read", () => {
  // The whole point of the module. If this breaks, someone moving phones loses
  // their books and finds out only after wiping the old device.
  const original = biz({
    items: [{
      id: "22222222-2222-4222-8222-222222222222",
      name: "Wool hat",
      unitPrice: 3500,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }],
    sales: [{
      id: "33333333-3333-4333-8333-333333333333",
      itemId: "22222222-2222-4222-8222-222222222222",
      itemName: "Wool hat",
      qty: 2,
      unitPrice: 3500,
      unitCost: 1200,
      occurredAt: "2026-09-02T00:00:00.000Z",
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    }],
    stockMovements: [{
      id: "44444444-4444-4444-8444-444444444444",
      itemId: "22222222-2222-4222-8222-222222222222",
      delta: 10,
      unitCost: 1200,
      reason: "initial",
      occurredAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-09-01T00:00:00.000Z",
    }],
  });

  const file = buildBackup({ businesses: [original], currency: "XAF", lowStockThreshold: 3 });

  // Through JSON, exactly as a real file goes to disk and back.
  const restored = parseBackup(JSON.parse(JSON.stringify(file)), "XAF");

  assert.ok(restored, "the file parses");
  assert.equal(restored.businesses.length, 1);

  const b = restored.businesses[0];
  assert.equal(b.name, "Sabi Crochet");
  assert.equal(b.items.length, 1, "the item survived");
  assert.equal(b.sales.length, 1, "the sale survived");
  assert.equal(b.stockMovements.length, 1, "the ledger survived");

  // Money is an integer in the minor unit and must come back identical --
  // a backup that quietly changes a price is worse than one that fails.
  assert.equal(b.items[0].unitPrice, 3500);
  assert.equal(b.sales[0].unitPrice, 3500);
  assert.equal(b.sales[0].unitCost, 1200);
  assert.equal(b.stockMovements[0].delta, 10);
});

test("a file missing its businesses array is refused, not half-restored", () => {
  // Truncation produces valid-looking JSON right up until it does not. A
  // partial restore of someone's books is worse than a refusal.
  assert.equal(parseBackup({ format: "biztrack-backup", version: 1 }), null);
  assert.equal(parseBackup(null), null);
  assert.equal(parseBackup("not an object"), null);
});
