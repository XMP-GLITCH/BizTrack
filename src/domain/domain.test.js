import test from "node:test";
import assert from "node:assert/strict";

import { toMinor, toMajor, formatMoney, formatMoneyParts, marginPercent } from "./money.js";
import { deriveItemState, deriveInventory, MOVEMENT } from "./inventory.js";
import { calcBizStats, calcPortfolioStats, portfolioFinding, startOfMonth, startOfWeek, weeklyProfit, monthlyProfit, itemPerformance, inventoryHealth, stockValue, liveSales, STOCK } from "./stats.js";
import { migrateLegacyBusiness, parseBackup, migrateState, verifyMigration } from "./migrate.js";
import { makeBusiness, sanitizeBusiness, isLegacyBusiness, makeInvoice, invoiceTotal, PAYMENT_METHODS } from "./schema.js";

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

test("a display amount splits into a currency unit and its digits", () => {
  assert.deepEqual(formatMoneyParts(73100, "XAF"), { unit: "FCFA", value: "73,100" });
  assert.deepEqual(formatMoneyParts(1500, "USD"), { unit: "$", value: "15.00" });
});

test("the split drops the separator, so the unit is never rendered with a double gap", () => {
  // Intl separates the unit from the digits with a NON-BREAKING space (U+00A0),
  // not an ordinary one. Worth knowing: it is why a regex on formatMoney's
  // output that looks for " " does not match, and why the split has to drop
  // whitespace literals by character class rather than by equality with " ".
  const { unit, value } = formatMoneyParts(1250000, "XAF");
  assert.equal(unit, "FCFA");
  assert.equal(value, "1,250,000");
  assert.equal(formatMoney(1250000, "XAF"), "FCFA 1,250,000");
});

test("a negative amount keeps its sign on the digits, not orphaned before the unit", () => {
  // formatMoney writes "-FCFA 1,500", which rendered as two elements would put
  // the minus sign inside the quiet unit, where it is easy to miss on a loss.
  assert.deepEqual(formatMoneyParts(-1500, "XAF"), { unit: "FCFA", value: "-1,500" });
});

test("every supported currency splits without losing a character", () => {
  for (const cur of ["XAF", "NGN", "GHS", "KES", "USD", "EUR"]) {
    const { unit, value } = formatMoneyParts(123456, cur);
    const strip = (x) => x.replace(/\s/gu, "");
    assert.ok(unit.length > 0, cur + " lost its unit");
    assert.ok(/[0-9]/.test(value), cur + " lost its digits");
    assert.equal(strip(unit + value), strip(formatMoney(123456, cur)), cur + " round trip");
  }
});

test("stats are all-time unless a period is given", () => {
  const biz = { sales: [
    { qty: 1, unitPrice: 1000, unitCost: 400, occurredAt: "2026-09-14T10:00:00.000Z" },
    { qty: 1, unitPrice: 2000, unitCost: 500, occurredAt: "2026-08-02T10:00:00.000Z" },
  ] };
  assert.equal(calcBizStats(biz).revenue, 3000);
  assert.equal(calcBizStats(biz, { since: "2026-09-01" }).revenue, 1000);
  assert.equal(calcBizStats(biz, { since: "2026-09-01" }).salesCount, 1);
});

test("a period boundary is inclusive of its own first day", () => {
  // A sale made on the 1st belongs to that month. An exclusive bound would
  // quietly drop one day of trading from every monthly figure.
  const biz = { sales: [{ qty: 1, unitPrice: 500, unitCost: 0, occurredAt: "2026-09-01T00:00:00.000Z" }] };
  assert.equal(calcBizStats(biz, { since: "2026-09-01" }).revenue, 500);
});

test("the portfolio total scopes to the same period as each business", () => {
  const mk = (when) => ({ sales: [{ qty: 1, unitPrice: 1000, unitCost: 250, occurredAt: when }] });
  const all = [mk("2026-09-10T00:00:00.000Z"), mk("2026-07-10T00:00:00.000Z")];
  assert.equal(calcPortfolioStats(all).profit, 1500);
  assert.equal(calcPortfolioStats(all, { since: "2026-09-01" }).profit, 750);
});

test("startOfMonth returns the first of the month the given date falls in", () => {
  assert.equal(startOfMonth(new Date("2026-09-15T23:30:00.000Z")), "2026-09-01");
  assert.equal(startOfMonth(new Date("2026-01-01T00:00:00.000Z")), "2026-01-01");
});

