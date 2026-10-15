import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeHurdle, requiredDiscount } from "./hurdle.ts";

test("required discount is the classification's plus the AI-exposure add-on", () => {
  const d = requiredDiscount("qualityCompounder", "disruption");
  assert.ok(d !== null);
  assertClose(d.classificationDiscount, 0.25, 1e-9);
  assertClose(d.aiExposureAddOn, 0.05, 1e-9);
  assertClose(d.requiredDiscount, 0.3, 1e-9);
});

test("every valued classification has a discount and the add-ons follow the table", () => {
  const expected = [
    ["qualityCompounder", 0.25],
    ["garp", 0.3],
    ["holdingCompany", 0.3],
    ["specialSituation", 0.35],
    ["valueCyclical", 0.4],
    ["bankInsurer", 0.25],
  ] as const;
  for (const [classification, discount] of expected) {
    assertClose(
      requiredDiscount(classification, "secondOrderOnly")?.requiredDiscount ?? -1,
      discount,
      1e-9,
    );
  }
  const addOns = [
    ["direct", 0.15],
    ["picksAndShovels", 0.1],
    ["wealthEffect", 0.05],
    ["disruption", 0.05],
    ["secondOrderOnly", 0],
  ] as const;
  for (const [exposure, addOn] of addOns) {
    assertClose(requiredDiscount("garp", exposure)?.aiExposureAddOn ?? -1, addOn, 1e-9);
  }
});

test("a classification Kosing cannot value has no required discount", () => {
  for (const c of ["reitUtility", "saasPreProfit", "commodityProducer"] as const) {
    assert.equal(requiredDiscount(c, "secondOrderOnly"), null);
  }
});

test("entry price is base value less the required discount; the price clears at or below it", () => {
  const h = computeHurdle({ requiredDiscount: 0.3, baseValue: 158.85, price: 78.84 });
  assertClose(h.entryPrice, 111.195, 1e-9);
  assert.equal(h.clears, true);
  assert.equal(computeHurdle({ requiredDiscount: 0.3, baseValue: 100, price: 70 }).clears, true);
  assert.equal(
    computeHurdle({ requiredDiscount: 0.3, baseValue: 100, price: 70.01 }).clears,
    false,
  );
});
