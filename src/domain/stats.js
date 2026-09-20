/**
 * Business arithmetic.
 *
 * Revenue, cost and profit are derived from each sale's quantity and unit
 * amounts rather than stored alongside them. A stored total is one more field
 * that can disagree with the fields it was computed from.
 */

import { marginPercent } from "./money.js";
import { deriveInventory, hasStockDiscrepancy } from "./inventory.js";

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

/**
 * The first day of the current month, in the same shape a sale's `occurredAt`
 * is compared on.
 *
 * UTC, deliberately, because that is what `occurredAt` already is everywhere in
 * this app -- a period boundary computed in local time would disagree with the
 * timestamps it filters. The cost is a one-hour window per month: in Cameroon
 * (UTC+1) a sale recorded between midnight and 01:00 on the 1st carries the
 * previous month's UTC date. Worth knowing before anyone "fixes" this to local
 * time, which would need every stored timestamp reinterpreted, not just this.
 */
export function startOfMonth(now = new Date(), monthsBack = 0) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * Lower bound inclusive, upper bound EXCLUSIVE, both ISO dates.
 *
 * Exclusive at the top so two adjacent periods never double-count the boundary
 * day: { since: Aug 1, until: Sep 1 } and { since: Sep 1 } describe August and
 * September with nothing counted twice and nothing dropped.
 */
const inPeriod = (sale, since, until) => {
  const day = String(sale?.occurredAt || "").slice(0, 10);
  if (since && day < since) return false;
  if (until && day >= until) return false;
  return true;
};

/**
 * @param {object} business
 * @param {{since?: string, until?: string}} [period] ISO dates; omit for all time.
 */
/**
 * The sales that count.
 *
 * A deleted sale is soft-deleted, because a tombstone has to travel: the other
 * device cannot tell "deleted" from "not seen yet". But it stays in the array,
 * and NOTHING in this file used to exclude it, so correcting a mistaken sale
 * would have removed it from the list on screen and left the money in the
 * revenue. That was latent for as long as nothing could delete a sale, and
 * became live the moment one could.
 *
 * One helper, used by every reader here, rather than a filter each of them has
 * to remember.
 */
export const liveSales = (business) => (business?.sales || []).filter((s) => !s?.deletedAt);