const sale = (when, qty, price, cost, name) => ({
  qty, unitPrice: price, unitCost: cost, itemName: name, itemId: name, occurredAt: when,
});
const BOOKS = [{ id: "b1", name: "Sabi", currency: "XAF", sales: [
  sale("2026-09-15T10:00:00.000Z", 2, 6000, 2500, "Beanie"),
  sale("2026-09-08T10:00:00.000Z", 1, 9500, 4000, "Tote"),
  sale("2026-08-20T10:00:00.000Z", 3, 1000, 400, "Pie"),
] }];
const NOW = new Date("2026-09-15T12:00:00.000Z");

test("adjacent periods never double-count their shared boundary day", () => {
  // until is exclusive, so August and September partition the sales exactly.
  const aug = calcPortfolioStats(BOOKS, { since: "2026-08-01", until: "2026-09-01" });
  const sep = calcPortfolioStats(BOOKS, { since: "2026-09-01" });
  assert.equal(aug.profit, 1800);
  assert.equal(sep.profit, 12500);
  assert.equal(aug.profit + sep.profit, calcPortfolioStats(BOOKS).profit);
});

test("a week starts on Monday", () => {
  assert.equal(startOfWeek(NOW), "2026-09-14");                       // Tuesday -> Monday
  assert.equal(startOfWeek(new Date("2026-09-14T00:00:00.000Z")), "2026-09-14"); // Monday itself
  assert.equal(startOfWeek(new Date("2026-09-20T23:00:00.000Z")), "2026-09-14"); // Sunday
});

test("the weekly series keeps empty weeks as zeroes", () => {
  // A gap in trading is information. Skipping empty buckets would turn four
  // quiet weeks into a smooth line between two busy ones.
  const w = weeklyProfit(BOOKS, { weeks: 6, now: NOW });
  assert.equal(w.length, 6);
  assert.deepEqual(w.map((x) => x.profit), [0, 1800, 0, 0, 5500, 7000]);
  assert.equal(w[w.length - 1].start, "2026-09-14", "last bucket is the current week");
});

test("item performance is realised, not asking price times units", () => {
  const rows = itemPerformance(BOOKS);
  const beanie = rows.find((r) => r.name === "Beanie");
  assert.equal(beanie.units, 2);
  assert.equal(beanie.revenue, 12000);
  assert.equal(beanie.profit, 7000);   // (6000 - 2500) * 2, not unitPrice * sold
  assert.equal(beanie.margin, 58);
});

test("an item row carries its own id and picture, and a custom sale carries neither", () => {
  // Analytics is portfolio-wide, so the screen has no single business in hand
  // to look a photo up against. The row has to bring it.
  const books = [{
    id: "b", name: "B", currency: "XAF",
    items: [
      { id: "i1", name: "Beanie", photoId: "ph-1" },
      // Removed from the list, but it still sold what it sold.
      { id: "i2", name: "Gone", photoId: "ph-2", deletedAt: "2026-09-01T00:00:00.000Z" },
      { id: "i3", name: "No picture yet" },
    ],
    sales: [
      { itemId: "i1", itemName: "Beanie", qty: 1, unitPrice: 6000, unitCost: 2500, occurredAt: "2026-09-15T10:00:00.000Z" },
      { itemId: "i2", itemName: "Gone", qty: 1, unitPrice: 5000, unitCost: 2000, occurredAt: "2026-09-15T10:00:00.000Z" },
      { itemId: "i3", itemName: "No picture yet", qty: 1, unitPrice: 4000, unitCost: 1000, occurredAt: "2026-09-15T10:00:00.000Z" },
      { itemId: null, itemName: "Wedding shawl", qty: 1, unitPrice: 45000, unitCost: 12000, occurredAt: "2026-09-15T10:00:00.000Z" },
    ],
  }];
  const by = Object.fromEntries(itemPerformance(books).map((r) => [r.name, r]));

  assert.equal(by["Beanie"].itemId, "i1");
  assert.equal(by["Beanie"].photoId, "ph-1");

  // A soft-deleted product keeps its picture on the row it earned.
  assert.equal(by["Gone"].photoId, "ph-2");

  assert.equal(by["No picture yet"].photoId, null);

  // A custom sale has no product in the book, so it points at nothing rather
  // than borrowing someone else's picture.
  assert.equal(by["Wedding shawl"].itemId, null);
  assert.equal(by["Wedding shawl"].photoId, null);
  assert.equal(by["Wedding shawl"].isCustom, true);
});

