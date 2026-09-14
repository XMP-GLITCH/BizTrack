import test from "node:test";
import assert from "node:assert/strict";

import { toMinor, toMajor, formatMoney, marginPercent } from "./money.js";
import { deriveItemState, deriveInventory, MOVEMENT } from "./inventory.js";
import { calcBizStats } from "./stats.js";
import { migrateLegacyBusiness, parseBackup, migrateState, verifyMigration } from "./migrate.js";
import { makeBusiness, sanitizeBusiness, isLegacyBusiness } from "./schema.js";

/* ── money ─────────────────────────────────────────────────────────────────── */

test("XAF has no subunit, so minor units equal major units", () => {
  assert.equal(toMinor(1500, "XAF"), 1500);
  assert.equal(toMajor(1500, "XAF"), 1500);
});

test("two-decimal currencies scale by 100", () => {
  assert.equal(toMinor(15.0, "USD"), 1500);
  assert.equal(toMinor(15.99, "USD"), 1599);
  assert.equal(toMajor(1599, "USD"), 15.99);
});

test("money survives the float arithmetic that used to drift", () => {
  // 0.1 + 0.2 !== 0.3 in floats; in minor units it is exact.
  assert.equal(toMinor(0.1, "USD") + toMinor(0.2, "USD"), toMinor(0.3, "USD"));
});

test("garbage input becomes zero rather than NaN", () => {
  assert.equal(toMinor("abc", "XAF"), 0);
  assert.equal(toMinor(undefined, "XAF"), 0);
  assert.equal(toMinor(null, "XAF"), 0);
});

test("unknown currency codes fall back to XAF instead of throwing", () => {
  assert.equal(toMinor(100, "ZZZ"), 100);
  assert.doesNotThrow(() => formatMoney(1000, "ZZZ"));
});

test("margin of zero revenue is 0%, not NaN%", () => {
  assert.equal(marginPercent(0, 0), 0);
  assert.equal(marginPercent(0, 500), 0);
  assert.equal(marginPercent(1000, 700), 30);
});

/* ── stock ledger ──────────────────────────────────────────────────────────── */

const mv = (delta, unitCost, occurredAt, reason = MOVEMENT.RESTOCK) => ({
  id: `m${occurredAt}${delta}`, itemId: "i1", delta, unitCost, reason, occurredAt,
});

test("quantity is the sum of movements", () => {
  const s = deriveItemState([
    mv(20, 1500, "2026-01-01T00:00:00Z"),
    mv(-3, 0, "2026-01-05T00:00:00Z"),
    mv(10, 1500, "2026-01-09T00:00:00Z"),
  ]);
  assert.equal(s.qty, 27);
  assert.equal(s.sold, 3);
  assert.equal(s.purchased, 30);
});

test("restocking at a new price gives a weighted average, not an overwrite", () => {
  // 10 @ 1500 then 10 @ 2000 -> 1750, not 2000. The old code overwrote `cost`,
  // repricing stock that was bought cheaper.
  const s = deriveItemState([
    mv(10, 1500, "2026-01-01T00:00:00Z"),
    mv(10, 2000, "2026-02-01T00:00:00Z"),
  ]);
  assert.equal(s.avgCost, 1750);
});

test("selling does not change the average cost", () => {
  const s = deriveItemState([
    mv(10, 1500, "2026-01-01T00:00:00Z"),
    mv(10, 2000, "2026-02-01T00:00:00Z"),
    mv(-5, 0, "2026-03-01T00:00:00Z"),
  ]);
  assert.equal(s.avgCost, 1750);
  assert.equal(s.qty, 15);
});

test("movements converge regardless of arrival order (offline sync)", () => {
  const a = [mv(10, 1500, "2026-01-01T00:00:00Z"), mv(10, 2000, "2026-02-01T00:00:00Z"), mv(-5, 0, "2026-03-01T00:00:00Z")];
  const shuffled = [a[2], a[0], a[1]];
  assert.deepEqual(deriveItemState(shuffled), deriveItemState(a));
});

