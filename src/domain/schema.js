/**
 * Record shapes and coercion.
 *
 * Every record carries `updatedAt` and a nullable `deletedAt`. Neither is used
 * by the UI today; both exist so the eventual sync has something to work with.
 * A pull is "give me rows changed since X", and deletes have to travel as
 * tombstones -- a hard delete cannot sync, because the other device has no way
 * to tell "deleted" from "not seen yet".
 */

import { newId } from "./ids.js";
import { DEFAULT_CURRENCY, normalizeCurrency } from "./money.js";

export const SCHEMA_VERSION = 1;

const str = (v, fallback = "") => (v === null || v === undefined ? fallback : String(v));
const int = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
const posInt = (v, fallback = 0) => Math.max(0, int(v, fallback));
const iso = (v) => {
  if (!v) return new Date().toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

export function makeBusiness(input = {}) {
  const now = new Date().toISOString();
  return {
    id: str(input.id) || newId(),
    name: str(input.name, "Untitled").trim() || "Untitled",
    category: str(input.category, "Other"),
    color: str(input.color, "#C17F5A"),
    emoji: str(input.emoji, "\u{1F6CD}\u{FE0F}"),
    currency: normalizeCurrency(input.currency || DEFAULT_CURRENCY),
    items: [],
    stockMovements: [],
    sales: [],
    createdAt: iso(input.createdAt || now),
    updatedAt: iso(input.updatedAt || now),
    deletedAt: input.deletedAt ? iso(input.deletedAt) : null,
  };
}

export function makeItem(input = {}) {
  const now = new Date().toISOString();
  return {
    id: str(input.id) || newId(),
    name: str(input.name, "Item").trim() || "Item",
    unitPrice: posInt(input.unitPrice),
    createdAt: iso(input.createdAt || now),
    updatedAt: iso(input.updatedAt || now),
    archivedAt: input.archivedAt ? iso(input.archivedAt) : null,
    deletedAt: input.deletedAt ? iso(input.deletedAt) : null,
  };
}

export function makeSale(input = {}) {
  const now = new Date().toISOString();
  const qty = posInt(input.qty, 1);
  return {
    id: str(input.id) || newId(),
    itemId: input.itemId ? str(input.itemId) : null,
    itemName: str(input.itemName, "Sale"),
    qty,
    unitPrice: posInt(input.unitPrice),
    unitCost: posInt(input.unitCost),
    askingPrice: posInt(input.askingPrice, posInt(input.unitPrice)),
    note: str(input.note),
    isCustom: Boolean(input.isCustom),
    occurredAt: iso(input.occurredAt || now),
    createdAt: iso(input.createdAt || now),
    updatedAt: iso(input.updatedAt || now),
    deletedAt: input.deletedAt ? iso(input.deletedAt) : null,
  };
}

export function makeStockMovement(input = {}) {
  return {
    id: str(input.id) || newId(),
    itemId: str(input.itemId),
    delta: int(input.delta),
    unitCost: posInt(input.unitCost),
    reason: str(input.reason, "adjustment"),
    saleId: input.saleId ? str(input.saleId) : null,
    occurredAt: iso(input.occurredAt),
    createdAt: iso(input.createdAt || input.occurredAt),
  };
}

/** True when a payload is in the pre-ledger shape (nested inventory, counters). */
export const isLegacyBusiness = (b) =>
  !!b && typeof b === "object" && Array.isArray(b.inventory) && !Array.isArray(b.items);

/**
 * Coerce an already-current-shape business. Anything unrecognised is dropped
 * rather than trusted -- this runs on user-pasted backup codes.
 */
export function sanitizeBusiness(raw) {
  if (!raw || typeof raw !== "object") return null;
  const base = makeBusiness(raw);
  const items = (Array.isArray(raw.items) ? raw.items : []).map(makeItem);
  const validItemIds = new Set(items.map((i) => i.id));
  return {
    ...base,
    items,
    stockMovements: (Array.isArray(raw.stockMovements) ? raw.stockMovements : [])
      .map(makeStockMovement)
      .filter((m) => validItemIds.has(m.itemId)),
    sales: (Array.isArray(raw.sales) ? raw.sales : []).map(makeSale),
  };
}
