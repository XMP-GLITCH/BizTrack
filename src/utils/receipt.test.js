import test from "node:test";
import assert from "node:assert/strict";

import { receiptNumber, receiptLines } from "./receipt.js";

/**
 * There is no canvas in node, so the drawing cannot be tested here. What CAN be
 * tested is the part that would be worst to get wrong: a receipt goes to the
 * buyer, and the owner's cost sits on the same record as the price.
 */

const sale = (over = {}) => ({
  id: "4a7f2c91-0000-4000-8000-000000000001",
  itemId: "i1",
  itemName: "Crochet Beanie",
  qty: 2,
  unitPrice: 6000,
  unitCost: 2500,
  askingPrice: 6000,
  note: "",
  isCustom: false,
  occurredAt: "2026-09-16T10:30:00.000Z",
  ...over,
});

test("the receipt shows what was paid and never what it cost", () => {
  // The single most damaging thing this feature could do is print the owner's
  // margin on a document they hand to a customer.
  const doc = receiptLines(sale(), "XAF");
  const printed = JSON.stringify(doc);

  assert.equal(doc.total, 12000);
  assert.ok(!printed.includes("2500"), "unit cost reached the receipt");
  assert.ok(!printed.includes("7000"), "profit reached the receipt");
  for (const line of doc.lines) {
    assert.ok(!Object.keys(line).some((k) => /cost|profit|margin/i.test(k)),
      "a cost-shaped field reached the receipt: " + Object.keys(line).join(", "));
  }
});

test("one customer buying three things is one receipt, not three", () => {
  // Each line stays its own sale record, because stock and profit are per item.
  // Only what gets PRINTED together changes.
  const basket = [
    sale({ id: "s1", groupId: "g1", itemName: "Crochet Beanie", qty: 2, unitPrice: 6000 }),
    sale({ id: "s2", groupId: "g1", itemName: "Tote Bag", qty: 1, unitPrice: 9500 }),
    sale({ id: "s3", groupId: "g1", itemName: "Baby Booties", qty: 3, unitPrice: 3500 }),
  ];
  const doc = receiptLines(basket, "XAF");

  assert.equal(doc.lines.length, 3);
  assert.equal(doc.total, 12000 + 9500 + 10500);
  assert.equal(doc.lines[1].name, "Tote Bag");
});

test("every line of a basket shares one number, and it survives a reprint", () => {
  const a = sale({ id: "s1", groupId: "g1" });
  const b = sale({ id: "s2", groupId: "g1" });
  assert.equal(receiptNumber([a, b]), receiptNumber([b, a]),
    "the number changed with the order of the lines");

  // A basket is numbered by its group, so it cannot collide with either line
  // reprinted on its own later.
  assert.notEqual(receiptNumber([a, b]), receiptNumber(sale({ id: "s1", groupId: null })));
});

test("a sale with no group is still numbered by its own id", () => {
  const lone = sale({ groupId: null });
  assert.equal(receiptNumber(lone), receiptNumber([lone]));
});

test("the number is stable, and depends only on things that never change", () => {
  const s = sale();
  const first = receiptNumber(s);

  // Same sale, later: a reprint has to match the copy already in someone's
  // hands. Everything mutable on the record is changed here.
  const reprinted = receiptNumber({ ...s, itemName: "Renamed", qty: 9, unitPrice: 1, note: "edited" });
  assert.equal(reprinted, first);

  assert.match(first, /^R-260916-[0-9A-F]{6}$/);
});

test("two sales on the same day get different numbers", () => {
  const a = receiptNumber(sale({ id: "4a7f2c91-0000-4000-8000-000000000001" }));
  const b = receiptNumber(sale({ id: "b83d1e05-0000-4000-8000-000000000002" }));
  assert.notEqual(a, b);
});

test("ids that share a long prefix still get different numbers", () => {
  // The first version sliced the leading six hex characters, so every sale in
  // the test books came out as R-260915-000000. Ids differing only at the end
  // are exactly what a seeded or sequentially generated id looks like.
  const ids = [
    "00000001-0000-4000-8000-000000000001s1",
    "00000002-0000-4000-8000-000000000002s3",
    "00000003-0000-4000-8000-000000000003s5",
    "00000001-0000-4000-8000-000000000001s9",
  ];
  const numbers = ids.map((id) => receiptNumber(sale({ id })));
  assert.equal(new Set(numbers).size, ids.length, "collided: " + numbers.join(", "));
  for (const n of numbers) assert.doesNotMatch(n, /-000000$/);
});

test("a number never contains a letter that reads as a digit", () => {
  // Someone reads this down a phone. UUID hex is 0-9a-f, so there is no O to
  // hear as a zero and no I to hear as a one, but the guard is cheap and the
  // id source could change.
  for (const id of ["4a7f2c91-0000-4000-8000-000000000001", "ffffffff-ffff-4fff-8fff-ffffffffffff"]) {
    const n = receiptNumber(sale({ id }));
    assert.ok(!/[OI]/.test(n.slice(9)), `ambiguous character in ${n}`);
  }
});

test("junk in does not produce a broken number", () => {
  // A receipt is reached from a list, and a half-migrated record should show a
  // dull number rather than "R-undefined-undefined".
  for (const bad of [null, undefined, {}, { id: "", occurredAt: "" }]) {
    const n = receiptNumber(bad);
    assert.match(n, /^R-\d{6}-[0-9A-F]{6}$/, `got ${n}`);
  }
});

test("quantity of one still reads as a unit price", () => {
  const doc = receiptLines(sale({ qty: 1 }), "XAF");
  assert.equal(doc.total, 6000);
  assert.ok(doc.lines[0].unitLabel.startsWith("1 × "));
});

test("a missing quantity is one, not zero", () => {
  // A zero would print a total of nothing on a document that says "Total paid".
  const doc = receiptLines(sale({ qty: 0 }), "XAF");
  assert.equal(doc.lines[0].qty, 1);
  assert.equal(doc.total, 6000);
});
