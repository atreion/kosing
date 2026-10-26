import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContractBlock } from "../domain/valuation.ts";
import { assertClose } from "../test-utils.ts";
import {
  computeContractBookValue,
  computeInventoryValue,
  computeMineValue,
  contractPrice,
  type MineInputs,
  realRate,
  royaltyRateAt,
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
  royaltySteps: [],
  sustainingCapexPerUnit: 5,
  initialCapex: [{ year: 2026, amount: 100 }],
  openingTaxBase: 0,
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
    pricing: { kind: "marketRelated", discount: 0, floor: 50, ceiling: 70 },
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

test("an opening tax base is depreciated with the capex and lowers tax", () => {
  // 40 more of deductions over 20 units: 2 per unit, so tax falls by 0.25 x 20 = 5 a year.
  const r = computeMineValue({ ...mine, openingTaxBase: 40 }, 80, timing);
  assert.deepEqual(
    r.years.map((y) => y.freeCashFlow),
    [-100, 325, 325, -20],
  );
});

test("a royalty step applies at and above its price", () => {
  const stepped = { ...mine, royaltySteps: [{ fromPrice: 80, extraRate: 0.05 }] };
  // At 80: royalty 10% of 800 = 80, taxable 320, tax 80, cash 800-80-300-50-80 = 290.
  assert.equal(computeMineValue(stepped, 80, timing).years[1]?.freeCashFlow, 290);
  assertClose(
    computeMineValue(stepped, 79.99, timing).npv,
    computeMineValue(mine, 79.99, timing).npv,
    1e-9,
  );
  assert.equal(royaltyRateAt(0.05, [{ fromPrice: 60, extraRate: 0.02 }], 100), 0.07);
});

test("a market-related contract takes its discount before the collar", () => {
  const pricing = { kind: "marketRelated", discount: 0.03, floor: null, ceiling: null } as const;
  assertClose(contractPrice(pricing, 100), 97, 1e-12);
  assert.equal(contractPrice({ ...pricing, floor: 98 }, 100), 98);
});

test("inventory sells at the price and pays tax on the gain over its tax cost only", () => {
  assert.equal(computeInventoryValue({ volume: 2, costPerUnit: 60, taxRate: 0.3 }, 80), 160 - 12);
  assert.equal(computeInventoryValue({ volume: 2, costPerUnit: 90, taxRate: 0.3 }, 80), 160);
});

test("a floor holds without a ceiling, and a ceiling without a floor", () => {
  const floorOnly = { kind: "marketRelated", discount: 0, floor: 70, ceiling: null } as const;
  assert.equal(contractPrice(floorOnly, 50), 70);
  assert.equal(contractPrice(floorOnly, 90), 90);
  const ceilingOnly = { kind: "marketRelated", discount: 0, floor: null, ceiling: 70 } as const;
  assert.equal(contractPrice(ceilingOnly, 90), 70);
  assert.equal(contractPrice(ceilingOnly, 50), 50);
});