test("ranking by profit and by revenue are not the same ranking", () => {
  // The screen this replaced sorted by units sold and printed revenue, so the
  // top row was not necessarily the biggest number on screen.
  const books = [{ id: "b", name: "B", currency: "XAF", sales: [
    sale("2026-09-15T10:00:00.000Z", 10, 1000, 900, "Cheap volume"),  // rev 10000, profit 1000
    sale("2026-09-15T10:00:00.000Z", 1, 9000, 2000, "One good sale"), // rev  9000, profit 7000
  ] }];
  const rows = itemPerformance(books);
  const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue)[0].name;
  const byProfit = [...rows].sort((a, b) => b.profit - a.profit)[0].name;
  assert.equal(byRevenue, "Cheap volume");
  assert.equal(byProfit, "One good sale");
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


/* ── invoices ──────────────────────────────────────────────────────────────── */

const invoice = (over = {}) => makeInvoice({
  customerName: "Mama Ngwa",
  lines: [
    { name: "Crochet Beanie", qty: 2, unitPrice: 6000 },
    { name: "Tote Bag", qty: 1, unitPrice: 9500 },
  ],
  ...over,
});

test("an unpaid invoice is NEVER revenue, because it can never reach sales", () => {
  // The guarantee this whole entity exists for. `calcBizStats` sums every
  // record in `business.sales`, so the only safe place for money that has not
  // arrived is somewhere that array does not reach.
  const inv = invoice();
  const biz = sanitizeBusiness({
    ...makeBusiness({ name: "B", currency: "XAF" }),
    invoices: [inv],
  });

  assert.equal(biz.invoices.length, 1);
  assert.equal(biz.sales.length, 0, "an invoice reached the sales ledger");

  const stats = calcBizStats(biz);
  assert.equal(stats.revenue, 0, "an unpaid invoice was counted as revenue");
  assert.equal(stats.profit, 0);
  assert.equal(stats.salesCount, 0);
});

test("marking an invoice paid still does not make it revenue", () => {
  // Paying it is a fact about the invoice. The money reaches the books only
  // when a real sale is recorded, which is a separate act on purpose.
  const paid = invoice({ paidAt: "2026-09-17T10:00:00.000Z", paidMethod: "Mobile money" });
  const biz = sanitizeBusiness({ ...makeBusiness({ name: "B" }), invoices: [paid] });

  assert.ok(biz.invoices[0].paidAt);
  assert.equal(calcBizStats(biz).revenue, 0);
});

test("the total is the sum of the lines, in minor units", () => {
  assert.equal(invoiceTotal(invoice()), 2 * 6000 + 9500);
  assert.equal(invoiceTotal(makeInvoice({})), 0);
  assert.equal(invoiceTotal(null), 0);
});

test("a line keeps its own price, so a sent invoice cannot change later", () => {
  // Same reason a sale snapshots its price: the customer is holding a document
  // and repricing the product must not contradict it.
  const inv = invoice();
  assert.equal(inv.lines[0].unitPrice, 6000);
  assert.equal(inv.lines[0].name, "Crochet Beanie");
});

test("a quantity below one is one, and a negative price is zero", () => {
  // A zero-quantity line would print an amount of nothing on a document asking
  // to be paid.
  const inv = makeInvoice({ lines: [{ name: "X", qty: 0, unitPrice: -50 }] });
  assert.equal(inv.lines[0].qty, 1);
  assert.equal(inv.lines[0].unitPrice, 0);
});

test("an unrecognised payment method is dropped rather than stored", () => {
  assert.equal(makeInvoice({ paidMethod: "chickens" }).paidMethod, "");
  assert.equal(makeInvoice({ paidMethod: "Cash" }).paidMethod, "Cash");
  assert.ok(PAYMENT_METHODS.includes("Mobile money"));
});

test("invoices survive a restore, which is what sanitize is for", () => {
  // `sanitizeBusiness` drops anything it does not name, so a field missing from
  // it disappears the first time someone moves phones.
  const restored = sanitizeBusiness(JSON.parse(JSON.stringify({
    ...makeBusiness({ name: "B" }),
    invoices: [invoice({ customerName: "Mama Ngwa", customerContact: "677 00 00 00" })],
  })));
  assert.equal(restored.invoices.length, 1);
  assert.equal(restored.invoices[0].customerName, "Mama Ngwa");
  assert.equal(restored.invoices[0].customerContact, "677 00 00 00");
  assert.equal(restored.invoices[0].lines.length, 2);
});


test("a deleted sale leaves the revenue with it", () => {
  // Soft deletes stay in the array so their tombstone can travel. Nothing in
  // stats.js used to exclude them, so correcting a mistaken sale would have
  // taken the row off the screen and left the money in the books.
  const kept = { id: "s1", itemId: "i1", itemName: "Beanie", qty: 1, unitPrice: 6000, unitCost: 2500, occurredAt: "2026-09-15T10:00:00.000Z" };
  const gone = { id: "s2", itemId: "i1", itemName: "Beanie", qty: 9, unitPrice: 6000, unitCost: 2500, occurredAt: "2026-09-15T11:00:00.000Z", deletedAt: "2026-09-16T00:00:00.000Z" };
  const biz = { id: "b", name: "B", currency: "XAF", items: [{ id: "i1", name: "Beanie" }], sales: [kept, gone] };

  assert.equal(liveSales(biz).length, 1);
  assert.equal(calcBizStats(biz).revenue, 6000, "a deleted sale was still counted as revenue");
  assert.equal(calcBizStats(biz).salesCount, 1);

  // And it must not reappear through the other two readers either.
  const weeks = weeklyProfit([biz], { weeks: 2, now: new Date("2026-09-17T00:00:00.000Z") });
  assert.equal(weeks.reduce((n, w) => n + w.salesCount, 0), 1);

  const rows = itemPerformance([biz]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].units, 1);
});

