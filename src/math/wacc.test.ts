import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeWacc, type WaccInputs } from "./wacc.ts";

/**
 * Pearson, "WACC Calculator", worked examples:
 * E = $600,000, D = $400,000, Re = 11%, Rd = 6%, Tc = 25% gives WACC = 8.4%;
 * Rf = 3.5%, beta = 1.15, market risk premium = 6% gives Re = 10.4%.
 * https://www.pearson.com/channels/calculators/wacc-calculator
 */
test("worked example: Pearson's WACC and CAPM figures", () => {
  // Pearson states the cost of equity directly; a zero beta and an 11% risk-free rate reproduce it.
  const withStatedCostOfEquity = computeWacc({
    riskFree: 0.11,
    erp: 0,
    beta: 0,
    countryPremium: 0,
    preTaxCostOfDebt: 0.06,
    taxRate: 0.25,
    equityWeight: 0.6,
    debtWeight: 0.4,
  });
  assertClose(withStatedCostOfEquity.costOfEquity, 0.11, 1e-12);
  assertClose(withStatedCostOfEquity.afterTaxCostOfDebt, 0.045, 1e-12);
  assertClose(withStatedCostOfEquity.wacc, 0.084, 1e-12);

  const capm = computeWacc({
    riskFree: 0.035,
    erp: 0.06,
    beta: 1.15,
    countryPremium: 0,
    preTaxCostOfDebt: 0,
    taxRate: 0,
    equityWeight: 1,
    debtWeight: 0,
  });
  assertClose(capm.costOfEquity, 0.104, 1e-12);
});

test("the country premium is scaled by beta alongside the equity risk premium", () => {
  const r = computeWacc({
    riskFree: 0.05,
    erp: 0.055,
    beta: 1,
    countryPremium: 0.02,
    preTaxCostOfDebt: 0.04,
    taxRate: 0.2,
    equityWeight: 0.8,
    debtWeight: 0.2,
  });
  assertClose(r.costOfEquity, 0.125, 1e-12);
  assertClose(r.afterTaxCostOfDebt, 0.032, 1e-12);
  assertClose(r.wacc, 0.8 * 0.125 + 0.2 * 0.032, 1e-12);
});

test("property: WACC lies between the after-tax cost of debt and the cost of equity", () => {
  const base: WaccInputs = {
    riskFree: 0.03,
    erp: 0.05,
    beta: 1.2,
    countryPremium: 0.01,
    preTaxCostOfDebt: 0.05,
    taxRate: 0.25,
    equityWeight: 0.5,
    debtWeight: 0.5,
  };
  for (const equityWeight of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    for (const beta of [0.2, 0.8, 1.5]) {
      const r = computeWacc({ ...base, beta, equityWeight, debtWeight: 1 - equityWeight });
      const lo = Math.min(r.afterTaxCostOfDebt, r.costOfEquity);
      const hi = Math.max(r.afterTaxCostOfDebt, r.costOfEquity);
      assert.ok(r.wacc >= lo - 1e-12 && r.wacc <= hi + 1e-12, `w=${equityWeight} b=${beta}`);
    }
  }
});