export function calcBizStats(business, { since, until } = {}) {
  const sales = liveSales(business).filter((sale) => inPeriod(sale, since, until));
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

export function calcPortfolioStats(businesses, { since, until } = {}) {
  let revenue = 0;
  let cogs = 0;
  for (const b of businesses || []) {
    const s = calcBizStats(b, { since, until });
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


/**
 * Monday of the week a date falls in, UTC, as an ISO date string.
 *
 * Monday rather than Sunday because that is the working week these sellers
 * describe -- "market day" and "the weekend" are the ends of a week that starts
 * on Monday, and a chart bucketed Sunday-first splits every weekend in two.
 */
export function startOfWeek(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayFirst = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayFirst);
  return d.toISOString().slice(0, 10);
}

/**
 * Realised revenue and profit per week, oldest first, including the current
 * (incomplete) week.
 *
 * This is the only view in the app with a time axis. Home answers "how am I
 * doing" and every list answers "compared to my other businesses"; nothing
 * answered "compared to last week", which is the question that makes an
 * analytics screen worth opening.
 *
 * Empty weeks are kept as zeroes rather than skipped. A gap in trading is
 * information -- a chart that silently closes it up turns four quiet weeks
 * into a smooth line.
 */
export function weeklyProfit(businesses, { weeks = 8, now = new Date() } = {}) {
  const current = new Date(startOfWeek(now) + "T00:00:00.000Z");
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(current);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    buckets.push({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      revenue: 0,
      profit: 0,
      salesCount: 0,
    });
  }

  for (const b of businesses || []) {
    for (const sale of liveSales(b)) {
      const day = String(sale?.occurredAt || "").slice(0, 10);
      const bucket = buckets.find((x) => day >= x.start && day < x.end);
      if (!bucket) continue;
      bucket.revenue += saleRevenue(sale);
      bucket.profit += saleProfit(sale);
      bucket.salesCount += 1;
    }
  }
  return buckets;
}

/**
 * What each thing sold actually earned, across every business.
 *
 * Built from SALES, not from the inventory item's asking price. The screen this
 * replaces multiplied `unitPrice * sold` -- the price you hoped for times the
 * units that moved -- which ignores every discount and every custom sale, and
 * was then coloured as profit though it was revenue. Realised revenue and
 * realised profit are both here so neither has to be inferred.
 *
 * Custom sales are included: they are real income, and an item that only ever
 * sells as a one-off is exactly the thing an owner forgets to price properly.
 */
export function itemPerformance(businesses, { since, until } = {}) {
  const rows = new Map();
  for (const b of businesses || []) {
    // Built once per business rather than per sale, and it deliberately keeps
    // soft-deleted items: a product since removed from the list still sold what
    // it sold, and the row should still show what it was.
    const photoFor = new Map(
      (b?.items || []).filter((i) => i?.photoId).map((i) => [i.id, i.photoId]),
    );
    for (const sale of liveSales(b)) {
      if (!inPeriod(sale, since, until)) continue;
      const name = sale?.itemName || "Item";
      const key = (b.id || "") + "|" + (sale?.itemId || "custom:" + name);
      const row = rows.get(key) || {
        key,
        name,
        bizName: b.name,
        currency: b.currency,
        // The item's own id, and its picture. `key` already encodes the id, but
        // only by concatenation, so anything wanting it had to parse a string
        // back apart. A custom sale has neither, which is correct: there is no
        // product in the book for it to point at.
        itemId: sale?.itemId || null,
        photoId: sale?.itemId ? photoFor.get(sale.itemId) || null : null,
        isCustom: !sale?.itemId,
        units: 0,
        // How many separate TIMES it sold, which is a different business from
        // how many units moved. In the report that prompted this, one product
        // was 42 units across 41 sales and another was 10 units across 5: one
        // is a counter people walk up to, the other is bulk orders, and the row
        // could not tell them apart because it only ever carried units.
        sales: 0,
        revenue: 0,
        profit: 0,
      };
      row.sales += 1;
      row.units += saleQty(sale);
      row.revenue += saleRevenue(sale);
      row.profit += saleProfit(sale);
      rows.set(key, row);
    }
  }
  return [...rows.values()].map((r) => ({
    ...r,
    margin: marginPercent(r.revenue, r.revenue - r.profit),
  }));
}

/**
 * The one thing worth telling an owner about their books right now.
 *
 * This exists because Analytics could rank things and nothing else. Every
 * figure on it was descriptive: how much, which shop, which product. None of
 * it could be acted on, which is also why the page had no focal point to give
 * -- ranking has no climax, so nine rows all claimed the same importance.
 *
 * It returns a FINDING, not a sentence. The kind and its numbers are business
 * arithmetic and belong here where they can be tested; the English belongs to
 * the screen. `bizNote` in App.jsx is the per-business version of the same idea
 * and returns copy, which is why it lives there and this does not.
 *
 * Ordered by what costs money soonest, not by how interesting it is:
 *
 *   1. untrusted     a cost is missing, so the profit figures are not real
 *   2. oversold      the books already disagree with the shelf
 *   3. losing        a business is selling for less than it costs
 *   4. runningOut    a top earner is about to stop earning
 *   5. parked        capital standing still on a shelf that is not moving
 *   6. thinMargin    volume on a product that keeps almost nothing
 *   7. concentrated  most of the income rests on one shop
 *   8. steady        nothing above is true, and saying so is worth a line
 *
 * `untrusted` is first because it is the only one that invalidates the others.
 * If a cost was never entered, the margin on that product reads 100%, the
 * profit on every screen is overstated, and a finding computed from those
 * numbers would be advice built on a typo. Say that before saying anything
 * else.
 *
 * `parked` was added after this ran against a real shop: 463 of one product and
 * 490 of another, decades of stock at the pace they sell, roughly 12.8M FCFA
 * standing still against a quarter that earned 9.2M. The ladder said "nothing
 * needs doing", because it was written before the app could see a shelf at all.
 *
 * Only 7 and 8 need any history, which is the point: a shop two weeks old can
 * still be told something true.
 *
 * One deliberate omission: nothing here compares this month against last. The
 * summary card directly above already says that, and a page that prints one
 * fact twice invites the reader to look for the difference.
 */
export function portfolioFinding(businesses, { lowStockThreshold = 3 } = {}) {
  const list = (businesses || []).filter((b) => b && !b.deletedAt);
  if (!list.length) return { kind: "none" };

  // Stock is per business, and derived rather than stored, so it is walked once
  // here and shared by every rule below that asks about a shelf.
  const shelves = list.map((b) => ({
    biz: b,
    items: deriveInventory(b).filter((i) => !i.deletedAt),
  }));

  const shelves2 = shelves.map((s) => ({ ...s, health: inventoryHealth(s.biz, { lowStockThreshold }) }));

  // ── 1. numbers that cannot be trusted ──────────────────────────────────────
  const untrusted = [];
  for (const { biz, health } of shelves2) {
    for (const row of health) if (row.costSuspect) untrusted.push({ biz, row });
  }
  if (untrusted.length) {
    const worst = untrusted.reduce((a, b) => (b.row.qty > a.row.qty ? b : a));
    return {
      kind: "untrusted",
      tone: "danger",
      count: untrusted.length,
      itemName: worst.row.name,
      bizName: worst.biz.name,
      qty: worst.row.qty,
    };
  }

  // ── 2. the books already disagree with the shelf ───────────────────────────
  const oversold = [];
  for (const { biz, items } of shelves) {
    for (const i of items) if (hasStockDiscrepancy(i)) oversold.push({ biz, item: i });
  }
  if (oversold.length) {
    const worst = oversold.reduce((a, b) => (b.item.qty < a.item.qty ? b : a));
    return {
      kind: "oversold",
      tone: "danger",
      count: oversold.length,
      itemName: worst.item.name,
      bizName: worst.biz.name,
      qty: worst.item.qty,
    };
  }

  // ── 3. a business selling for less than it costs ───────────────────────────
  const losing = list
    .map((b) => ({ b, stats: calcBizStats(b) }))
    .filter((x) => x.stats.profit < 0)
    .sort((a, b) => a.stats.profit - b.stats.profit)[0];
  if (losing) {
    return {
      kind: "losing",
      tone: "danger",
      bizName: losing.b.name,
      amount: Math.abs(losing.stats.profit),
      currency: losing.b.currency,
    };
  }

  const items = itemPerformance(list).filter((i) => i.units > 0);

  // ── 4. a top earner about to stop earning ──────────────────────────────────
  //
  // Top THREE, not just the first, because running out of the second best
  // thing you sell is the same problem and the single-highest rule almost
  // never fired.
  //
  // But rank alone is not enough, and the test that caught it is worth keeping
  // in mind: a book with one real earner and four trinkets has trinkets in its
  // top three, so "one of your best earners is running low" would have led the
  // whole screen with a product worth ten francs. A tenth of the portfolio's
  // item profit is the floor, which scales with the books rather than with how
  // many products happen to exist.
  const stockByItemId = new Map();
  for (const { items: shelf } of shelves) for (const i of shelf) stockByItemId.set(i.id, i);
  const itemProfit = items.reduce((sum, i) => sum + Math.max(0, i.profit), 0);
  const topEarners = [...items]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 3)
    .filter((i) => itemProfit > 0 && i.profit >= itemProfit * 0.1);
  const runningOut = topEarners
    .map((row) => ({ row, stock: row.itemId ? stockByItemId.get(row.itemId) : null }))
    .filter((x) => x.stock && x.stock.qty > 0 && x.stock.qty <= lowStockThreshold)
    .sort((a, b) => b.row.profit - a.row.profit)[0];
  if (runningOut) {
    return {
      kind: "runningOut",
      tone: "warning",
      itemName: runningOut.row.name,
      bizName: runningOut.row.bizName,
      qty: runningOut.stock.qty,
      profit: runningOut.row.profit,
      currency: runningOut.row.currency,
    };
  }

  // ── 5. capital standing still ──────────────────────────────────────────────
  //
  // Only when it is large against what the shop actually earns. "You hold three
  // months of stock" is how a shop is supposed to work; "you hold four years of
  // it, and it cost more than you have made" is the finding.
  const parked = shelves2
    .flatMap(({ biz, health }) => health.filter((r) => r.status === STOCK.OVERSTOCKED).map((row) => ({ biz, row })))
    .sort((a, b) => b.row.value - a.row.value)[0];
  if (parked) {
    const total = shelves2
      .flatMap(({ health }) => health.filter((r) => r.status === STOCK.OVERSTOCKED))
      .reduce((sum, r) => sum + r.value, 0);
    const earned = calcPortfolioStats(list).revenue;
    if (total > 0 && (earned === 0 || total > earned * 0.25)) {
      return {
        kind: "parked",
        tone: "warning",
        itemName: parked.row.name,
        bizName: parked.biz.name,
        months: parked.row.monthsOfCover,
        qty: parked.row.qty,
        value: total,
        currency: parked.biz.currency,
      };
    }
  }

  // ── 6. volume on something that keeps almost nothing ───────────────────────
  //
  // The bestseller is the thing an owner already knows about, so it is only
  // worth a line when it is ALSO the thing keeping the least. A thin margin on
  // one unit sold is noise; on the product that moves most it is the single
  // most valuable price decision available.
  if (items.length > 1) {
    const thin = (row, mostSold) => ({
      kind: "thinMargin",
      tone: "warning",
      mostSold,
      itemName: row.name,
      bizName: row.bizName,
      units: row.units,
      margin: row.margin,
      overall: calcPortfolioStats(list).margin,
    });
    // Three, both times. A thin margin on one or two units is noise: it is a
    // price someone tried once. The card this rule replaced had no such floor,
    // but it also sat at the BOTTOM of the page, where being occasionally
    // trivial cost nothing. As the lead it would be the screen's headline.
    const MOVED = 3;
    const mostSold = [...items].sort((a, b) => b.units - a.units)[0];
    if (mostSold && mostSold.units >= MOVED && mostSold.margin < 20) return thin(mostSold, true);
    // The plain thinnest margin, which is what the "Thinnest margin" card on
    // this screen used to say on its own. It is the same finding, so it is one
    // rule here rather than a card repeating the lead a screen further down.
    const weakest = [...items].filter((i) => i.units >= MOVED).sort((a, b) => a.margin - b.margin)[0];
    if (weakest && weakest.margin < 20) return thin(weakest, false);
  }

  // ── 7. most of the income resting on one shop ──────────────────────────────
  if (list.length > 1) {
    const ranked = list.map((b) => ({ b, stats: calcBizStats(b) }));
    const total = ranked.reduce((sum, x) => sum + Math.max(0, x.stats.profit), 0);
    const top = ranked.sort((a, b) => b.stats.profit - a.stats.profit)[0];
    const share = total > 0 ? Math.round((Math.max(0, top.stats.profit) / total) * 100) : 0;
    if (share >= 60) {
      return { kind: "concentrated", tone: "muted", bizName: top.b.name, share };
    }
  }

  // ── 8. nothing above is true ───────────────────────────────────────────────
  //
  // An all-clear only where there is a shelf to be clear about. With nothing
  // stocked, "nothing is running low" is a sentence about no data, and the
  // screen is better off saying nothing at all.
  const stocked = shelves.reduce((n, s) => n + s.items.length, 0);
  if (!stocked) return { kind: "none" };
  return { kind: "steady", tone: "muted", itemCount: stocked, bizCount: list.length };
}

