import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMultiples, median, positionInBand } from "./multiples.ts";

const inputs = {
  marketCap: 24380,
  enterpriseValue: 26380,
  netIncome: 1020,
  ebit: 1380,
  ebitda: 1750,
  revenue: 11400,
  bookValue: 6200,
};

test("each multiple is its numerator over its denominator", () => {
  assert.deepEqual(computeMultiples(inputs), {
    peTrailing: 24380 / 1020,
    evEbit: 26380 / 1380,
    evEbitda: 26380 / 1750,
    evRevenue: 26380 / 11400,
    priceBook: 24380 / 6200,
  });
});

test("a null, zero or negative denominator gives null, never a negative multiple", () => {
  const loss = computeMultiples({ ...inputs, netIncome: -50, ebit: 0, ebitda: null });
  assert.equal(loss.peTrailing, null);
  assert.equal(loss.evEbit, null);
  assert.equal(loss.evEbitda, null);
  assert.notEqual(loss.evRevenue, null);
});

test("position against a band is below, within or above, and null when anything is missing", () => {
  assert.equal(positionInBand(10, 12, 20), "below");
  assert.equal(positionInBand(12, 12, 20), "within");
  assert.equal(positionInBand(20, 12, 20), "within");
  assert.equal(positionInBand(21, 12, 20), "above");
  assert.equal(positionInBand(null, 12, 20), null);
  assert.equal(positionInBand(15, null, 20), null);
  assert.equal(positionInBand(15, 12, null), null);
});

test("median of an odd, even and empty list", () => {
  assert.equal(median([19, 22, 15]), 19);
  assert.equal(median([19, 22]), 20.5);
  assert.equal(median([]), null);
});
