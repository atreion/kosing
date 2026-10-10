import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeNav, type NavInputs } from "./nav.ts";

/**
 * Edison Investment Research on DeA Capital, 23 November 2017, Exhibit 11,
 * sum of the parts: Kenan (Migros) 41.0, Crescita 8.3, Sigla and other
 * direct investments 11.7, private equity and real estate funds 188.9,
 * alternative asset management 150.8, other assets 0.0, net financial
 * position 79.7; group total EUR 480.5m over 256.3m shares, EUR 1.87 per
 * share. A positive net financial position is parent net cash, so
 * parentNetDebt is -79.7; the warranted discount is zero because the note
 * states the undiscounted figure.
 * https://edisongroup.com/research/accelerating-strong-cash-flow-supports-dividends/19953
 */
test("worked example: Edison's DeA Capital sum of the parts", () => {
  const r = computeNav({
    holdings: [
      { name: "Kenan (Migros)", fairValue: 41.0 },
      { name: "Crescita", fairValue: 8.3 },
      { name: "Sigla and other direct investments", fairValue: 11.7 },
      { name: "Private equity and real estate funds", fairValue: 188.9 },
      { name: "Alternative asset management", fairValue: 150.8 },
      { name: "Other assets", fairValue: 0 },
    ],
    parentNetDebt: -79.7,
    warrantedDiscount: 0,
    shares: 256.3,
  });
  assertClose(r.nav, 480.5, 0.1);
  assertClose(r.valuePerShare, 1.87, 0.01);
  assert.equal(r.discountApplied, 0);
});

const base: NavInputs = {
  holdings: [
    { name: "A", fairValue: 18000 },
    { name: "B", fairValue: 9500 },
    { name: "C", fairValue: 4200 },
  ],
  parentNetDebt: 300,
  warrantedDiscount: 0.2,
  shares: 280,
};

test("the discount applies to NAV after parent net debt", () => {
  const r = computeNav(base);
  assert.equal(r.grossAssetValue, 31700);
  assert.equal(r.nav, 31400);
  assertClose(r.discountApplied, 6280, 1e-9);
  assertClose(r.equityValue, 25120, 1e-9);
  assertClose(r.valuePerShare, 25120 / 280, 1e-9);
});

test("property: value is linear in holdings value and decreasing in the discount", () => {
  const v = (scale: number, discount: number) =>
    computeNav({
      ...base,
      holdings: base.holdings.map((h) => ({ ...h, fairValue: h.fairValue * scale })),
      warrantedDiscount: discount,
    }).valuePerShare;
  const v1 = v(1, 0.2);
  const v2 = v(2, 0.2);
  const v3 = v(3, 0.2);
  assertClose(v3 - v2, v2 - v1, 1e-9, "linear");
  let previous = Number.POSITIVE_INFINITY;
  for (const d of [0, 0.1, 0.2, 0.5, 0.9]) {
    const current = v(1, d);
    assert.ok(current < previous, `discount ${d}`);
    previous = current;
  }
});

test("parent net debt above the gross asset value gives a negative NAV, reported as is", () => {
  const r = computeNav({ ...base, parentNetDebt: 40000 });
  assert.ok(r.nav < 0);
  assert.ok(r.valuePerShare < 0);
  assert.ok(Number.isFinite(r.valuePerShare));
});