test("two offline devices selling the last unit both survive the merge", () => {
  // The counter model lost one of these: both wrote qty:4 and last-write-wins.
  const s = deriveItemState([
    mv(5, 1000, "2026-01-01T00:00:00Z"),
    mv(-1, 0, "2026-01-02T09:00:00Z", MOVEMENT.SALE),
    mv(-1, 0, "2026-01-02T09:00:01Z", MOVEMENT.SALE),
  ]);
  assert.equal(s.qty, 3);
  assert.equal(s.sold, 2);
});

test("stock may go negative and is reported, not silently clamped", () => {
  const s = deriveItemState([mv(1, 1000, "2026-01-01T00:00:00Z"), mv(-3, 0, "2026-01-02T00:00:00Z")]);
  assert.equal(s.qty, -2);
});

/* ── legacy migration ──────────────────────────────────────────────────────── */

const legacy = {
  id: "abc123",
  name: "Sabi Crochet",
  category: "Crochet",
  color: "#C17F5A",
  emoji: "\u{1F9F6}",
  inventory: [
    { id: "1", name: "Bucket Hat", qty: 12, cost: 1500, price: 4500, sold: 8 },
    { id: "2", name: "Tote Bag", qty: 3, cost: 2000, price: 6000, sold: 2 },
  ],
  sales: [
    { id: "s1", itemName: "Bucket Hat", qty: 5, askingPrice: 4500, actualPrice: 4500, revenue: 22500, cost: 7500, date: "2026-04-01" },
    { id: "s2", itemName: "Bucket Hat", qty: 3, askingPrice: 4500, actualPrice: 4000, revenue: 12000, cost: 4500, date: "2026-04-08" },
    { id: "s3", itemName: "Tote Bag", qty: 2, askingPrice: 6000, actualPrice: 6000, revenue: 12000, cost: 4000, date: "2026-04-10" },
    { id: "s4", itemName: "Custom Beanie", qty: 1, actualPrice: 8000, revenue: 8000, cost: 2500, date: "2026-04-12", isCustom: true },
  ],
};

test("migration reproduces every stored quantity exactly", () => {
  const migrated = migrateLegacyBusiness(legacy, "XAF");
  const derived = deriveInventory(migrated);
  for (const legacyItem of legacy.inventory) {
    const item = derived.find((i) => i.name === legacyItem.name);
    assert.ok(item, `missing item ${legacyItem.name}`);
    assert.equal(item.qty, legacyItem.qty, `qty drifted for ${legacyItem.name}`);
  }
});

test("migration preserves total revenue and profit", () => {
  const migrated = migrateLegacyBusiness(legacy, "XAF");
  const stats = calcBizStats(migrated);
  const legacyRevenue = legacy.sales.reduce((s, x) => s + x.revenue, 0);
  const legacyCost = legacy.sales.reduce((s, x) => s + x.cost, 0);
  assert.equal(stats.revenue, legacyRevenue);
  assert.equal(stats.cogs, legacyCost);
  assert.equal(stats.profit, legacyRevenue - legacyCost);
});

test("migration links sales back to their items by name", () => {
  const migrated = migrateLegacyBusiness(legacy, "XAF");
  const hat = migrated.items.find((i) => i.name === "Bucket Hat");
  const hatSales = migrated.sales.filter((s) => s.itemId === hat.id);
  assert.equal(hatSales.length, 2);
  // The custom sale is deliberately unlinked.
  const custom = migrated.sales.find((s) => s.itemName === "Custom Beanie");
  assert.equal(custom.itemId, null);
  assert.equal(custom.isCustom, true);
});

test("a sale naming a deleted item keeps its revenue and carries no link", () => {
  const withGhost = {
    ...legacy,
    inventory: [legacy.inventory[0]],
    sales: [...legacy.sales, { id: "s9", itemName: "Deleted Thing", qty: 2, actualPrice: 3000, revenue: 6000, cost: 2000, date: "2026-04-15" }],
  };
  const migrated = migrateLegacyBusiness(withGhost, "XAF");
  const ghost = migrated.sales.find((s) => s.itemName === "Deleted Thing");
  assert.equal(ghost.itemId, null);
  assert.equal(calcBizStats(migrated).revenue, withGhost.sales.reduce((s, x) => s + x.revenue, 0));
});

