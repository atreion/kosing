import assert from "node:assert/strict";
import { test } from "node:test";
import type { NonEmpty } from "../domain/types.ts";
import { assertAllClose, assertClose } from "../test-utils.ts";
import {
  computeDcf,
  type DcfInputs,
  projectYear,
  terminalValue,
  type YearAssumptions,
} from "./dcf.ts";

function flat(count: number, a: YearAssumptions): NonEmpty<YearAssumptions> {
  return [a, ...Array.from({ length: count - 1 }, () => a)];
}

const unit: YearAssumptions = {
  revenueGrowth: 0,
  ebitMargin: 0.1,
  capexPctRevenue: 0,
  daPctRevenue: 0,
};

const base: DcfInputs = {
  revenueBase: 1000,
  taxRate: 0,
  wacc: 0.1,
  netDebt: 0,
  shares: 100,
  years: flat(2, unit),
  workingCapitalPctRevenue: 0,
  terminal: { kind: "perpetuityGrowth", growth: 0.025 },
};

function value(inputs: DcfInputs): number {
  const r = computeDcf(inputs);
  assert.equal(r.kind, "value");
  if (r.kind !== "value") throw new Error("unreachable");
  return r.valuePerShare;
}

test("projectYear constructs every field for year one", () => {
  const row = projectYear(
    1000,
    1,
    { revenueGrowth: 0.1, ebitMargin: 0.3, capexPctRevenue: 0.05, daPctRevenue: 0.04 },
    { taxRate: 0.2, wacc: 0.1, workingCapitalPctRevenue: 0.02 },
  );
  assertAllClose(
    row,
    {
      year: 1,
      revenue: 1100,
      ebit: 330,
      ebitda: 374,
      nopat: 264,
      da: 44,
      capex: 55,
      changeInWorkingCapital: 2,
      fcff: 251,
      discountFactor: 1 / 1.1,
      pvFcff: 251 / 1.1,
    },
    1e-9,
  );
});

/**
 * Embat, "Discounted Cash Flow (DCF): Formula and Example": FCFF of 100, 115,
 * 130, 145, 160 over five years, WACC 9.0%, terminal growth 2.00%, net debt
 * 300. Stated: explicit PV 495.63, terminal value 2,331.43, its PV 1,515.27,
 * enterprise value 2,010.90, equity value 1,710.90, terminal share 75.35%.
 * https://www.embat.io/blog/discounted-cash-flow
 *
 * Mapped onto this model with margin 1, no tax, capex, D&A or working
 * capital, so FCFF equals revenue and revenue growth reproduces the stated
 * cash flows exactly.
 */
test("worked example: Embat's five-year DCF with a Gordon terminal value", () => {
  const flows = [100, 115, 130, 145, 160];
  const years = flows.map((f, i) => ({
    revenueGrowth: f / (i === 0 ? 100 : (flows[i - 1] ?? 100)) - 1,
    ebitMargin: 1,
    capexPctRevenue: 0,
    daPctRevenue: 0,
  }));
  const [first, ...rest] = years;
  if (first === undefined) throw new Error("unreachable");
  const r = computeDcf({
    revenueBase: 100,
    taxRate: 0,
    wacc: 0.09,
    netDebt: 300,
    shares: 1,
    years: [first, ...rest],
    workingCapitalPctRevenue: 0,
    terminal: { kind: "perpetuityGrowth", growth: 0.02 },
  });
  assert.equal(r.kind, "value");
  if (r.kind !== "value") return;
  assert.deepEqual(
    r.projection.map((row) => Math.round(row.fcff * 1e6) / 1e6),
    flows,
  );
  assertClose(r.pvExplicitPeriod, 495.63, 0.01);
  assertClose(r.terminalValue, 2331.43, 0.01);
  assertClose(r.pvTerminalValue, 1515.27, 0.01);
  assertClose(r.enterpriseValue, 2010.9, 0.01);
  assertClose(r.equityValue, 1710.9, 0.01);
  assertClose(r.terminalValuePctOfEv, 0.7535, 1e-4);
  assertClose(r.pvExplicitPeriod + r.pvTerminalValue, r.enterpriseValue, 1e-9);
});

/**
 * Wall Street Prep, "Terminal Value": year-5 FCF $36mm, long-term growth
 * 2.5%, WACC 10.0%, end-of-year discounting. Stated: terminal value $492mm,
 * present value $305mm. https://www.wallstreetprep.com/knowledge/terminal-value/
 */
test("worked example: Wall Street Prep's perpetuity terminal value", () => {
  const finalYear = projectYear(
    36,
    5,
    { revenueGrowth: 0, ebitMargin: 1, capexPctRevenue: 0, daPctRevenue: 0 },
    { taxRate: 0, wacc: 0.1, workingCapitalPctRevenue: 0 },
  );
  const tv = terminalValue(finalYear, 0.1, { kind: "perpetuityGrowth", growth: 0.025 });
  assertClose(tv, 492, 0.01);
  assertClose(tv * finalYear.discountFactor, 305, 1);
});