/**
 * Realised revenue and profit per calendar month, oldest first.
 *
 * `weeklyProfit` answers "how was last week", which is the right question at a
 * stall. A month is the right question for a business with product lines and
 * stock, and it is the axis every review of one gets written on. The two are
 * not interchangeable: eight weeks cannot show a season.
 *
 * The last bucket is the current, INCOMPLETE month and says so, because a
 * partial month drawn beside whole ones reads as a collapse.
 */
export function monthlyProfit(businesses, { months = 6, now = new Date() } = {}) {
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    buckets.push({
      start: startOfMonth(now, i),
      end: startOfMonth(now, i - 1),
      revenue: 0,
      profit: 0,
      salesCount: 0,
      partial: i === 0,
    });
  }
  for (const b of businesses || []) {
    for (const sale of liveSales(b)) {
      const day = String(sale?.occurredAt || "").slice(0, 10);
      const bucket = buckets.find((x) => day >= x.start && day < x.end);
      if (!bucket) continue;
      bucket.revenue += saleRevenue(sale);
      bucket.profit += saleProfit(sale);
      bucket.salesCount += 1;
    }
  }
  return buckets;
}

/** Days between two ISO dates, at least one. */
const daysBetween = (from, to) =>
  Math.max(1, Math.round((Date.parse(to + "T00:00:00.000Z") - Date.parse(from + "T00:00:00.000Z")) / 86400000));

