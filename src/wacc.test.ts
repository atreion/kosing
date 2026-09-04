import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose, unwrap } from "./test-utils.ts";
import { computeWacc, parseWaccInputs, type WaccRawInputs } from "./wacc.ts";

const validRaw: WaccRawInputs = {
  riskFreeRate: 0.0245,
  erp: 0.055,
  beta: 0.85,
  countryPremium: 0,
  taxRate: 0.21,
  pretaxCostOfDebt: 0.035,
  weightEquity: 0.92,
};

test("golden case", () => {
  const tolerance = 1e-6;
  const inputs = unwrap(parseWaccInputs(validRaw));
  const result = computeWacc(inputs);
  assertClose(result.costOfDebtAfterTax, 0.02765, tolerance);
  assertClose(result.costOfEquity, 0.07125, tolerance);
  assertClose(result.wacc, 0.067762, tolerance);
  assert.equal(result.inputsUsed, inputs);
});

test("country premium adds to cost of equity", () => {
  const tolerance = 1e-6;
  const inputs = unwrap(
    parseWaccInputs({
      ...validRaw,
      riskFreeRate: 0.05,
      erp: 0.055,
      beta: 1,
      countryPremium: 0.02,
    }),
  );
  const result = computeWacc(inputs);
  assertClose(result.costOfEquity, 0.125, tolerance);
  assert.equal(result.inputsUsed, inputs);
});

test("negative beta is rejected", () => {
  const result = parseWaccInputs({
    ...validRaw,
    beta: -0.5,
  });
  assert.deepEqual(result, {
    ok: false,
    error: { kind: "notPositive", name: "beta", value: -0.5 },
  });
});

test("negative risk-free rate is rejected", () => {
  const result = parseWaccInputs({
    ...validRaw,
    riskFreeRate: -0.01,
  });
  assert.deepEqual(result, {
    ok: false,
    error: { kind: "notNonNegative", name: "riskFreeRate", value: -0.01 },
  });
});