/* ── the one thing worth saying ─────────────────────────────────────────────── */
//
// `portfolioFinding` is a LADDER, and a ladder's bug is never the top rung: it
// is a rung that fires when a more urgent one should have. So every test below
// sets up a book where MORE than one rule is true and asserts which wins.

/** A business with one product, priced and stocked, and n of them sold. */
function shop({ name = "Shop", currency = "XAF", item = "Widget", cost = 100, price = 500, bought = 10, sold = 0 } = {}) {
  const biz = makeBusiness({ name, currency });
  const it = { id: name + "-item", name: item, unitPrice: price, createdAt: "2026-09-01T00:00:00.000Z" };
  const moves = [
    { id: name + "-in", itemId: it.id, delta: bought, unitCost: cost, reason: MOVEMENT.RESTOCK, occurredAt: "2026-09-01T00:00:00.000Z" },
  ];
  const sales = [];
  if (sold > 0) {
    sales.push({
      id: name + "-sale", itemId: it.id, itemName: item, qty: sold,
      unitPrice: price, unitCost: cost, occurredAt: "2026-09-10T00:00:00.000Z",
    });
    moves.push({ id: name + "-out", itemId: it.id, delta: -sold, unitCost: cost, reason: MOVEMENT.SALE, saleId: name + "-sale", occurredAt: "2026-09-10T00:00:00.000Z" });
  }
  return sanitizeBusiness({ ...biz, items: [it], sales, stockMovements: moves });
}

test("no businesses means no finding, rather than a cheerful one about nothing", () => {
  assert.equal(portfolioFinding([]).kind, "none");
  assert.equal(portfolioFinding(null).kind, "none");
});

test("oversold stock outranks every other finding", () => {
  // This book is ALSO concentrated and ALSO carries a thin margin, so a ladder
  // that checked in the wrong order would still return something plausible.
  const over = shop({ name: "A", bought: 2, sold: 5, cost: 490, price: 500 });
  const f = portfolioFinding([over, shop({ name: "B", sold: 1 })]);
  assert.equal(f.kind, "oversold");
  assert.equal(f.tone, "danger");
  assert.equal(f.qty, -3, "named the shelf that disagrees, not just that one does");
  assert.equal(f.bizName, "A");
});

test("a business at a loss outranks anything about margins or concentration", () => {
  const losing = shop({ name: "Losing", cost: 900, price: 500, bought: 10, sold: 4 });
  const f = portfolioFinding([losing, shop({ name: "Fine", sold: 2 })]);
  assert.equal(f.kind, "losing");
  assert.equal(f.bizName, "Losing");
  assert.equal(f.amount, 1600, "quoted the size of the hole, as a positive");
  assert.equal(f.currency, "XAF");
});

test("a top earner running low beats a thin margin elsewhere", () => {
  const earner = shop({ name: "Earner", cost: 100, price: 5000, bought: 10, sold: 8 });
  const thin = shop({ name: "Thin", item: "Cheap", cost: 95, price: 100, bought: 100, sold: 40 });
  const f = portfolioFinding([earner, thin], { lowStockThreshold: 3 });
  assert.equal(f.kind, "runningOut");
  assert.equal(f.itemName, "Widget");
  assert.equal(f.qty, 2);
});

test("running out only fires for something that actually earns", () => {
  // Two left, but of the product that earns least. A rule that fired on any
  // low stock would be the low-stock banner again, which Home already has.
  const big = shop({ name: "Big", item: "Big", cost: 100, price: 9000, bought: 50, sold: 20 });
  const small1 = shop({ name: "S1", item: "S1", cost: 10, price: 20, bought: 3, sold: 1 });
  const small2 = shop({ name: "S2", item: "S2", cost: 10, price: 20, bought: 3, sold: 1 });
  const small3 = shop({ name: "S3", item: "S3", cost: 10, price: 20, bought: 3, sold: 1 });
  const small4 = shop({ name: "S4", item: "S4", cost: 10, price: 20, bought: 3, sold: 1 });
  const f = portfolioFinding([big, small1, small2, small3, small4], { lowStockThreshold: 2 });
  assert.notEqual(f.kind, "runningOut", "a trinket running low led the whole screen");
});