test("the drifted `sold` counter is rebuilt from the sales list", () => {
  // Stored counter says 99; only 8 units appear in the sales list. The sales
  // list wins -- the counter is the one that drifted when items were deleted.
  const drifted = { ...legacy, inventory: [{ ...legacy.inventory[0], sold: 99 }, legacy.inventory[1]] };
  const migrated = migrateLegacyBusiness(drifted, "XAF");
  const hat = deriveInventory(migrated).find((i) => i.name === "Bucket Hat");
  assert.equal(hat.sold, 8);
  assert.equal(hat.qty, 12);
});

test("migration is idempotent -- a migrated business is not re-migrated", () => {
  const once = migrateLegacyBusiness(legacy, "XAF");
  assert.equal(isLegacyBusiness(once), false);
  const twice = sanitizeBusiness(once);
  assert.equal(twice.items.length, once.items.length);
  assert.equal(twice.sales.length, once.sales.length);
  assert.equal(twice.stockMovements.length, once.stockMovements.length);
});

test("two-decimal currencies migrate into minor units", () => {
  const usd = { ...legacy, inventory: [{ id: "1", name: "Hat", qty: 1, cost: 12.5, price: 40, sold: 0 }], sales: [] };
  const migrated = migrateLegacyBusiness(usd, "USD");
  assert.equal(migrated.items[0].unitPrice, 4000);
  assert.equal(deriveInventory(migrated)[0].avgCost, 1250);
});

/* ── store migration + backups ─────────────────────────────────────────────── */

test("whole-store migration converts every business", () => {
  const next = migrateState({ businesses: [legacy], currency: "XAF", userName: "Sabi" });
  assert.equal(next.businesses.length, 1);
  assert.equal(isLegacyBusiness(next.businesses[0]), false);
  assert.equal(next.userName, "Sabi");
});

test("store migration tolerates a corrupt businesses field", () => {
  assert.deepEqual(migrateState({ businesses: "not an array" }).businesses, []);
  assert.deepEqual(migrateState({}).businesses, []);
  assert.deepEqual(migrateState(null).businesses, []);
});

test("backup codes from older builds still restore", () => {
  const parsed = parseBackup({ businesses: [legacy], currency: "XAF", userName: "Sabi" });
  assert.equal(parsed.businesses.length, 1);
  assert.equal(parsed.businesses[0].items.length, 2);
  assert.equal(calcBizStats(parsed.businesses[0]).revenue, 54500);
});

test("malformed backup codes are rejected instead of corrupting the store", () => {
  assert.equal(parseBackup(null), null);
  assert.equal(parseBackup({}), null);
  assert.equal(parseBackup({ businesses: "nope" }), null);
  assert.equal(parseBackup("just a string"), null);
});

test("a backup of the current shape round-trips", () => {
  const current = migrateLegacyBusiness(legacy, "XAF");
  const parsed = parseBackup({ businesses: [current], currency: "XAF" });
  assert.equal(parsed.businesses[0].items.length, 2);
  assert.equal(calcBizStats(parsed.businesses[0]).revenue, 54500);
});

test("orphan stock movements are dropped on import", () => {
  const b = makeBusiness({ name: "X" });
  const dirty = { ...b, stockMovements: [{ id: "m1", itemId: "ghost", delta: 5, reason: "initial", occurredAt: "2026-01-01T00:00:00Z" }] };
  assert.equal(sanitizeBusiness(dirty).stockMovements.length, 0);
});

/* ── data-safety guarantees ────────────────────────────────────────────────── */

