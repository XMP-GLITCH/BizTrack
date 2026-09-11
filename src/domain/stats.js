/**
 * Business arithmetic.
 *
 * Revenue, cost and profit are derived from each sale's quantity and unit
 * amounts rather than stored alongside them. A stored total is one more field
 * that can disagree with the fields it was computed from.
 */

import { marginPercent } from "./money.js";

export const saleQty = (sale) => Math.max(0, Math.trunc(Number(sale?.qty) || 0));
export const saleRevenue = (sale) => saleQty(sale) * Math.round(Number(sale?.unitPrice) || 0);
export const saleCost = (sale) => saleQty(sale) * Math.round(Number(sale?.unitCost) || 0);
export const saleProfit = (sale) => saleRevenue(sale) - saleCost(sale);

/** Sold below the asking price -> the difference, per sale. Zero otherwise. */
export function saleDiscount(sale) {
  const asking = Math.round(Number(sale?.askingPrice) || 0);
  const paid = Math.round(Number(sale?.unitPrice) || 0);
  return asking > paid ? (asking - paid) * saleQty(sale) : 0;
}

export function calcBizStats(business) {
  const sales = business?.sales || [];
  let revenue = 0;
  let cogs = 0;
  let units = 0;
  for (const sale of sales) {
    revenue += saleRevenue(sale);
    cogs += saleCost(sale);
    units += saleQty(sale);
  }
  return {
    revenue,
    cogs,
    profit: revenue - cogs,
    margin: marginPercent(revenue, cogs),
    salesCount: sales.length,
    unitsSold: units,
  };
}

export function calcPortfolioStats(businesses) {
  let revenue = 0;
  let cogs = 0;
  for (const b of businesses || []) {
    const s = calcBizStats(b);
    revenue += s.revenue;
    cogs += s.cogs;
  }
  return { revenue, cogs, profit: revenue - cogs, margin: marginPercent(revenue, cogs) };
}

export const STATUS = { PROFITABLE: "profitable", BREAK_EVEN: "break-even", LOSING: "losing" };

export function getStatus(margin) {
  if (margin >= 30) return STATUS.PROFITABLE;
  if (margin >= 10) return STATUS.BREAK_EVEN;
  return STATUS.LOSING;
}