test("volume on a thin margin is reported as volume, not as a bare margin", () => {
  const mover = shop({ name: "A", item: "Mover", cost: 90, price: 100, bought: 500, sold: 60 });
  // Deliberately NOT overstocked. It was 500 units, which made this fixture a
  // bigger `parked` finding than a thin-margin one, and the ladder correctly
  // said so: 49,700 of stock against 9,000 of revenue is the larger fact. The
  // test is about which rung wins, so the fixture has to isolate the rung.
  const rich = shop({ name: "B", item: "Rich", cost: 100, price: 1000, bought: 20, sold: 3 });
  const f = portfolioFinding([mover, rich]);
  assert.equal(f.kind, "thinMargin");
  assert.equal(f.mostSold, true, "the bestseller keeping the least is the actionable version");
  assert.equal(f.itemName, "Mover");
  assert.equal(f.units, 60);
  assert.equal(f.margin, 10);
});

test("a thin margin on one unit is noise and does not lead", () => {
  const fine = shop({ name: "A", item: "Fine", cost: 100, price: 1000, bought: 50, sold: 30 });
  const once = shop({ name: "B", item: "Once", cost: 99, price: 100, bought: 50, sold: 1 });
  const f = portfolioFinding([fine, once]);
  assert.equal(f.mostSold ?? null, null, "a single thin sale was promoted over everything");
});

test("concentration needs more than one business, because one shop is all of itself", () => {
  const solo = shop({ name: "Solo", sold: 5 });
  const f = portfolioFinding([solo]);
  assert.notEqual(f.kind, "concentrated", "one business was told it was concentrated");
});

test("concentration fires when one shop carries the income", () => {
  const most = shop({ name: "Most", cost: 100, price: 2000, bought: 100, sold: 50 });
  const rest = shop({ name: "Rest", cost: 100, price: 200, bought: 100, sold: 5 });
  const f = portfolioFinding([most, rest]);
  assert.equal(f.kind, "concentrated");
  assert.equal(f.bizName, "Most");
  assert.ok(f.share >= 60, `share was ${f.share}`);
});

test("a healthy spread says so rather than inventing a worry", () => {
  const a = shop({ name: "A", cost: 100, price: 400, bought: 100, sold: 20 });
  const b = shop({ name: "B", cost: 100, price: 400, bought: 100, sold: 18 });
  const f = portfolioFinding([a, b]);
  assert.equal(f.kind, "steady");
  assert.equal(f.bizCount, 2);
});

test("with nothing on any shelf there is no all-clear to give", () => {
  // "Nothing is running low" is a sentence about no data. A services business
  // that records only custom sales must not be reassured about stock it does
  // not keep.
  const services = sanitizeBusiness({
    ...makeBusiness({ name: "Services" }),
    sales: [{ id: "s1", itemId: null, itemName: "Repair", qty: 1, unitPrice: 5000, unitCost: 1000, occurredAt: "2026-09-10T00:00:00.000Z" }],
  });
  assert.equal(portfolioFinding([services]).kind, "none");
});

test("the finding never restates the month comparison above it", () => {
  // The summary card already says this month against last. Any kind that did
  // the same would be the screen printing one fact twice.
  const kinds = new Set();
  for (const books of [
    [shop({ name: "A", bought: 1, sold: 4 })],
    [shop({ name: "L", cost: 900, price: 100, sold: 2 })],
    [shop({ name: "A", cost: 90, price: 100, bought: 500, sold: 60 }), shop({ name: "B", sold: 2 })],
    [shop({ name: "A", sold: 5 }), shop({ name: "B", sold: 4 })],
  ]) kinds.add(portfolioFinding(books).kind);
  for (const k of kinds) {
    assert.ok(!/month|delta|last/i.test(k), `finding "${k}" duplicates the summary card`);
  }
});

/* ── inventory health ──────────────────────────────────────────────────────── */
//
// The fixtures below are the shape of the business that prompted this: one shop,
// several product lines, a quarter of trading, and two products carrying
// hundreds of units against a trickle of sales.

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString();