export const STOCK = {
  OVERSOLD: "oversold",
  SOLD_OUT_RISK: "soldOutRisk",
  OUT_OF_STOCK: "outOfStock",
  UNSOLD: "unsold",
  OVERSTOCKED: "overstocked",
  HEALTHY: "healthy",
};

/** A year of stock at the pace it actually sells is capital parked, not stock. */
const OVERSTOCKED_MONTHS = 12;

/**
 * Whether each product is moving, and what it costs to hold.
 *
 * This app has always warned about too LITTLE stock and said nothing at all
 * about too much, which is the wrong half for a trader. The review that
 * prompted this found 463 of one product against 37 sold in three months, and
 * 490 of another against 35. At that pace it is decades of inventory, and the
 * cash for it is already spent.
 *
 * Two readings of one fact, because they answer different questions:
 *
 *   sellThrough    what share of everything ever held has moved. Familiar,
 *                  comparable across products, and blind to time.
 *   monthsOfCover  how long the shelf lasts at the pace it is really selling.
 *                  This is the one that changes behaviour: "forty-two months of
 *                  stock" is a sentence an owner can act on, and "7%" is not.
 *
 * `soldSinceRestock` is the third question, the one asked holding the product:
 * of the batch I last bought, how much is gone. It is per ITEM deliberately.
 * Nobody restocks a whole shop at once, so a shop-wide "since the last
 * inventory" would be a boundary that does not exist, while per item it is
 * already in the ledger and needs nothing invented.
 *
 * Custom sales have no item and never appear here, which is right: there is no
 * shelf behind them.
 */
