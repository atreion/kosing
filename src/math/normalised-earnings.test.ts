import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeNormalisedEarnings, type NormalisedEarningsInputs } from "./normalised-earnings.ts";

const inputs: NormalisedEarningsInputs = {
  revenueBase: 10000,
  netDebt: 2000,
  shares: 100,
  ebitMargin: { bear: 0.09, base: 0.12, bull: 0.14 },
  evEbitMultiple: { bear: 10, base: 13, bull: 16 },
};

test("each scenario is revenue x margin x multiple, less net debt, per share", () => {
  const r = computeNormalisedEarnings(inputs);
  assert.deepEqual(r.base, { ebit: 1200, ev: 15600, equity: 13600, valuePerShare: 136 });
  assert.deepEqual(r.bear, { ebit: 900, ev: 9000, equity: 7000, valuePerShare: 70 });
  assertClose(r.bull.ebit, 1400, 1e-9);
  assertClose(r.bull.ev, 22400, 1e-9);
  assertClose(r.bull.valuePerShare, 204, 1e-9);
});

test("property: bear <= base <= bull whenever the inputs are ordered and revenue is non-negative", () => {
  for (const revenueBase of [0, 500, 10000, 250000]) {
    for (const [m1, m2, m3] of [
      [0.05, 0.1, 0.15],
      [0.1, 0.1, 0.1],
      [-0.02, 0.05, 0.2],
    ]) {
      for (const [x1, x2, x3] of [
        [8, 12, 16],
        [12, 12, 12],
      ]) {
        const r = computeNormalisedEarnings({
          ...inputs,
          revenueBase,
          ebitMargin: { bear: m1 ?? 0, base: m2 ?? 0, bull: m3 ?? 0 },
          evEbitMultiple: { bear: x1 ?? 0, base: x2 ?? 0, bull: x3 ?? 0 },
        });
        assert.ok(r.bear.valuePerShare <= r.base.valuePerShare + 1e-12);
        assert.ok(r.base.valuePerShare <= r.bull.valuePerShare + 1e-12);
      }
    }
  }
});

test("a negative-margin bear case is a negative EV, reported, not clamped", () => {
  const r = computeNormalisedEarnings({
    ...inputs,
    ebitMargin: { bear: -0.05, base: 0.1, bull: 0.15 },
  });
  assert.ok(r.bear.ev < 0);
  assert.ok(Number.isFinite(r.bear.valuePerShare));
});