/** Build a shop from product lines, spreading each line's units over N sales. */
function stockedShop(lines, { name = "Shop", currency = "XAF" } = {}) {
  const items = [];
  const movements = [];
  const sales = [];
  lines.forEach((l, n) => {
    const id = "item-" + n;
    items.push({ id, name: l.name, unitPrice: l.price, createdAt: iso(Date.parse("2026-06-01")) });
    if (l.bought) {
      movements.push({
        id: "in-" + n, itemId: id, delta: l.bought, unitCost: l.cost,
        reason: MOVEMENT.RESTOCK, occurredAt: iso(Date.parse(l.boughtAt || "2026-06-03")),
      });
    }
    // Units are spread over `sales` separate sales so units and sale COUNT can
    // differ, which is the distinction the row could not make before.
    const count = l.sales || (l.sold ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const qty = Math.floor(l.sold / count) + (k < l.sold % count ? 1 : 0);
      if (qty <= 0) continue;
      const at = iso(Date.parse(l.soldAt || "2026-08-01") + k * DAY);
      sales.push({ id: "s-" + n + "-" + k, itemId: id, itemName: l.name, qty, unitPrice: l.price, unitCost: l.cost, occurredAt: at });
      movements.push({ id: "out-" + n + "-" + k, itemId: id, delta: -qty, unitCost: l.cost, reason: MOVEMENT.SALE, saleId: "s-" + n + "-" + k, occurredAt: at });
    }
  });
  return sanitizeBusiness({ ...makeBusiness({ name, currency }), items, sales, stockMovements: movements });
}

// `NOW` is declared above and is the same instant; reusing it rather than shadowing.

test("hundreds of units against a trickle of sales reads as overstocked, in months", () => {
  // 463 espresso machines, 37 sold since 3 June. Sell-through says 7%, which is
  // true and does nothing. Months of cover says the shelf lasts three years,
  // which is a decision.
  const shop = stockedShop([
    { name: "Espresso Machine", cost: 25000, price: 55000, bought: 500, boughtAt: "2026-06-03", sold: 37, sales: 33, soldAt: "2026-06-03" },
  ]);
  const [row] = inventoryHealth(shop, { now: NOW });

  assert.equal(row.qty, 463);
  assert.equal(row.soldInPeriod, 37);
  assert.equal(row.sellThrough, 7, "sell-through was " + row.sellThrough);
  // The pace is measured over the BUSINESS's trading window, first sale to
  // today, not over the days the product happened to sell on. Measuring it the
  // other way flatters anything that only started moving recently, which is
  // exactly the product an overstock check must not let through.
  assert.ok(row.monthsOfCover > 40 && row.monthsOfCover < 46, "cover was " + row.monthsOfCover + " months");
  assert.equal(row.status, STOCK.OVERSTOCKED);
});

test("a product selling as fast as it is stocked is a restock priority, not overstock", () => {
  const shop = stockedShop([
    { name: "Projector", cost: 20000, price: 55000, bought: 10, boughtAt: "2026-06-03", sold: 5, sales: 5 },
  ]);
  const [row] = inventoryHealth(shop, { now: NOW, lowStockThreshold: 5 });
  assert.equal(row.qty, 5);
  assert.equal(row.sellThrough, 50);
  assert.equal(row.status, STOCK.SOLD_OUT_RISK);
});

test("stock that has not moved at all is named as unsold, not as slow", () => {
  // There is no pace to divide by, so months of cover is null rather than
  // Infinity. A screen printing "Infinity months of stock" is a bug report.
  const shop = stockedShop([
    { name: "Big Flour Mixer", cost: 30000, price: 80000, bought: 19, boughtAt: "2026-06-03" },
  ]);
  const [row] = inventoryHealth(shop, { now: NOW });
  assert.equal(row.soldInPeriod, 0);
  assert.equal(row.monthsOfCover, null);
  assert.equal(row.status, STOCK.UNSOLD);
});

test("an item with stock and no cost behind it is flagged, because its margin is fiction", () => {
  // The case that started this: a product reporting a 100% margin because the
  // cost was never entered. The finding is computed here; whether to say it out
  // loud is the screen's business.
  const shop = stockedShop([
    { name: "Air cooler", cost: 0, price: 30000, bought: 5, boughtAt: "2026-06-03", sold: 1, sales: 1 },
    { name: "Coffee maker", cost: 10000, price: 20000, bought: 100, boughtAt: "2026-06-03", sold: 42, sales: 41 },
  ]);
  const rows = inventoryHealth(shop, { now: NOW });
  assert.equal(rows[0].costSuspect, true, "an item with no cost was not flagged");
  assert.equal(rows[1].costSuspect, false);

  const { value, unpriced } = stockValue(shop);
  assert.equal(unpriced, 1);
  assert.equal(value, 58 * 10000, "the unpriced item added nothing to the value, which is the honest total");
});

