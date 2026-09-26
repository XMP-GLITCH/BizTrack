/**
 * Books for the harness, built through the REAL domain factories.
 *
 * This project has recorded THREE separate fixture faults that each looked
 * like a bug in the app: movements nested inside items so every quantity
 * derived to zero; one aggregate movement per product so a correction seemed
 * not to move stock; and sales grouped by product because the array IS the
 * order the Sales tab renders. So nothing here invents a shape -- `makeSale`
 * and `makeStockMovement` are imported from the app and given the same pair of
 * records the real write path writes, joined by `saleId`.
 *
 * THE ONE THING THIS FIXTURE MUST DO is make ALL TIME differ visibly from THIS
 * MONTH. A seed whose sales all fall in the current month cannot tell the two
 * apart, so a screenshot of it would agree with the card whichever period the
 * card was showing -- a check that cannot fail. Most of the money here is
 * deliberately banked in the months BEFORE this one.
 */
import { makeBusiness, makeItem, makeSale, makeStockMovement } from "../../src/domain/schema.js";

// One anchor for every date. Calling Date.now() per record is what made an
// earlier seed non-reproducible: two sales "on the same day" landed a
// millisecond apart and the newest row flipped between runs.
const NOW = new Date("2026-09-25T10:00:00.000Z");
const day = (back) => new Date(NOW.getTime() - back * 86400000).toISOString();

let n = 0;
const id = (p) => `${p}-${String(++n).padStart(4, "0")}`;

function shop({ name, category, color, emoji, products }) {
  const b = makeBusiness({ id: id("biz"), name, category, color, emoji, currency: "XAF" });
  for (const p of products) {
    const item = makeItem({
      id: id("item"), name: p.name, category,
      unitPrice: p.price, unitCost: p.cost, lowStockThreshold: 3,
    });
    b.items.push(item);

    // Opening stock, well before any sale.
    b.stockMovements.push(makeStockMovement({
      id: id("mv"), itemId: item.id, delta: p.stocked, unitCost: p.cost,
      reason: "restock", occurredAt: day(80),
    }));

    // `daysAgo` carries the point of this fixture: entries over 25 are in the
    // months BEFORE this one, so they are in all-time and not in the month.
    for (const [daysAgo, qty] of p.sales) {
      const sale = makeSale({
        id: id("sale"), itemId: item.id, itemName: p.name, qty,
        unitPrice: p.price, unitCost: p.cost, occurredAt: day(daysAgo),
      });
      b.sales.push(sale);
      b.stockMovements.push(makeStockMovement({
        id: id("mv"), itemId: item.id, delta: -qty, unitCost: p.cost,
        reason: "sale", saleId: sale.id, occurredAt: day(daysAgo),
      }));
    }
  }
  // `addSale` does [sale, ...b.sales], so the array is newest-first and the
  // Sales tab does not sort. Match the write path rather than the loop order.
  b.sales.sort((x, y) => (x.occurredAt < y.occurredAt ? 1 : -1));
  return b;
}

export function books() {
  return [
    shop({
      name: "Mami Joy Provisions", category: "Food", color: "#C17F5A", emoji: "\u{1F6D2}",
      products: [
        { name: "Rice 5kg",     price: 650000, cost: 520000, stocked: 120, sales: [[62, 8], [48, 6], [33, 7], [12, 4], [3, 3]] },
        { name: "Cooking Oil 1L", price: 180000, cost: 144000, stocked: 60, sales: [[70, 9], [51, 7], [29, 5], [8, 4]] },
        { name: "Soap Bar",     price: 50000,  cost: 32000,  stocked: 200, sales: [[66, 20], [40, 15], [18, 10], [5, 6]] },
      ],
    }),
    shop({
      name: "Bright Electronics", category: "Electronics", color: "#475D9E", emoji: "\u{1F50C}",
      products: [
        { name: "Power Bank",       price: 1200000, cost: 840000, stocked: 25, sales: [[58, 3], [37, 2], [15, 2], [6, 1]] },
        { name: "Bluetooth Speaker", price: 1500000, cost: 990000, stocked: 18, sales: [[64, 2], [44, 3], [21, 1]] },
      ],
    }),
    shop({
      name: "QuickFix Phones", category: "Phone & computer repair", color: "#479E7E", emoji: "\u{1F4F1}",
      products: [
        { name: "Screen Replacement", price: 900000, cost: 324000, stocked: 40, sales: [[68, 4], [46, 5], [24, 3], [9, 2]] },
        { name: "Battery Swap",       price: 400000, cost: 144000, stocked: 50, sales: [[55, 6], [31, 4], [11, 3], [2, 2]] },
      ],
    }),
  ];
}

/** The exact envelope zustand/persist writes, so the app rehydrates rather than migrates. */
export function storageBlob(businesses, opts = {}) {
  return JSON.stringify({
    state: {
      businesses,
      currency: "XAF",
      lowStockThreshold: 3,
      userName: "Ebong",
      userEmail: "ebong@example.com",
      userAvatar: "/avatars/avatar1.png",
      isDarkMode: false,
      onboardingComplete: true,
      hasSeenGuide: true,          // the tour is a separate screen; not under test here
      joinDate: day(90),
      // The PIN lock is a GATE screen: it replaces the whole tree, so it cannot
      // be reached by navigating. It is seeded instead. The hash never has to
      // be right -- nothing here types a PIN, the screen just has to render.
      ...(opts.locked ? { isPinEnabled: true, hashedPin: "harness-not-a-real-hash",
                          hashedRecoveryKey: "harness-not-a-real-hash" } : {}),
    },
    version: 1,
  });
}
