import test from "node:test";
import assert from "node:assert/strict";

// zustand/persist needs a storage; give it an in-memory one before importing.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const { useStore, selectBusinesses, selectInventory } = await import("./useStore.js");
const { calcBizStats } = await import("../domain/stats.js");

const reset = () => useStore.setState({ businesses: [], currency: "XAF", lowStockThreshold: 3 });
const inv = (bizId) => selectInventory(useStore.getState(), bizId);

test("a new business starts empty and carries the account currency", () => {
  reset();
  const id = useStore.getState().addBusiness({ name: "Sabi Crochet", category: "Crochet" });
  const biz = selectBusinesses(useStore.getState())[0];
  assert.equal(biz.id, id);
  assert.equal(biz.currency, "XAF");
  assert.deepEqual(biz.items, []);
  assert.deepEqual(biz.stockMovements, []);
});

test("adding an item opens its ledger, so quantity is derived not stored", () => {
  reset();
  const bizId = useStore.getState().addBusiness({ name: "B" });
  const itemId = useStore.getState().addItem(bizId, { name: "Bucket Hat", unitPrice: 4500, qty: 20, unitCost: 1500 });

  const item = inv(bizId).find((i) => i.id === itemId);
  assert.equal(item.qty, 20);
  assert.equal(item.avgCost, 1500);
  assert.equal(item.sold, 0);
  // The item record itself holds no quantity.
  assert.equal(useStore.getState().businesses[0].items[0].qty, undefined);
});

test("selling reduces derived stock and records revenue", () => {
  reset();
  const bizId = useStore.getState().addBusiness({ name: "B" });
  const itemId = useStore.getState().addItem(bizId, { name: "Hat", unitPrice: 4500, qty: 20, unitCost: 1500 });

  const { item } = useStore.getState().recordSale(bizId, {
    itemId, itemName: "Hat", qty: 3, unitPrice: 4000, unitCost: 1500, askingPrice: 4500,
  });

  assert.equal(item.qty, 17);
  assert.equal(item.sold, 3);
  const stats = calcBizStats(selectBusinesses(useStore.getState())[0]);
  assert.equal(stats.revenue, 12000);
  assert.equal(stats.cogs, 4500);
  assert.equal(stats.profit, 7500);
});

test("restocking at a new price averages instead of repricing old stock", () => {
  reset();
  const bizId = useStore.getState().addBusiness({ name: "B" });
  const itemId = useStore.getState().addItem(bizId, { name: "Hat", unitPrice: 4500, qty: 10, unitCost: 1500 });
  useStore.getState().restockItem(bizId, itemId, { qty: 10, unitCost: 2000 });

  const item = inv(bizId).find((i) => i.id === itemId);
  assert.equal(item.qty, 20);
  assert.equal(item.avgCost, 1750);
});

test("overselling is recorded and flagged, never silently dropped", () => {
  reset();
  const bizId = useStore.getState().addBusiness({ name: "B" });
  const itemId = useStore.getState().addItem(bizId, { name: "Hat", unitPrice: 4500, qty: 1, unitCost: 1500 });

  const { item } = useStore.getState().recordSale(bizId, {
    itemId, itemName: "Hat", qty: 3, unitPrice: 4500, unitCost: 1500,
  });

  assert.equal(item.qty, -2);
  assert.equal(calcBizStats(selectBusinesses(useStore.getState())[0]).revenue, 13500);
});

test("deleting an item keeps its sales, so revenue never silently drops", () => {
  // The old counter model lost `sold` on delete while keeping the sales rows,
  // so the dashboard quietly stopped adding up.
  reset();
  const bizId = useStore.getState().addBusiness({ name: "B" });
  const itemId = useStore.getState().addItem(bizId, { name: "Hat", unitPrice: 4500, qty: 10, unitCost: 1500 });
  useStore.getState().recordSale(bizId, { itemId, itemName: "Hat", qty: 2, unitPrice: 4500, unitCost: 1500 });

  const before = calcBizStats(selectBusinesses(useStore.getState())[0]);
  useStore.getState().deleteItem(bizId, itemId);
  const after = calcBizStats(selectBusinesses(useStore.getState())[0]);

  assert.equal(after.revenue, before.revenue);
  assert.equal(after.unitsSold, before.unitsSold);
  assert.equal(inv(bizId).length, 0, "deleted item is hidden from inventory");
});

test("deletes are soft, so a tombstone survives for sync", () => {
  reset();
  const bizId = useStore.getState().addBusiness({ name: "Gone" });
  useStore.getState().deleteBusiness(bizId);
  assert.equal(selectBusinesses(useStore.getState()).length, 0);
  assert.equal(useStore.getState().businesses.length, 1);
  assert.ok(useStore.getState().businesses[0].deletedAt);
});

test("a custom sale records revenue without touching any stock ledger", () => {
  reset();
  const bizId = useStore.getState().addBusiness({ name: "B" });
  const { item } = useStore.getState().recordSale(bizId, {
    itemId: null, itemName: "Custom Beanie", qty: 1, unitPrice: 8000, unitCost: 2500, isCustom: true,
  });
  assert.equal(item, null);
  const biz = selectBusinesses(useStore.getState())[0];
  assert.equal(biz.stockMovements.length, 0);
  assert.equal(calcBizStats(biz).profit, 5500);
});

test("every mutation touches only its own business", () => {
  reset();
  const a = useStore.getState().addBusiness({ name: "A" });
  const b = useStore.getState().addBusiness({ name: "B" });
  const snapshotB = useStore.getState().businesses.find((x) => x.id === b);

  useStore.getState().addItem(a, { name: "Hat", unitPrice: 100, qty: 1, unitCost: 50 });

  // Identity, not just equality: B's object reference must be untouched, which
  // is what lets a sync push only what actually changed.
  assert.equal(useStore.getState().businesses.find((x) => x.id === b), snapshotB);
});

test("mutations stamp updatedAt for the eventual sync", async () => {
  reset();
  const bizId = useStore.getState().addBusiness({ name: "B" });
  const before = useStore.getState().businesses[0].updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  useStore.getState().updateBusiness(bizId, { name: "Renamed" });
  const after = useStore.getState().businesses[0];
  assert.equal(after.name, "Renamed");
  assert.ok(after.updatedAt >= before);
});