export function inventoryHealth(business, { since, until, lowStockThreshold = 3, now = new Date() } = {}) {
  const items = deriveInventory(business).filter((i) => !i.deletedAt);
  const live = liveSales(business);
  const today = now.toISOString().slice(0, 10);

  const soldBy = new Map();
  for (const s of live) {
    if (!s?.itemId || !inPeriod(s, since, until)) continue;
    soldBy.set(s.itemId, (soldBy.get(s.itemId) || 0) + saleQty(s));
  }

  // The window the pace is measured over. With no bounds that is the whole
  // trading history, measured from the FIRST SALE rather than from the epoch:
  // otherwise every pace in a young shop is divided by decades.
  const days = live.map((s) => String(s?.occurredAt || "").slice(0, 10)).filter(Boolean).sort();
  const months = daysBetween(since || days[0] || today, until || today) / 30.44;

  const lastRestock = new Map();
  for (const m of business?.stockMovements || []) {
    if (Math.trunc(Number(m?.delta) || 0) <= 0) continue;
    const at = String(m.occurredAt || "").slice(0, 10);
    const prev = lastRestock.get(m.itemId);
    if (!prev || at > prev.at) lastRestock.set(m.itemId, { at, qty: Math.trunc(Number(m.delta) || 0) });
  }

  return items.map((item) => {
    const soldInPeriod = soldBy.get(item.id) || 0;
    const everHeld = Math.max(0, item.qty) + soldInPeriod;
    const perMonth = months > 0 ? soldInPeriod / months : 0;
    const cover = perMonth > 0 ? item.qty / perMonth : null;
    const restock = lastRestock.get(item.id) || null;
    const soldSinceRestock = restock
      ? live
          .filter((s) => s.itemId === item.id && String(s.occurredAt || "").slice(0, 10) >= restock.at)
          .reduce((n, s) => n + saleQty(s), 0)
      : 0;

    let status = STOCK.HEALTHY;
    if (item.qty < 0) status = STOCK.OVERSOLD;
    else if (item.qty === 0) status = STOCK.OUT_OF_STOCK;
    else if (soldInPeriod > 0 && (item.qty <= lowStockThreshold || (cover !== null && cover < 1))) status = STOCK.SOLD_OUT_RISK;
    else if (soldInPeriod === 0) status = STOCK.UNSOLD;
    else if (cover !== null && cover >= OVERSTOCKED_MONTHS) status = STOCK.OVERSTOCKED;

    return {
      id: item.id,
      name: item.name,
      photoId: item.photoId || null,
      qty: item.qty,
      avgCost: item.avgCost,
      // What is standing on the shelf, in money. The number that turns "a lot
      // of stock" into a decision.
      value: Math.max(0, item.qty) * item.avgCost,
      // Stock on hand whose cost cannot be right.
      //
      // Zero is the obvious case: the cost was never entered, so the margin
      // reads 100% and the shelf appears to be worth nothing. The second case
      // is the one that caught this out. Run against real books, a product with
      // 490 units on the shelf valued the whole lot at 24,500 FCFA, because its
      // unit cost had been typed as 50 against a selling price over 110,000.
      // Not zero, so the zero check let it through, and the capital figure was
      // understated by millions.
      //
      // Under 2% of the selling price, on something there is physical stock of,
      // is not a bargain: it is a missing zero. A genuinely costless line has
      // no shelf to sit on, so `qty > 0` is what keeps services and digital
      // goods out of this.
      costSuspect: item.qty > 0 && (item.avgCost === 0 || item.avgCost * 50 < Math.max(0, Math.round(Number(item.unitPrice) || 0))),
      soldInPeriod,
      sellThrough: everHeld > 0 ? Math.round((soldInPeriod / everHeld) * 100) : 0,
      monthsOfCover: cover === null ? null : Math.round(cover * 10) / 10,
      lastRestockAt: restock ? restock.at : null,
      lastRestockQty: restock ? restock.qty : 0,
      soldSinceRestock,
      status,
    };
  });
}

/**
 * Money standing on the shelf right now, and how much of it cannot be trusted.
 *
 * `unpriced` is not a footnote. Every item it counts is one whose stock value
 * is understated here and whose margin is overstated everywhere else, so a
 * screen showing the total without showing this count is making a claim it
 * cannot support.
 */
export function stockValue(business) {
  let value = 0;
  let unpriced = 0;
  for (const row of inventoryHealth(business)) {
    value += row.value;
    if (row.costSuspect) unpriced += 1;
  }
  return { value, unpriced };
}
