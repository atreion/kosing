import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContractBlock } from "../domain/valuation.ts";
import { assertClose } from "../test-utils.ts";
import {
  computeContractBookValue,
  computeMineValue,
  type MineInputs,
  realRate,
  solveImpliedPrice,
} from "./mine.ts";

/**
 * Worked by hand at 10% real from 1 January 2026. 2026: capex -100, discounted
 * one year. 2027 and 2028: revenue 800, royalty 40, cash cost 300, sustaining
 * 50, depreciation 50, tax 25% of 360 = 90, so 320 each. 2029: closure -20.
 * -100/1.1 + 320/1.21 + 320/1.331 - 20/1.4641 = 400.314.
 */
const mine: MineInputs = {
  production: [
    { year: 2027, volume: 10 },
    { year: 2028, volume: 10 },
  ],
  cashCostPerUnit: 30,
  royaltyRate: 0.05,
  sustainingCapexPerUnit: 5,
  initialCapex: [{ year: 2026, amount: 100 }],
  closureCost: 20,
  taxRate: 0.25,
  delayYears: 0,
};
const timing = { realRate: 0.1, valuationYear: 2026 };

test("a two-year mine, worked by hand", () => {
  const r = computeMineValue(mine, 80, timing);
  assertClose(r.npv, 400.314, 0.001);
  assert.deepEqual(
    r.years.map((y) => [y.year, y.freeCashFlow]),
    [
      [2026, -100],
      [2027, 320],
      [2028, 320],
      [2029, -20],
    ],
  );
});

test("a delay moves every cash flow a year later", () => {
  const r = computeMineValue({ ...mine, delayYears: 1 }, 80, timing);
  assertClose(r.npv, 400.314 / 1.1, 0.001);
});

test("a loss year pays no tax and earns no shield", () => {
  const r = computeMineValue(mine, 30, timing);
  const y2027 = r.years.find((y) => y.year === 2027);
  // revenue 300, royalty 15, cash cost 300, sustaining 50: -65, no tax.
  assert.equal(y2027?.freeCashFlow, -65);
});

test("the contract book is the after-tax premium over the market", () => {
  const fixed: ContractBlock = {
    fromYear: 2027,
    toYear: 2027,
    volumePerYear: 2,
    pricing: { kind: "fixed", price: 90 },
  };
  assertClose(computeContractBookValue([fixed], 0.25, 80, timing), 15 / 1.21, 1e-9);
  const capped: ContractBlock = {
    ...fixed,
    pricing: { kind: "marketRelated", floor: 50, ceiling: 70 },
  };
  assertClose(computeContractBookValue([capped], 0.25, 80, timing), -15 / 1.21, 1e-9);
  assert.equal(computeContractBookValue([capped], 0.25, 60, timing), 0);
  assertClose(computeContractBookValue([capped], 0.25, 40, timing), 15 / 1.21, 1e-9);
});

test("the implied price solves value against a target", () => {
  const r = solveImpliedPrice((p) => 2 * p, 10, { low: 0, high: 100 });
  assert.equal(r.kind, "solved");
  if (r.kind === "solved") assertClose(r.price, 5, 1e-6);
  const none = solveImpliedPrice((p) => 2 * p, 1000, { low: 0, high: 100 });
  assert.equal(none.kind, "unsolvable");
});

test("the implied price recovers the deck that produced a value", () => {
  const target = computeMineValue(mine, 85, timing).npv;
  const r = solveImpliedPrice((p) => computeMineValue(mine, p, timing).npv, target, {
    low: 0,
    high: 1000,
  });
  assert.equal(r.kind, "solved");
  if (r.kind === "solved") assertClose(r.price, 85, 1e-6);
});

test("real rate by Fisher", () => {
  assertClose(realRate(0.1, 0.02), 1.1 / 1.02 - 1, 1e-12);
});
