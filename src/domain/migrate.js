/**
 * Migration from the pre-ledger shape.
 *
 * The old shape nested `inventory` and `sales` under each business, stored money
 * as floats, kept `qty`/`sold` as hand-maintained counters, and never linked a
 * sale to the item it came from.
 *
 * Reconstruction rules, in priority order:
 *
 *  - Current quantity is authoritative. It is the number the user sees and
 *    believes, so the opening stock movement is back-computed to reproduce it
 *    exactly: opening = current qty + everything we can show was sold.
 *  - The sales list is authoritative for units sold. The old `sold` counter is
 *    NOT trusted -- deleting an item used to drop it while leaving the sales
 *    behind, so it has drifted for anyone who ever removed an item.
 *  - Sales are linked back to items by name, which is the only link the old
 *    shape preserved. A sale naming an item that no longer exists keeps its
 *    revenue and simply carries no item link.
 *
 * Nothing is discarded: an unmatched sale still counts toward revenue and
 * profit, exactly as it did before.
 */

import { newId } from "./ids.js";
import { toMinor, normalizeCurrency, DEFAULT_CURRENCY } from "./money.js";
import { MOVEMENT } from "./inventory.js";
import {
  makeBusiness,
  makeItem,
  makeSale,
  makeStockMovement,
  sanitizeBusiness,
  isLegacyBusiness,
} from "./schema.js";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** "2026-05-09" -> midday UTC, so a timezone shift can never move it a day. */
function legacyDateToIso(date) {
  const s = String(date || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00.000Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const dayBefore = (iso) => new Date(new Date(iso).getTime() - 86400000).toISOString();

export function migrateLegacyBusiness(legacy, currency = DEFAULT_CURRENCY) {
  const cur = normalizeCurrency(currency);
  const money = (v) => toMinor(num(v), cur);

  const business = makeBusiness({
    id: newId(),
    name: legacy?.name,
    category: legacy?.category,
    color: legacy?.color,
    emoji: legacy?.emoji,
    currency: cur,
  });

  // Items first, so sales can be linked back to them by name.
  const legacyItems = Array.isArray(legacy?.inventory) ? legacy.inventory : [];
  const items = [];
  const itemIdByName = new Map();
  const legacyCostById = new Map();

  for (const li of legacyItems) {
    const item = makeItem({
      id: newId(),
      name: li?.name,
      unitPrice: money(li?.price),
    });
    items.push(item);
    legacyCostById.set(item.id, money(li?.cost));
    // First item wins if two share a name; the old shape allowed duplicates.
    if (!itemIdByName.has(item.name)) itemIdByName.set(item.name, item.id);
  }

  // Sales, linked where the name still matches a live item.
  const legacySales = Array.isArray(legacy?.sales) ? legacy.sales : [];
  const sales = [];
  const movements = [];
  const soldByItem = new Map();
  const earliestSaleByItem = new Map();

  for (const ls of legacySales) {
    const qty = Math.max(0, Math.round(num(ls?.qty)) || 0);
    const occurredAt = legacyDateToIso(ls?.date);
    const isCustom = Boolean(ls?.isCustom);
    const itemName = String(ls?.itemName ?? "Sale");
    const itemId = isCustom ? null : itemIdByName.get(itemName) || null;

    // Legacy stored per-sale TOTALS for revenue and cost; unit amounts are what
    // we keep now, so totals stay consistent with quantity by construction.
    const unitPrice = ls?.actualPrice !== undefined && ls?.actualPrice !== null
      ? money(ls.actualPrice)
      : qty > 0 ? Math.round(money(ls?.revenue) / qty) : 0;
    const unitCost = qty > 0 ? Math.round(money(ls?.cost) / qty) : 0;

    const sale = makeSale({
      id: newId(),
      itemId,
      itemName,
      qty,
      unitPrice,
      unitCost,
      askingPrice: ls?.askingPrice !== undefined && ls?.askingPrice !== null ? money(ls.askingPrice) : unitPrice,
      note: ls?.note,
      isCustom,
      occurredAt,
    });
    sales.push(sale);

    if (itemId && qty > 0) {
      soldByItem.set(itemId, (soldByItem.get(itemId) || 0) + qty);
      const prev = earliestSaleByItem.get(itemId);
      if (!prev || occurredAt < prev) earliestSaleByItem.set(itemId, occurredAt);
      movements.push(makeStockMovement({
        id: newId(),
        itemId,
        delta: -qty,
        unitCost,
        reason: MOVEMENT.SALE,
        saleId: sale.id,
        occurredAt,
      }));
    }
  }

  // Opening stock, back-computed so derived qty reproduces the stored qty exactly.
  for (const item of items) {
    const legacyItem = legacyItems.find((li) => String(li?.name ?? "Item") === item.name);
    const currentQty = Math.round(num(legacyItem?.qty));
    const opening = currentQty + (soldByItem.get(item.id) || 0);
    const firstSale = earliestSaleByItem.get(item.id);
    movements.push(makeStockMovement({
      id: newId(),
      itemId: item.id,
      delta: opening,
      unitCost: legacyCostById.get(item.id) || 0,
      reason: MOVEMENT.INITIAL,
      occurredAt: firstSale ? dayBefore(firstSale) : business.createdAt,
    }));
  }

  return { ...business, items, stockMovements: movements, sales };
}

/** Accepts either shape and returns the current one. */
export function toCurrentBusiness(raw, currency = DEFAULT_CURRENCY) {
  if (isLegacyBusiness(raw)) return migrateLegacyBusiness(raw, currency);
  return sanitizeBusiness(raw);
}

/** Whole-store migration, used by the zustand persist middleware. */
export function migrateState(state) {
  const currency = normalizeCurrency(state?.currency || DEFAULT_CURRENCY);
  const raw = Array.isArray(state?.businesses) ? state.businesses : [];
  return {
    ...state,
    currency,
    businesses: raw.map((b) => toCurrentBusiness(b, currency)).filter(Boolean),
  };
}

/**
 * Validate a user-pasted backup code. Handles backups exported by older builds,
 * which are all in the legacy shape. Returns null when there is nothing usable.
 */
export function parseBackup(data, fallbackCurrency = DEFAULT_CURRENCY) {
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.businesses)) return null;
  const currency = normalizeCurrency(data.currency || fallbackCurrency);
  const businesses = data.businesses.map((b) => toCurrentBusiness(b, currency)).filter(Boolean);
  return {
    businesses,
    currency,
    userName: data.userName ? String(data.userName) : null,
    userEmail: data.userEmail ? String(data.userEmail) : null,
    lowStockThreshold: Number.isFinite(Number(data.lowStockThreshold))
      ? Math.max(1, Math.round(Number(data.lowStockThreshold)))
      : null,
  };
}
