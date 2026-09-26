import test from "node:test";
import assert from "node:assert/strict";

import { fitWithin, MAX_EDGE } from "./photos.js";

/**
 * There is no canvas and no ImageBitmap in node, so the compression pipeline
 * itself cannot be tested here. `fitWithin` is the part that decides how many
 * bytes reach a metered connection, and it is pure, so it is the part that
 * gets asserted.
 */

test("scales the long edge down to the cap and keeps the aspect ratio", () => {
  const landscape = fitWithin(4000, 3000);
  assert.equal(landscape.width, MAX_EDGE);
  assert.equal(landscape.height, 750);
  assert.equal(landscape.scaled, true);

  // Portrait is the common case: a phone held upright at a stall.
  const portrait = fitWithin(3000, 4000);
  assert.equal(portrait.height, MAX_EDGE);
  assert.equal(portrait.width, 750);
});

test("never scales up", () => {
  // Re-encoding a small photo larger spends bytes on a metered connection to
  // invent detail that was never captured.
  const small = fitWithin(320, 240);
  assert.deepEqual(small, { width: 320, height: 240, scaled: false });

  const exact = fitWithin(MAX_EDGE, MAX_EDGE);
  assert.equal(exact.scaled, false);
});

test("survives junk without returning a zero-sized canvas", () => {
  // A canvas of width 0 throws on drawImage, so the floor is 1 rather than 0.
  for (const bad of [0, -5, NaN, null, undefined]) {
    const box = fitWithin(bad, bad);
    assert.ok(box.width >= 1 && box.height >= 1, `got ${box.width}x${box.height} for ${bad}`);
  }
});

test("an extreme panorama still fits inside the cap", () => {
  const wide = fitWithin(8000, 200);
  assert.equal(wide.width, MAX_EDGE);
  assert.ok(wide.height >= 1);
  assert.ok(Math.max(wide.width, wide.height) <= MAX_EDGE);
});
