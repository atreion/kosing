import assert from "node:assert/strict";
import { test } from "node:test";
import { CaseSchema } from "./case.ts";

const ten = Array.from({ length: 10 }, () => 0.05);

export function dcfCase(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    ticker: "ACME",
    factsAsOf: "2026-10-01",
    classification: "garp",
    theses: ["ai-disruption-overreaction"],
    method: {
      kind: "dcf",
      revenueGrowthPath: ten,
      ebitMarginPath: Array.from({ length: 10 }, () => 0.12),
      capexPctRevenuePath: Array.from({ length: 10 }, () => 0.04),
      daPctRevenuePath: Array.from({ length: 10 }, () => 0.03),
      workingCapitalPctRevenue: 0.1,
      terminal: { kind: "perpetuityGrowth", growth: 0.02, basis: "long-run nominal GDP" },
      rationale: "steady compounder",
      sourceRefs: ["S1"],
    },
    overrides: { beta: null, wacc: null, rationale: null },
    sensitivity: null,
    ...over,
  };
}

export function normalisedCase(over: Record<string, unknown> = {}) {
  return dcfCase({
    classification: "valueCyclical",
    method: {
      kind: "normalisedEarnings",
      revenueBase: { kind: "ltm" },
      ebitMargin: { bear: 0.05, base: 0.08, bull: 0.11 },
      evEbitMultiple: { bear: 6, base: 8, bull: 10 },
      multipleCeiling: 12,
      rationale: "mid-cycle",
      sourceRefs: ["S1"],
    },
    ...over,
  });
}

export function navCase(over: Record<string, unknown> = {}) {
  return dcfCase({
    classification: "holdingCompany",
    method: {
      kind: "nav",
      warrantedDiscount: 0.25,
      rationale: "listed holdings",
      sourceRefs: ["S1"],
    },
    ...over,
  });
}

test("each method parses", () => {
  for (const c of [dcfCase(), normalisedCase(), navCase()]) {
    const result = CaseSchema.safeParse(c);
    assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
  }
});

test("a method with another method's assumptions is rejected", () => {
  const bad = dcfCase({ method: { ...dcfCase().method, warrantedDiscount: 0.25 } });
  assert.equal(CaseSchema.safeParse(bad).success, false);
});

test("an exit-multiple terminal is closed over three metrics", () => {
  const terminal = { kind: "exitMultiple", multiple: 12, on: "evEbit", basis: "peer median" };
  assert.equal(
    CaseSchema.safeParse(dcfCase({ method: { ...dcfCase().method, terminal } })).success,
    true,
  );
  assert.equal(
    CaseSchema.safeParse(
      dcfCase({ method: { ...dcfCase().method, terminal: { ...terminal, on: "evSales" } } }),
    ).success,
    false,
  );
});

test("averageFy needs a positive integer window; ltm needs nothing", () => {
  const avg = normalisedCase({
    method: { ...normalisedCase().method, revenueBase: { kind: "averageFy", years: 3 } },
  });
  assert.equal(CaseSchema.safeParse(avg).success, true);
  const zero = normalisedCase({
    method: { ...normalisedCase().method, revenueBase: { kind: "averageFy", years: 0 } },
  });
  assert.equal(CaseSchema.safeParse(zero).success, false);
});

test("scenario triples must be ordered and under the ceiling, with the path of the offender", () => {
  const unordered = normalisedCase({
    method: { ...normalisedCase().method, ebitMargin: { bear: 0.1, base: 0.08, bull: 0.11 } },
  });
  const r1 = CaseSchema.safeParse(unordered);
  assert.equal(r1.success, false);
  assert.ok(r1.error?.issues.some((i) => i.path.join(".") === "method.ebitMargin"));

  const overCeiling = normalisedCase({
    method: { ...normalisedCase().method, evEbitMultiple: { bear: 6, base: 8, bull: 14 } },
  });
  const r2 = CaseSchema.safeParse(overCeiling);
  assert.equal(r2.success, false);
  assert.ok(r2.error?.issues.some((i) => i.path.join(".") === "method.evEbitMultiple.bull"));
});

test("a warranted discount above 0.9 is rejected", () => {
  const bad = navCase({ method: { ...navCase().method, warrantedDiscount: 0.95 } });
  assert.equal(CaseSchema.safeParse(bad).success, false);
});

test("an override needs a rationale", () => {
  const silent = dcfCase({ overrides: { beta: 1.3, wacc: null, rationale: null } });
  const r = CaseSchema.safeParse(silent);
  assert.equal(r.success, false);
  assert.ok(r.error?.issues.some((i) => i.path.join(".") === "overrides.rationale"));
  const spoken = dcfCase({
    overrides: { beta: 1.3, wacc: null, rationale: "sector beta is stale" },
  });
  assert.equal(CaseSchema.safeParse(spoken).success, true);
});

test("sensitivity steps must include zero", () => {
  const noZero = dcfCase({ sensitivity: { waccSteps: [-0.01, 0.01], terminalGrowthSteps: [0] } });
  const r = CaseSchema.safeParse(noZero);
  assert.equal(r.success, false);
  assert.ok(r.error?.issues.some((i) => i.path.join(".") === "sensitivity.waccSteps"));
});

test("theses may be empty and classification is closed", () => {
  assert.equal(CaseSchema.safeParse(dcfCase({ theses: [] })).success, true);
  assert.equal(CaseSchema.safeParse(dcfCase({ classification: "unicorn" })).success, false);
});

test("overrides and sensitivity belong to dcf only", () => {
  const override = normalisedCase({ overrides: { beta: 1.3, wacc: null, rationale: "x" } });
  const r1 = CaseSchema.safeParse(override);
  assert.equal(r1.success, false);
  assert.ok(r1.error?.issues.some((i) => i.path.join(".") === "overrides"));

  const grid = navCase({ sensitivity: { waccSteps: [0], terminalGrowthSteps: [0] } });
  const r2 = CaseSchema.safeParse(grid);
  assert.equal(r2.success, false);
  assert.ok(r2.error?.issues.some((i) => i.path.join(".") === "sensitivity"));
});

test("a wacc override is a discount rate strictly between 0 and 1", () => {
  for (const wacc of [-1, -0.5, 0, 1, 1.5]) {
    const r = CaseSchema.safeParse(dcfCase({ overrides: { beta: null, wacc, rationale: "why" } }));
    assert.equal(r.success, false, `wacc ${wacc}`);
  }
  const ok = CaseSchema.safeParse(
    dcfCase({ overrides: { beta: null, wacc: 0.07, rationale: "why" } }),
  );
  assert.equal(ok.success, true);
});