test("exit multiples apply to the final year's ebit, ebitda or fcff", () => {
  const finalYear = projectYear(
    1000,
    1,
    { revenueGrowth: 0, ebitMargin: 0.3, capexPctRevenue: 0.1, daPctRevenue: 0.04 },
    { taxRate: 0, wacc: 0.08, workingCapitalPctRevenue: 0 },
  );
  assertClose(
    terminalValue(finalYear, 0.08, { kind: "exitMultiple", multiple: 10, on: "evEbit" }),
    3000,
    1e-9,
  );
  assertClose(
    terminalValue(finalYear, 0.08, { kind: "exitMultiple", multiple: 10, on: "evEbitda" }),
    3400,
    1e-9,
  );
  assertClose(
    terminalValue(finalYear, 0.08, { kind: "exitMultiple", multiple: 10, on: "evFcff" }),
    2400,
    1e-9,
  );
});

test("terminal growth at or above wacc is a typed undefined outcome, never a number", () => {
  for (const growth of [0.1, 0.11, 0.5]) {
    const r = computeDcf({ ...base, terminal: { kind: "perpetuityGrowth", growth } });
    assert.deepEqual(r, { kind: "undefined", reason: "terminalGrowthNotBelowWacc" });
  }
  const exit = computeDcf({
    ...base,
    terminal: { kind: "exitMultiple", multiple: 8, on: "evEbit" },
  });
  assert.equal(exit.kind, "value", "an exit multiple has no growth precondition");
});

test("the equity bridge subtracts net debt and divides by shares", () => {
  const r = computeDcf({ ...base, netDebt: 200, shares: 50 });
  assert.equal(r.kind, "value");
  if (r.kind !== "value") return;
  assertClose(r.equityValue, r.enterpriseValue - 200, 1e-9);
  assertClose(r.valuePerShare, r.equityValue / 50, 1e-9);
});

test("a note fires when the terminal value exceeds 75% of enterprise value", () => {
  const r = computeDcf({ ...base, terminal: { kind: "perpetuityGrowth", growth: 0.07 } });
  assert.equal(r.kind, "value");
  if (r.kind !== "value") return;
  assert.ok(r.terminalValuePctOfEv > 0.75);
  assert.deepEqual(r.notes, [{ kind: "terminalValueDominates", pctOfEv: r.terminalValuePctOfEv }]);
});

test("property: value is increasing in every growth-path entry and in terminal growth", () => {
  const ten = flat(10, {
    revenueGrowth: 0.05,
    ebitMargin: 0.15,
    capexPctRevenue: 0.04,
    daPctRevenue: 0.03,
  });
  const inputs: DcfInputs = { ...base, taxRate: 0.25, years: ten, workingCapitalPctRevenue: 0.1 };
  const v0 = value(inputs);
  for (let i = 0; i < 10; i += 1) {
    const years = ten.map((y, j) =>
      j === i ? { ...y, revenueGrowth: y.revenueGrowth + 0.01 } : y,
    );
    const [first, ...rest] = years;
    if (first === undefined) throw new Error("unreachable");
    assert.ok(value({ ...inputs, years: [first, ...rest] }) > v0, `year ${i + 1}`);
  }
  let previous = value({ ...inputs, terminal: { kind: "perpetuityGrowth", growth: 0 } });
  for (const growth of [0.01, 0.02, 0.03, 0.04]) {
    const v = value({ ...inputs, terminal: { kind: "perpetuityGrowth", growth } });
    assert.ok(v > previous, `growth ${growth}`);
    previous = v;
  }
});

test("property: value is decreasing in wacc", () => {
  let previous = Number.POSITIVE_INFINITY;
  for (const wacc of [0.05, 0.06, 0.07, 0.08, 0.1, 0.12, 0.15]) {
    const v = value({ ...base, wacc });
    assert.ok(v < previous, `wacc ${wacc}`);
    previous = v;
  }
});

test("property: value is continuous in wacc, growth and the growth path", () => {
  const h = 1e-7;
  const v = value(base);
  const dWacc = Math.abs(value({ ...base, wacc: base.wacc + h }) - v);
  const dGrowth = Math.abs(
    value({ ...base, terminal: { kind: "perpetuityGrowth", growth: 0.025 + h } }) - v,
  );
  const bumped = flat(2, { ...unit, revenueGrowth: h });
  const dPath = Math.abs(value({ ...base, years: bumped }) - v);
  for (const d of [dWacc, dGrowth, dPath]) assert.ok(d < 1e-3 * Math.abs(v), `delta ${d}`);
});

test("a non-positive discount rate is undefined, whatever the terminal", () => {
  const exit = { kind: "exitMultiple", multiple: 10, on: "evEbit" } as const;
  for (const wacc of [0, -0.01, -1]) {
    assert.deepEqual(computeDcf({ ...base, wacc, terminal: exit }), {
      kind: "undefined",
      reason: "discountRateNotPositive",
    });
  }
});

test("a Gordon spread lost in float rounding is undefined, not a 1e17 value", () => {
  // 0.05 - 0.02 rounds to 0.030000000000000002; 0.01 + 0.02 rounds to 0.03.
  const r = computeDcf({
    ...base,
    wacc: 0.05 - 0.02,
    terminal: { kind: "perpetuityGrowth", growth: 0.01 + 0.02 },
  });
  assert.deepEqual(r, { kind: "undefined", reason: "terminalGrowthNotBelowWacc" });
});
