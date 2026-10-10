import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeDcf } from "./dcf.ts";
import { dcfInputsAtGrowth, type ReverseDcfInputs, solveImpliedGrowth } from "./reverse-dcf.ts";

const base: ReverseDcfInputs = {
  targetValuePerShare: 50,
  revenueBase: 1000,
  ebitMargin: 0.15,
  capexPctRevenue: 0.04,
  daPctRevenue: 0.03,
  taxRate: 0.25,
  wacc: 0.09,
  netDebt: 200,
  shares: 100,
  horizonYears: 10,
  terminalGrowth: 0.02,
};

function valueAt(inputs: ReverseDcfInputs, growth: number): number {
  const r = computeDcf(dcfInputsAtGrowth(inputs, growth));
  if (r.kind !== "value") throw new Error(r.reason);
  return r.valuePerShare;
}

test("property: the solved growth, fed through the forward DCF, recovers the price", () => {
  for (const target of [20, 35, 50, 80, 120]) {
    for (const wacc of [0.07, 0.09, 0.12]) {
      const inputs = { ...base, targetValuePerShare: target, wacc };
      const r = solveImpliedGrowth(inputs);
      assert.equal(r.kind, "solved", `target ${target} wacc ${wacc}`);
      if (r.kind !== "solved") continue;
      const recovered = valueAt(inputs, r.impliedGrowth);
      assert.ok(Math.abs(recovered - target) / target < 1e-9, `${recovered} vs ${target}`);
    }
  }
});

test("a growth known in advance is found", () => {
  const target = valueAt(base, 0.065);
  const r = solveImpliedGrowth({ ...base, targetValuePerShare: target });
  assert.equal(r.kind, "solved");
  if (r.kind !== "solved") return;
  assertClose(r.impliedGrowth, 0.065, 1e-9);
});

test("the horizon builds that many identical years with no working capital drag", () => {
  const five = dcfInputsAtGrowth({ ...base, horizonYears: 5 }, 0.1);
  assert.equal(five.years.length, 5);
  assert.deepEqual(five.years[0], {
    revenueGrowth: 0.1,
    ebitMargin: 0.15,
    capexPctRevenue: 0.04,
    daPctRevenue: 0.03,
  });
  assert.equal(five.workingCapitalPctRevenue, 0);
  assert.deepEqual(five.terminal, { kind: "perpetuityGrowth", growth: 0.02 });
});

test("terminal growth at or above wacc is unsolvable with that reason", () => {
  assert.deepEqual(solveImpliedGrowth({ ...base, terminalGrowth: 0.09 }), {
    kind: "unsolvable",
    reason: "terminalGrowthNotBelowWacc",
  });
});

test("a negative-margin base period cannot reach a positive price", () => {
  const r = solveImpliedGrowth({ ...base, ebitMargin: -0.05, daPctRevenue: 0 });
  assert.deepEqual(r, { kind: "unsolvable", reason: "noGrowthInBracketMatchesPrice" });
});

test("a price beyond what any growth in the bracket reaches is unsolvable, not clamped", () => {
  const atTop = valueAt(base, 1);
  const r = solveImpliedGrowth({ ...base, targetValuePerShare: atTop * 2 });
  assert.deepEqual(r, { kind: "unsolvable", reason: "noGrowthInBracketMatchesPrice" });
});
