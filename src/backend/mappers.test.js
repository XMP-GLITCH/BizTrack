import test from "node:test";
import assert from "node:assert/strict";

import {
  businessToRow, rowToBusiness, itemToRow, rowToItem,
  saleToRow, rowToSale, movementToRow, rowToMovement,
  flattenBusinesses, assembleBusinesses,
} from "./mappers.js";
import { migrateLegacyBusiness } from "../domain/migrate.js";
import { calcBizStats } from "../domain/stats.js";
import { deriveInventory } from "../domain/inventory.js";

const OWNER = "11111111-1111-1111-1111-111111111111";

/**
 * Column names as they actually exist in supabase/migrations, verified against
 * a live Postgres running those migrations. Pinned here so a rename in the SQL
 * without a matching change in the mappers fails a test instead of silently
 * syncing a column as null.
 */
const DB_COLUMNS = {
  businesses: "category,color,created_at,currency,deleted_at,emoji,id,name,owner_id,updated_at",
  items: "archived_at,business_id,created_at,deleted_at,id,name,unit_price,updated_at",
  sales: "asking_price,business_id,created_at,created_by,deleted_at,id,is_custom,item_id,item_name,note,occurred_at,qty,unit_cost,unit_price,updated_at",
  stock_movements: "business_id,created_at,created_by,delta,id,item_id,occurred_at,reason,sale_id,unit_cost,updated_at",
};

const columnsOf = (table) => new Set(DB_COLUMNS[table].split(","));

const sample = () => migrateLegacyBusiness({
  name: "Sabi Crochet", category: "Crochet", color: "#C17F5A", emoji: "X",
  inventory: [
    { id: "1", name: "Bucket Hat", qty: 12, cost: 1500, price: 4500, sold: 8 },
    { id: "2", name: "Tote Bag", qty: 2, cost: 2000, price: 6000, sold: 2 },
  ],
  sales: [
    { id: "s1", itemName: "Bucket Hat", qty: 5, askingPrice: 4500, actualPrice: 4500, revenue: 22500, cost: 7500, date: "2026-04-01" },
    { id: "s2", itemName: "Bucket Hat", qty: 3, askingPrice: 4500, actualPrice: 4000, revenue: 12000, cost: 4500, date: "2026-04-08" },
    { id: "s3", itemName: "Tote Bag", qty: 2, askingPrice: 6000, actualPrice: 6000, revenue: 12000, cost: 4000, date: "2026-04-10" },
    { id: "s4", itemName: "Custom Beanie", qty: 1, actualPrice: 8000, revenue: 8000, cost: 2500, date: "2026-04-12", isCustom: true },
  ],
}, "XAF");

/* ── every key we send must be a real column ───────────────────────────────── */

test("business rows use only real columns", () => {
  const row = businessToRow(sample(), OWNER);
  for (const key of Object.keys(row)) {
    assert.ok(columnsOf("businesses").has(key), `businesses has no column "${key}"`);
  }
});

test("item rows use only real columns", () => {
  const row = itemToRow(sample().items[0], "biz");
  for (const key of Object.keys(row)) {
    assert.ok(columnsOf("items").has(key), `items has no column "${key}"`);
  }
});

test("sale rows use only real columns", () => {
  const row = saleToRow(sample().sales[0], "biz", OWNER);
  for (const key of Object.keys(row)) {
    assert.ok(columnsOf("sales").has(key), `sales has no column "${key}"`);
  }
});

test("stock movement rows use only real columns", () => {
  const row = movementToRow(sample().stockMovements[0], "biz", OWNER);
  for (const key of Object.keys(row)) {
    assert.ok(columnsOf("stock_movements").has(key), `stock_movements has no column "${key}"`);
  }
});

test("updated_at is never pushed -- the server owns the sync cursor", () => {
  const b = sample();
  assert.ok(!("updated_at" in businessToRow(b, OWNER)));
  assert.ok(!("updated_at" in itemToRow(b.items[0], "biz")));
  assert.ok(!("updated_at" in saleToRow(b.sales[0], "biz", OWNER)));
  assert.ok(!("updated_at" in movementToRow(b.stockMovements[0], "biz", OWNER)));
});

