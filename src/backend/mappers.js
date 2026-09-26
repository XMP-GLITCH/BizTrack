/**
 * Translation between the local record shape and database rows.
 *
 * Two differences, and both are deliberate:
 *
 *  1. Case. The app uses camelCase; Postgres uses snake_case. Doing this in one
 *     place means a typo is a failing test here rather than a column that
 *     silently syncs as null.
 *
 *  2. Shape. Locally a business NESTS its items, sales and movements, because
 *     that is how every screen reads them. In the database they are separate
 *     tables, because that is what row-level security and incremental pulls
 *     need. flattenBusiness/assembleBusinesses convert between the two.
 *
 * `updated_at` is never sent: the server sets it by trigger, and it is the
 * cursor every incremental pull depends on.
 */

import { makeBusiness, makeItem, makeSale, makeStockMovement, makeInvoice } from "../domain/schema.js";

const nullable = (v) => (v === undefined ? null : v);

/* ── business ──────────────────────────────────────────────────────────────── */

export const businessToRow = (business, ownerId) => ({
  id: business.id,
  owner_id: ownerId,
  name: business.name,
  category: business.category,
  color: business.color,
  emoji: business.emoji,
  currency: business.currency,
  created_at: business.createdAt,
  deleted_at: nullable(business.deletedAt),
});

export const rowToBusiness = (row) => makeBusiness({
  id: row.id,
  name: row.name,
  category: row.category,
  color: row.color,
  emoji: row.emoji,
  currency: row.currency,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

/* ── item ──────────────────────────────────────────────────────────────────── */

export const itemToRow = (item, businessId) => ({
  id: item.id,
  business_id: businessId,
  name: item.name,
  unit_price: item.unitPrice,
  photo_id: nullable(item.photoId),
  created_at: item.createdAt,
  archived_at: nullable(item.archivedAt),
  deleted_at: nullable(item.deletedAt),
});

export const rowToItem = (row) => makeItem({
  id: row.id,
  name: row.name,
  unitPrice: row.unit_price,
  photoId: row.photo_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  archivedAt: row.archived_at,
  deletedAt: row.deleted_at,
});

/* ── sale ──────────────────────────────────────────────────────────────────── */

export const saleToRow = (sale, businessId, userId) => ({
  id: sale.id,
  business_id: businessId,
  item_id: nullable(sale.itemId),
  item_name: sale.itemName,
  qty: sale.qty,
  unit_price: sale.unitPrice,
  unit_cost: sale.unitCost,
  asking_price: sale.askingPrice,
  note: sale.note ?? "",
  is_custom: Boolean(sale.isCustom),
  group_id: nullable(sale.groupId),
  occurred_at: sale.occurredAt,
  created_by: nullable(userId),
  created_at: sale.createdAt,
  deleted_at: nullable(sale.deletedAt),
});

export const rowToSale = (row) => makeSale({
  id: row.id,
  itemId: row.item_id,
  itemName: row.item_name,
  qty: row.qty,
  unitPrice: row.unit_price,
  unitCost: row.unit_cost,
  askingPrice: row.asking_price,
  note: row.note,
  isCustom: row.is_custom,
  groupId: row.group_id,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

/* ── invoice ───────────────────────────────────────────────────────────────── */
//
// Lines travel as JSONB rather than a child table. They are document content:
// never queried alone, never aggregated, never summed into anything. A child
// table would buy joins nobody needs and a second place for the same snapshot
// to drift from.

export const invoiceToRow = (invoice, businessId, userId) => ({
  id: invoice.id,
  business_id: businessId,
  created_by: userId ?? null,
  customer_name: invoice.customerName ?? "",
  customer_contact: invoice.customerContact ?? "",
  note: invoice.note ?? "",
  lines: invoice.lines ?? [],
  issued_at: invoice.issuedAt,
  due_at: nullable(invoice.dueAt),
  paid_at: nullable(invoice.paidAt),
  paid_method: invoice.paidMethod ?? "",
  sale_group_id: nullable(invoice.saleGroupId),
  created_at: invoice.createdAt,
  deleted_at: nullable(invoice.deletedAt),
});

export const rowToInvoice = (row) => makeInvoice({
  id: row.id,
  customerName: row.customer_name,
  customerContact: row.customer_contact,
  note: row.note,
  lines: row.lines,
  issuedAt: row.issued_at,
  dueAt: row.due_at,
  paidAt: row.paid_at,
  paidMethod: row.paid_method,
  saleGroupId: row.sale_group_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

/* ── stock movement ────────────────────────────────────────────────────────── */

export const movementToRow = (movement, businessId, userId) => ({
  id: movement.id,
  business_id: businessId,
  item_id: movement.itemId,
  delta: movement.delta,
  unit_cost: movement.unitCost,
  reason: movement.reason,
  sale_id: nullable(movement.saleId),
  occurred_at: movement.occurredAt,
  created_by: nullable(userId),
  created_at: movement.createdAt,
});

export const rowToMovement = (row) => makeStockMovement({
  id: row.id,
  itemId: row.item_id,
  delta: row.delta,
  unitCost: row.unit_cost,
  reason: row.reason,
  saleId: row.sale_id,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
});

/* ── nested <-> flat ───────────────────────────────────────────────────────── */

/** One nested business -> the four row sets the database stores it as. */
export function flattenBusiness(business, ownerId) {
  return {
    business: businessToRow(business, ownerId),
    items: (business.items || []).map((i) => itemToRow(i, business.id)),
    sales: (business.sales || []).map((s) => saleToRow(s, business.id, ownerId)),
    invoices: (business.invoices || []).map((v) => invoiceToRow(v, business.id, ownerId)),
    movements: (business.stockMovements || []).map((m) => movementToRow(m, business.id, ownerId)),
  };
}

export function flattenBusinesses(businesses, ownerId) {
  // `invoices` was missing from both this accumulator and the loop below, so
  // `flat.invoices` from `flattenBusiness` was silently dropped: every push
  // ran, `out.invoices` was never populated, and `upsertAll("invoices",
  // undefined)` threw partway through `pushChanges` -- after businesses,
  // items, sales and movements had already gone, but before the pull ran and
  // before the sync loop could ever record a success.
  const out = { businesses: [], items: [], sales: [], movements: [], invoices: [] };
  for (const b of businesses || []) {
    const flat = flattenBusiness(b, ownerId);
    out.businesses.push(flat.business);
    out.items.push(...flat.items);
    out.sales.push(...flat.sales);
    out.movements.push(...flat.movements);
    out.invoices.push(...flat.invoices);
  }
  return out;
}

/**
 * Row sets from the database -> the nested shape the UI reads.
 * Children whose business did not come back are dropped rather than orphaned;
 * an incremental pull can legitimately return a child without its parent.
 */
export function assembleBusinesses({ businesses = [], items = [], sales = [], movements = [], invoices = [] }) {
  const byId = new Map();
  for (const row of businesses) {
    byId.set(row.id, { ...rowToBusiness(row), items: [], sales: [], stockMovements: [], invoices: [] });
  }
  for (const row of items) byId.get(row.business_id)?.items.push(rowToItem(row));
  for (const row of sales) byId.get(row.business_id)?.sales.push(rowToSale(row));
  for (const row of movements) byId.get(row.business_id)?.stockMovements.push(rowToMovement(row));
  for (const row of invoices) byId.get(row.business_id)?.invoices.push(rowToInvoice(row));

  for (const business of byId.values()) {
    // Newest sale first, matching how the UI lists them.
    business.sales.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
    business.invoices.sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)));
  }
  return [...byId.values()];
}
