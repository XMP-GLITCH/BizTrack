/**
 * Stock as a ledger, not a counter.
 *
 * Quantity on hand is DERIVED by summing an append-only list of movements
 * (+ purchases and restocks, - sales, +/- corrections) rather than stored as a
 * mutable number. Three reasons:
 *
 *  1. It syncs. Two devices offline, each selling the last unit, both write a
 *     movement row; they merge and the total is right. With a stored counter
 *     they both write "qty: 4" and one sale silently disappears.
 *  2. It cannot drift. Deleting an item used to drop its `sold` counter while
 *     leaving its sales rows behind, so the dashboard quietly stopped adding up.
 *  3. It explains itself. "Why is my stock 3?" becomes an answerable question.
 *
 * Unit cost is tracked as a moving weighted average, recalculated on each
 * purchase. Previously a restock at a new price overwrote the item's cost
 * outright, retroactively repricing stock that was bought cheaper and reporting
 * profit against a price that was never paid.
 */

export const MOVEMENT = {
  INITIAL: "initial",
  RESTOCK: "restock",
  SALE: "sale",
  ADJUSTMENT: "adjustment",
};

const byTime = (a, b) => {
  const t = String(a.occurredAt || "").localeCompare(String(b.occurredAt || ""));
  return t !== 0 ? t : String(a.id || "").localeCompare(String(b.id || ""));
};

/**
 * Fold an item's movements into its current state.
 * Movements are sorted by time, so out-of-order arrivals from a sync converge
 * to the same answer regardless of the order they were received in.
 */
export function deriveItemState(movements) {
  let qty = 0;
  let avgCost = 0;
  let purchased = 0;
  let sold = 0;

  for (const m of [...movements].sort(byTime)) {
    const delta = Math.trunc(Number(m.delta) || 0);
    if (delta === 0) continue;

    if (delta > 0) {
      const unitCost = Math.max(0, Math.round(Number(m.unitCost) || 0));
      // Negative stock contributes nothing to the average; it is a discrepancy
      // to reconcile, not inventory we paid for.
      const onHand = Math.max(qty, 0);
      avgCost = Math.round((onHand * avgCost + delta * unitCost) / (onHand + delta));
      purchased += delta;
    } else {
      sold += -delta;
    }
    qty += delta;
  }

  return { qty, avgCost, purchased, sold };
}

/** Items with their derived state attached, ready for rendering. */
export function deriveInventory(business) {
  const movements = business.stockMovements || [];
  const byItem = new Map();
  for (const m of movements) {
    const list = byItem.get(m.itemId);
    if (list) list.push(m);
    else byItem.set(m.itemId, [m]);
  }
  return (business.items || []).map((item) => ({
    ...item,
    ...deriveItemState(byItem.get(item.id) || []),
  }));
}

export const isLowStock = (item, threshold) => item.qty > 0 && item.qty <= threshold;

/**
 * Stock went negative: more was sold than the ledger says was ever bought.
 * We record the sale anyway -- it physically happened, and refusing to log real
 * money is worse than showing a discrepancy -- then surface it for correction.
 */
export const hasStockDiscrepancy = (item) => item.qty < 0;

export function makeMovement({ id, itemId, delta, unitCost = 0, reason, occurredAt, saleId = null }) {
  return {
    id,
    itemId,
    delta: Math.trunc(Number(delta) || 0),
    unitCost: Math.max(0, Math.round(Number(unitCost) || 0)),
    reason,
    occurredAt: occurredAt || new Date().toISOString(),
    saleId,
  };
}
