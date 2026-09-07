import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertClose, unwrap } from "./test-utils.ts";
import { computeWacc, parseWaccInputs, type WaccRawInputs } from "./wacc.ts";

const validRaw: WaccRawInputs = {
  riskFreeRate: 0.0245,
  erp: 0.055,
  beta: 0.85,
  countryRiskPremium: 0,
  taxRate: 0.21,
  preTaxCostOfDebt: 0.035,
  equityWeight: 0.92,
};

describe("computeWacc", () => {
  const tolerance = 1e-6;

  it("matches the golden case", () => {
    const inputs = unwrap(parseWaccInputs(validRaw));
    const result = computeWacc(inputs);

    assertClose(result.afterTaxCostOfDebt, 0.02765, tolerance);
    assertClose(result.costOfEquity, 0.07125, tolerance);
    assertClose(result.wacc, 0.067762, tolerance);
    assert.equal(result.inputsUsed, inputs);
  });

  it("adds the country risk premium to cost of equity", () => {
    const inputs = unwrap(
      parseWaccInputs({
        ...validRaw,
        riskFreeRate: 0.05,
        erp: 0.055,
        beta: 1,
        countryRiskPremium: 0.02,
      }),
    );
    const result = computeWacc(inputs);

    assertClose(result.costOfEquity, 0.125, tolerance);
    assert.equal(result.inputsUsed, inputs);
  });
});

describe("parseWaccInputs", () => {
  it("rejects a negative beta", () => {
    const result = parseWaccInputs({ ...validRaw, beta: -0.5 });

    assert.deepEqual(result, {
      ok: false,
      error: [{ kind: "notPositive", name: "beta", value: -0.5 }],
    });
  });

  it("rejects a negative risk-free rate", () => {
    const result = parseWaccInputs({ ...validRaw, riskFreeRate: -0.01 });

    assert.deepEqual(result, {
      ok: false,
      error: [{ kind: "notNonNegative", name: "riskFreeRate", value: -0.01 }],
    });
  });

  it("reports every invalid field", () => {
    const result = parseWaccInputs({ ...validRaw, riskFreeRate: -0.01, beta: -0.5 });

    assert.deepEqual(result, {
      ok: false,
      error: [
        { kind: "notNonNegative", name: "riskFreeRate", value: -0.01 },
        { kind: "notPositive", name: "beta", value: -0.5 },
      ],
    });
  });
});