test("oversold and out of stock are different states and neither of them is low", () => {
  const shop = stockedShop([
    { name: "Oversold", cost: 100, price: 500, bought: 2, sold: 5, sales: 1 },
    { name: "Clean out", cost: 100, price: 500, bought: 4, sold: 4, sales: 2 },
  ]);
  const rows = inventoryHealth(shop, { now: NOW });
  assert.equal(rows[0].qty, -3);
  assert.equal(rows[0].status, STOCK.OVERSOLD);
  assert.equal(rows[1].qty, 0);
  assert.equal(rows[1].status, STOCK.OUT_OF_STOCK);
});

test("since the last restock counts only what sold AFTER it", () => {
  // The question asked holding the product: of the batch I last bought, how
  // much is gone. Sales from before that batch arrived answer something else.
  const shop = stockedShop([
    { name: "Canopy", cost: 50000, price: 110000, bought: 10, boughtAt: "2026-06-03", sold: 4, sales: 4, soldAt: "2026-06-10" },
  ]);
  const withSecondBatch = sanitizeBusiness({
    ...shop,
    stockMovements: [
      ...shop.stockMovements,
      { id: "in-late", itemId: "item-0", delta: 20, unitCost: 55000, reason: MOVEMENT.RESTOCK, occurredAt: iso(Date.parse("2026-09-01")) },
    ],
    sales: [
      ...shop.sales,
      { id: "s-late", itemId: "item-0", itemName: "Canopy", qty: 3, unitPrice: 110000, unitCost: 55000, occurredAt: iso(Date.parse("2026-09-05")) },
    ],
  });
  const [row] = inventoryHealth(withSecondBatch, { now: NOW });
  assert.equal(row.lastRestockAt, "2026-09-01", "took an older restock as the latest");
  assert.equal(row.lastRestockQty, 20);
  assert.equal(row.soldSinceRestock, 3, "counted sales from before the batch arrived");
  assert.equal(row.soldInPeriod, 7, "the period total should still be every sale");
});

test("a period bounds the pace, so a quiet month does not read as a dead product", () => {
  const shop = stockedShop([
    { name: "Seasonal", cost: 100, price: 500, bought: 100, boughtAt: "2026-06-03", sold: 60, sales: 20, soldAt: "2026-06-10" },
  ]);
  const june = inventoryHealth(shop, { since: "2026-06-01", until: "2026-07-01", now: NOW })[0];
  const august = inventoryHealth(shop, { since: "2026-08-01", until: "2026-09-01", now: NOW })[0];
  assert.equal(june.soldInPeriod, 60);
  assert.equal(august.soldInPeriod, 0, "August counted June sales");
  assert.equal(august.status, STOCK.UNSOLD);
});

test("a custom sale has no shelf behind it and never appears in stock health", () => {
  const shop = stockedShop([{ name: "Real", cost: 100, price: 500, bought: 10, sold: 2, sales: 2 }]);
  const withCustom = sanitizeBusiness({
    ...shop,
    sales: [...shop.sales, { id: "custom-1", itemId: null, itemName: "One-off repair", qty: 1, unitPrice: 9000, unitCost: 0, occurredAt: iso(Date.parse("2026-09-02")) }],
  });
  const rows = inventoryHealth(withCustom, { now: NOW });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Real");
});

/* ── units are not sales ────────────────────────────────────────────────────── */

test("units sold and number of sales are different numbers and both are kept", () => {
  // 42 units across 41 sales is a counter people walk up to. 10 units across 5
  // is bulk orders. Same revenue shape, opposite businesses.
  const shop = stockedShop([
    { name: "Coffee maker", cost: 10000, price: 20000, bought: 100, sold: 42, sales: 41 },
    { name: "Big Canopy", cost: 100000, price: 197000, bought: 30, sold: 10, sales: 5 },
  ]);
  const rows = itemPerformance([shop]);
  const coffee = rows.find((r) => r.name === "Coffee maker");
  const canopy = rows.find((r) => r.name === "Big Canopy");
  assert.equal(coffee.units, 42);
  assert.equal(coffee.sales, 41);
  assert.equal(canopy.units, 10);
  assert.equal(canopy.sales, 5);
});

test("itemPerformance can be bounded to a period", () => {
  const shop = stockedShop([{ name: "Thing", cost: 100, price: 500, bought: 100, sold: 10, sales: 10, soldAt: "2026-06-10" }]);
  assert.equal(itemPerformance([shop], { since: "2026-06-01", until: "2026-07-01" })[0].units, 10);
  assert.equal(itemPerformance([shop], { since: "2026-08-01" }).length, 0, "a period with no sales still returned rows");
});

/* ── months ────────────────────────────────────────────────────────────────── */