test("migration never throws, whatever it is handed", () => {
  const hostile = [
    null, undefined, 0, "", "a string", [], {},
    { businesses: null }, { businesses: 0 }, { businesses: {} },
    { businesses: [null, undefined, 0, "x", []] },
    { businesses: [{ inventory: null, sales: null }] },
    { businesses: [{ inventory: [null, { qty: "abc", cost: {}, price: [] }], sales: [null, { qty: -5 }] }] },
    { businesses: [{ inventory: [{ name: "X", qty: Infinity, cost: NaN, price: -1 }], sales: [{ itemName: "X", qty: 1e9 }] }] },
    { currency: 12345, businesses: [{ name: {}, inventory: [], sales: [] }] },
  ];
  for (const input of hostile) {
    assert.doesNotThrow(() => migrateState(input), `threw on ${JSON.stringify(input)}`);
    const out = migrateState(input);
    assert.ok(Array.isArray(out.businesses), `businesses not an array for ${JSON.stringify(input)}`);
  }
});

test("one unreadable business does not cost the user the others", () => {
  const poison = { name: "Poison", get inventory() { throw new Error("unreadable"); }, sales: [] };
  const out = migrateState({ businesses: [legacy, poison, { ...legacy, name: "Third" }], currency: "XAF" });
  assert.equal(out.businesses.length, 2, "readable businesses survive");
  assert.equal(out.unreadableBusinesses.length, 1, "the bad one is preserved verbatim, not dropped");
  assert.equal(out.businesses[0].name, "Sabi Crochet");
  assert.equal(out.businesses[1].name, "Third");
});

test("verification passes on a clean migration", () => {
  const out = migrateState({ businesses: [legacy], currency: "XAF" });
  const report = verifyMigration([legacy], out.businesses);
  assert.equal(report.ok, true, report.issues.join("; "));
  assert.deepEqual(report.issues, []);
});

test("verification catches a dropped business", () => {
  const report = verifyMigration([legacy, { ...legacy, name: "Second" }], migrateState({ businesses: [legacy] }).businesses);
  assert.equal(report.ok, false);
  assert.match(report.issues.join(" "), /business count changed/);
});

test("verification catches a lost item, sale, or wrong quantity", () => {
  const out = migrateState({ businesses: [legacy], currency: "XAF" });

  const missingItem = structuredClone(out.businesses);
  missingItem[0].items = missingItem[0].items.slice(1);
  assert.equal(verifyMigration([legacy], missingItem).ok, false);

  const missingSale = structuredClone(out.businesses);
  missingSale[0].sales = missingSale[0].sales.slice(1);
  assert.match(verifyMigration([legacy], missingSale).issues.join(" "), /sales before/);

  const wrongQty = structuredClone(out.businesses);
  wrongQty[0].stockMovements = wrongQty[0].stockMovements.filter((m) => m.reason !== "initial");
  assert.match(verifyMigration([legacy], wrongQty).issues.join(" "), /in stock, now/);
});

test("every sale survives migration even when its item is unmatched", () => {
  const messy = {
    ...legacy,
    inventory: [],                       // every item deleted
    sales: legacy.sales,                 // but the sales remain
  };
  const out = migrateState({ businesses: [messy], currency: "XAF" });
  assert.equal(out.businesses[0].sales.length, legacy.sales.length);
  assert.equal(
    calcBizStats(out.businesses[0]).revenue,
    legacy.sales.reduce((s, x) => s + x.revenue, 0),
    "revenue preserved with no items to link to",
  );
  assert.equal(verifyMigration([messy], out.businesses).ok, true);
});

test("re-running migration on migrated data changes nothing", () => {
  const once = migrateState({ businesses: [legacy], currency: "XAF" });
  const twice = migrateState(once);
  assert.equal(twice.businesses.length, once.businesses.length);
  assert.equal(calcBizStats(twice.businesses[0]).revenue, calcBizStats(once.businesses[0]).revenue);
  assert.deepEqual(
    deriveInventory(twice.businesses[0]).map((i) => [i.name, i.qty, i.avgCost]),
    deriveInventory(once.businesses[0]).map((i) => [i.name, i.qty, i.avgCost]),
  );
  assert.equal(verifyMigration(once.businesses, twice.businesses).ok, true);
});