/* ── round trips ───────────────────────────────────────────────────────────── */

test("a business round-trips through the database shape", () => {
  const before = sample();
  const after = rowToBusiness({ ...businessToRow(before, OWNER), updated_at: before.updatedAt });
  for (const field of ["id", "name", "category", "color", "emoji", "currency", "createdAt", "deletedAt"]) {
    assert.deepEqual(after[field], before[field], `field "${field}" did not survive`);
  }
});

test("an item round-trips, keeping its price exactly", () => {
  const item = sample().items[0];
  const after = rowToItem({ ...itemToRow(item, "biz"), updated_at: item.updatedAt });
  assert.equal(after.id, item.id);
  assert.equal(after.name, item.name);
  assert.equal(after.unitPrice, item.unitPrice);
  assert.equal(typeof after.unitPrice, "number");
});

test("a sale round-trips, including the nullable item link", () => {
  const b = sample();
  for (const sale of b.sales) {
    const after = rowToSale({ ...saleToRow(sale, b.id, OWNER), updated_at: sale.updatedAt });
    for (const field of ["id", "itemId", "itemName", "qty", "unitPrice", "unitCost", "askingPrice", "note", "isCustom", "occurredAt"]) {
      assert.deepEqual(after[field], sale[field], `sale field "${field}" did not survive`);
    }
  }
  const custom = b.sales.find((s) => s.isCustom);
  assert.equal(saleToRow(custom, b.id, OWNER).item_id, null, "custom sale keeps a null item link");
});

test("a stock movement round-trips, preserving negative deltas", () => {
  const b = sample();
  const saleMovement = b.stockMovements.find((m) => m.delta < 0);
  const after = rowToMovement(movementToRow(saleMovement, b.id, OWNER));
  assert.equal(after.delta, saleMovement.delta);
  assert.ok(after.delta < 0, "a sale movement must stay negative");
  assert.equal(after.reason, "sale");
  assert.equal(after.saleId, saleMovement.saleId);
});

/* ── the whole business, flattened and reassembled ─────────────────────────── */

test("flatten then assemble reproduces the books exactly", () => {
  const before = sample();
  const flat = flattenBusinesses([before], OWNER);

  // Simulate the server echoing rows back with its own updated_at.
  const stamp = (rows) => rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  const [after] = assembleBusinesses({
    businesses: stamp(flat.businesses),
    items: stamp(flat.items),
    sales: stamp(flat.sales),
    movements: stamp(flat.movements),
  });

  assert.equal(after.items.length, before.items.length);
  assert.equal(after.sales.length, before.sales.length);
  assert.equal(after.stockMovements.length, before.stockMovements.length);

  const a = calcBizStats(after), b = calcBizStats(before);
  assert.equal(a.revenue, b.revenue, "revenue must survive a full round trip");
  assert.equal(a.cogs, b.cogs);
  assert.equal(a.profit, b.profit);
  assert.equal(a.unitsSold, b.unitsSold);

  assert.deepEqual(
    deriveInventory(after).map((i) => [i.name, i.qty, i.avgCost, i.sold]).sort(),
    deriveInventory(before).map((i) => [i.name, i.qty, i.avgCost, i.sold]).sort(),
    "stock on hand and average cost must survive a full round trip",
  );
});

test("an incremental pull that returns a child without its parent drops it", () => {
  const b = sample();
  const flat = flattenBusinesses([b], OWNER);
  const assembled = assembleBusinesses({ businesses: [], items: flat.items, sales: flat.sales, movements: flat.movements });
  assert.deepEqual(assembled, [], "orphans are dropped, not attached to nothing");
});

test("assembling tolerates missing row sets entirely", () => {
  assert.doesNotThrow(() => assembleBusinesses({}));
  assert.deepEqual(assembleBusinesses({}), []);
});