test("monthlyProfit buckets by calendar month and marks the incomplete one", () => {
  const shop = stockedShop([{ name: "Thing", cost: 100, price: 500, bought: 100, sold: 4, sales: 4, soldAt: "2026-07-10" }]);
  const months = monthlyProfit([shop], { months: 4, now: NOW });
  assert.equal(months.length, 4);
  assert.deepEqual(months.map((m) => m.start), ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]);
  assert.equal(months[1].salesCount, 4, "July did not collect its own sales");
  assert.equal(months[0].salesCount, 0);
  assert.equal(months[3].partial, true, "the current month was not marked partial");
  assert.equal(months[0].partial, false);
});

test("a cost of 50 against a price of 110,000 is a missing zero, not a bargain", () => {
  // Found by running real books through this: 490 units on the shelf valued at
  // 24,500 FCFA in total, because the unit cost had been typed as 50. A check
  // for cost === 0 passed it happily and understated the capital by millions.
  const shop = stockedShop([
    { name: "Canopy", cost: 50, price: 110000, bought: 500, boughtAt: "2026-06-03", sold: 10, sales: 10, soldAt: "2026-06-05" },
    { name: "Honest", cost: 25000, price: 55000, bought: 100, boughtAt: "2026-06-03", sold: 10, sales: 10, soldAt: "2026-06-05" },
  ]);
  const rows = inventoryHealth(shop, { now: NOW });
  assert.equal(rows[0].costSuspect, true, "a cost 0.05% of the selling price was accepted");
  assert.equal(rows[1].costSuspect, false, "a real 45% cost was called suspect");

  const { unpriced } = stockValue(shop);
  assert.equal(unpriced, 1);
});

test("a costless line with no shelf behind it is not called suspect", () => {
  // A service or a digital good genuinely costs nothing per unit, and it has no
  // stock. `qty > 0` is what keeps it out, so the check stays about physical
  // stock whose value is being misreported.
  const shop = sanitizeBusiness({
    ...makeBusiness({ name: "Services" }),
    sales: [{ id: "s1", itemId: null, itemName: "Repair", qty: 1, unitPrice: 5000, unitCost: 0, occurredAt: "2026-09-10T00:00:00.000Z" }],
  });
  assert.deepEqual(inventoryHealth(shop, { now: NOW }), []);
  assert.deepEqual(stockValue(shop), { value: 0, unpriced: 0 });
});

test("a cost that cannot be right is said BEFORE anything computed from it", () => {
  // This rung is first because it is the only one that invalidates the others.
  // With no cost recorded the margin reads 100%, every profit total is too
  // high, and a finding built on those numbers is advice built on a typo.
  const shop = stockedShop([
    { name: "Canopy", cost: 50, price: 110000, bought: 500, boughtAt: "2026-06-03", sold: 35, sales: 29, soldAt: "2026-06-03" },
    { name: "Espresso", cost: 25000, price: 55000, bought: 500, boughtAt: "2026-06-03", sold: 37, sales: 33, soldAt: "2026-06-03" },
  ]);
  const f = portfolioFinding([shop], { lowStockThreshold: 5 });
  assert.equal(f.kind, "untrusted", "a shop with fictional margins was told something else");
  assert.equal(f.tone, "danger");
  assert.equal(f.itemName, "Canopy");
});

test("capital standing still on a shelf is a finding, and it was not one before", () => {
  // Found by running a real shop through the ladder: hundreds of units of two
  // products, decades of stock at the pace they sell, and the answer came back
  // "nothing needs doing" because the ladder predated the app being able to see
  // a shelf at all.
  const shop = stockedShop([
    { name: "Espresso", cost: 25000, price: 55000, bought: 500, boughtAt: "2026-06-03", sold: 37, sales: 33, soldAt: "2026-06-03" },
  ]);
  const f = portfolioFinding([shop], { lowStockThreshold: 5 });
  assert.equal(f.kind, "parked");
  assert.equal(f.itemName, "Espresso");
  assert.ok(f.value > 11000000, "value was " + f.value);
  assert.ok(f.months > 40, "months was " + f.months);
});

test("holding a few months of stock is how a shop works, and is not a finding", () => {
  // The rung only fires when what is parked is large against what the shop
  // actually earns. Otherwise every healthy shop opens on a warning.
  const shop = stockedShop([
    { name: "Coffee maker", cost: 10000, price: 20000, bought: 100, boughtAt: "2026-06-03", sold: 42, sales: 41, soldAt: "2026-06-03" },
  ]);
  const f = portfolioFinding([shop], { lowStockThreshold: 5 });
  assert.notEqual(f.kind, "parked", "a shop with five months of cover was warned about its stock");
});
