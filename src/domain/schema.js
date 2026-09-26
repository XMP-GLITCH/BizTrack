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
    // Money ASKED FOR, which is not money received. Kept out of `sales` on
    // purpose: see `makeInvoice`.
    invoices: [],
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
    // The id of a blob in the `biztrack-photos` IndexedDB, never the image.
    // A photo is 80-150KB after compression and this record is persisted to
    // localStorage, inside a ~5MB origin quota shared with the whole ledger.
    // `makeItem` drops anything it does not name, so a field absent from here
    // is a field that disappears on the next restore.
    photoId: input.photoId ? str(input.photoId) : null,
    createdAt: iso(input.createdAt || now),
    updatedAt: iso(input.updatedAt || now),
    archivedAt: input.archivedAt ? iso(input.archivedAt) : null,
    deletedAt: input.deletedAt ? iso(input.deletedAt) : null,
  };
}

/** How an invoice was settled. Free text is not offered: the point of
 *  recording this is being able to say "the MoMo ones are never late". */
export const PAYMENT_METHODS = ["Cash", "Mobile money", "Bank transfer", "Other"];

/**
 * A line on an invoice. Document content, not a ledger entry.
 *
 * It carries its own name and price rather than pointing at the item's current
 * ones, for the same reason a sale does: an invoice already sent must not
 * change when the owner reprices the product next month.
 */
export function makeInvoiceLine(input = {}) {
  return {
    id: str(input.id) || newId(),
    // Kept so the document can show the product's photo, and null for a line
    // typed by hand. Never used to look up a price.
    itemId: input.itemId ? str(input.itemId) : null,
    name: str(input.name, "Item").trim() || "Item",
    qty: Math.max(1, posInt(input.qty, 1)),
    unitPrice: posInt(input.unitPrice),
  };
}

/**
 * An invoice: money asked for, which is money NOT YET RECEIVED.
 *
 * THIS IS WHY IT IS NOT A SALE, and the distinction is the whole design.
 * `calcBizStats` sums revenue and cost from every record in `business.sales`,
 * and so do `weeklyProfit`, `itemPerformance`, the CSV export and the analysis
 * summary. Anything placed in that array is money the books say has arrived.
 *
 * An unpaid invoice that lived there with a flag would have to be filtered out
 * of all six, and the day someone adds a seventh and forgets, the owner's
 * revenue silently includes money nobody has paid them. This file already
 * records one figure that meant something other than its label, and that was a
 * trust bug rather than a copy nit.
 *
 * So invoices are their own records. It is not that they are filtered out of
 * revenue; it is that they can never reach it.
 *
 * Paying one does not convert it. The owner records the sale the ordinary way
 * and the invoice keeps `saleGroupId` so the two can be shown together. A
 * conversion that wrote into `sales` on the invoice's behalf would be the same
 * hole reopened from the other end.
 */
export function makeInvoice(input = {}) {
  const now = new Date().toISOString();
  const lines = (Array.isArray(input.lines) ? input.lines : []).map(makeInvoiceLine);
  return {
    id: str(input.id) || newId(),
    // Who it is for. The first customer data this app has ever stored, which
    // is a privacy-policy change as well as a schema one.
    customerName: str(input.customerName).trim(),
    customerContact: str(input.customerContact).trim(),
    note: str(input.note),
    lines,
    issuedAt: iso(input.issuedAt || now),
    dueAt: input.dueAt ? iso(input.dueAt) : null,
    // Null means unpaid. It is the only thing that separates an outstanding
    // invoice from a settled one, and it is never inferred from a sale.
    paidAt: input.paidAt ? iso(input.paidAt) : null,
    paidMethod: PAYMENT_METHODS.includes(input.paidMethod) ? input.paidMethod : "",
    // The basket of real sales recorded when the customer paid, if any.
    saleGroupId: input.saleGroupId ? str(input.saleGroupId) : null,
    createdAt: iso(input.createdAt || now),
    updatedAt: iso(input.updatedAt || now),
    deletedAt: input.deletedAt ? iso(input.deletedAt) : null,
  };
}

/** What the invoice asks for. Integer minor units, like every other total. */
export function invoiceTotal(invoice) {
  return (invoice?.lines || []).reduce(
    (n, l) => n + Math.max(1, posInt(l?.qty, 1)) * posInt(l?.unitPrice),
    0,
  );
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
    // One customer, one basket. Several sales recorded in a single go share a
    // group id so ONE receipt can show all of them, while each line stays its
    // own record for stock and profit. Nothing about the money changes; this
    // only decides what gets printed together. Null for a sale recorded alone.
    groupId: input.groupId ? str(input.groupId) : null,
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
    invoices: (Array.isArray(raw.invoices) ? raw.invoices : []).map(makeInvoice),
  };
}
