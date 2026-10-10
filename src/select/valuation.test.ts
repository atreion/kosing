import assert from "node:assert/strict";
import { test } from "node:test";
import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import { decode } from "../input/decode.ts";
import { computeDcf } from "../math/dcf.ts";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { assertClose } from "../test-utils.ts";
import { selectDcf, selectSensitivity } from "./dcf.ts";
import { selectFx } from "./fx.ts";
import { selectNav } from "./nav.ts";
import { selectNormalisedEarnings } from "./normalised-earnings.ts";

function pair(facts: unknown, c: unknown): { company: Company; valuation: Valuation } {
  const r = decode(facts, c);
  assert.ok(r.success, JSON.stringify(r.error));
  assert.notEqual(r.data.valuation, null);
  if (r.data.valuation === null) throw new Error("unreachable");
  return { company: r.data.company, valuation: r.data.valuation };
}

const acme = () => loadFixture("acme.facts");
const dcfCase = () => loadFixture("acme-dcf.case");

test("dcf inputs zip the four paths, take the cash-flow tax rate and the ltm base", () => {
  const { company, valuation } = pair(acme(), dcfCase());
  assert.equal(valuation.method, "dcf");
  if (valuation.method !== "dcf") return;
  const s = selectDcf(valuation, company);
  assert.equal(s.inputs.years.length, 10);
  assert.deepEqual(s.inputs.years[0], {
    revenueGrowth: 0.07,
    ebitMargin: 0.12,
    capexPctRevenue: 0.04,
    daPctRevenue: 0.033,
  });
  assert.equal(s.inputs.revenueBase, 11400);
  assert.equal(s.basePeriodEbit, 1380);
  assert.equal(s.inputs.taxRate, 0.21);
  assert.equal(s.inputs.netDebt, 2000);
  assert.equal(s.inputs.shares, 115);
  assert.equal(s.inputs.workingCapitalPctRevenue, 0.1);
  assert.deepEqual(s.inputs.terminal, { kind: "perpetuityGrowth", growth: 0.02 });
  assert.deepEqual(s.basePeriod, { kind: "ltm", fy: null, endDate: "2026-06-30" });
  assert.equal(s.wacc.overridden, false);
  assertClose(s.inputs.wacc, s.wacc.wacc, 1e-15);
  assertClose(s.wacc.costOfEquity, 0.025 + 1.1 * 0.055, 1e-12);
  assert.deepEqual(s.resolutions, []);
});

test("without an ltm row the latest fiscal year is the base and a resolution says so", () => {
  const { company, valuation } = pair(mutate(acme(), "financials.ltm", null), dcfCase());
  if (valuation.method !== "dcf") throw new Error("unreachable");
  const s = selectDcf(valuation, company);
  assert.deepEqual(s.basePeriod, { kind: "fiscalYear", fy: 2025, endDate: "2025-12-31" });
  assert.equal(s.inputs.revenueBase, 11000);
  assert.deepEqual(s.resolutions, [{ kind: "dcfBasePeriodFromFiscalYear", fy: 2025 }]);
});

test("a wacc override replaces the discount rate and is flagged; the components stay computed", () => {
  const overridden = mutate(
    mutate(dcfCase(), "overrides.wacc", 0.07),
    "overrides.rationale",
    "sector convention",
  );
  const { company, valuation } = pair(acme(), overridden);
  if (valuation.method !== "dcf") throw new Error("unreachable");
  const s = selectDcf(valuation, company);
  assert.equal(s.inputs.wacc, 0.07);
  assert.equal(s.wacc.wacc, 0.07);
  assert.equal(s.wacc.overridden, true);
  assertClose(s.wacc.costOfEquity, 0.025 + 1.1 * 0.055, 1e-12);
});

test("sensitivity inputs carry the case's axes around the selected dcf", () => {
  const { company, valuation } = pair(acme(), dcfCase());
  if (valuation.method !== "dcf") throw new Error("unreachable");
  const s = selectDcf(valuation, company);
  const sens = selectSensitivity(s.inputs, valuation.sensitivity);
  assert.equal(sens.base, s.inputs);
  assert.deepEqual(sens.waccSteps, [-0.01, -0.005, 0, 0.005, 0.01]);
});

test("normalised earnings average the window's revenue and report the ltm margin", () => {
  const { company, valuation } = pair(acme(), loadFixture("acme-normalised.case"));
  if (valuation.method !== "normalisedEarnings") throw new Error("unreachable");
  const s = selectNormalisedEarnings(valuation, company);
  assertClose(s.inputs.revenueBase, (9800 + 10400 + 11000) / 3, 1e-9);
  assert.deepEqual(s.revenueBase, {
    kind: "averageFy",
    value: s.inputs.revenueBase,
    window: [2023, 2024, 2025],
  });
  assertClose(s.ltmEbitMargin ?? 0, 1380 / 11400, 1e-12);
  assert.equal(s.inputs.netDebt, 2000);
  assert.equal(s.inputs.shares, 115);
  assert.deepEqual(s.inputs.ebitMargin, { bear: 0.09, base: 0.12, bull: 0.14 });
});

test("an ltm revenue base has no window and a company without ltm has no ltm margin", () => {
  const ltmPolicy = mutate(loadFixture("acme-normalised.case"), "method.revenueBase", {
    kind: "ltm",
  });
  const { company, valuation } = pair(acme(), ltmPolicy);
  if (valuation.method !== "normalisedEarnings") throw new Error("unreachable");
  const s = selectNormalisedEarnings(valuation, company);
  assert.deepEqual(s.revenueBase, { kind: "ltm", value: 11400, window: null });

  const noLtm = pair(mutate(acme(), "financials.ltm", null), loadFixture("acme-normalised.case"));
  if (noLtm.valuation.method !== "normalisedEarnings") throw new Error("unreachable");
  assert.equal(selectNormalisedEarnings(noLtm.valuation, noLtm.company).ltmEbitMargin, null);
});

test("nav inputs are the holdings, parent net debt, discount and shares", () => {
  const { company, valuation } = pair(loadFixture("holdco.facts"), loadFixture("holdco-nav.case"));
  if (valuation.method !== "nav") throw new Error("unreachable");
  assert.deepEqual(selectNav(valuation, company), {
    holdings: [
      { name: "Listed Industrial AB", fairValue: 18000 },
      { name: "Listed Bank AB", fairValue: 9500 },
      { name: "Private Software Group", fairValue: 4200 },
    ],
    parentNetDebt: 300,
    warrantedDiscount: 0.2,
    shares: 280,
  });
});

test("fx needs a dcf; with one, a move shifts base revenue and every year's margin", () => {
  const dualCase = mutate(dcfCase(), "ticker", "DUAL");
  const { company, valuation } = pair(loadFixture("dual.facts"), dualCase);
  if (valuation.method !== "dcf" || company.fx === null) throw new Error("unreachable");
  assert.deepEqual(selectFx(company.fx, company.currency, null), {
    kind: "unavailable",
    reason: "noDcfValuation",
  });

  const s = selectDcf(valuation, company);
  const fx = selectFx(company.fx, company.currency, {
    inputs: s.inputs,
    baseEbit: s.basePeriodEbit,
  });
  assert.equal(fx.kind, "ready");
  if (fx.kind !== "ready") return;
  assert.deepEqual(fx.exposures, [{ pair: "USDEUR", revenueShare: 0.4, costShare: 0 }]);

  const unmoved = fx.revalue({ revenueFactor: 1, costFactor: 1 });
  const plain = computeDcf(s.inputs);
  assert.equal(plain.kind, "value");
  if (plain.kind !== "value") return;
  assertClose(unmoved ?? Number.NaN, plain.valuePerShare, 1e-9);

  const up = fx.revalue({ revenueFactor: 1.04, costFactor: 1 });
  assert.ok(
    up !== null && up > plain.valuePerShare,
    "more revenue at the same costs is worth more",
  );
});

test("fx is unavailable when the dcf base period has no positive revenue", () => {
  const zero = mutate(
    mutate(loadFixture("dual.facts"), "financials.fiscalYears.0.revenue", 0),
    "financials.fiscalYears.0.ebit",
    0,
  );
  const { company, valuation } = pair(zero, mutate(dcfCase(), "ticker", "DUAL"));
  if (valuation.method !== "dcf" || company.fx === null) throw new Error("unreachable");
  const s = selectDcf(valuation, company);
  assert.equal(s.inputs.revenueBase, 0, "fiscalYears.0 is 2025 in file order");
  const fx = selectFx(company.fx, company.currency, {
    inputs: s.inputs,
    baseEbit: s.basePeriodEbit,
  });
  assert.deepEqual(fx, { kind: "unavailable", reason: "nonPositiveBaseRevenue" });
});

test("a null exposure share counts as zero either way round, and says so", () => {
  const dual = mutate(loadFixture("dual.facts"), "fx.exposures", [
    { currency: "USD", revenueShare: null, costShare: 0.6 },
    { currency: "GBP", revenueShare: 0.2, costShare: null },
    { currency: "EUR", revenueShare: null, costShare: null },
  ]);
  const { company, valuation } = pair(dual, mutate(dcfCase(), "ticker", "DUAL"));
  if (valuation.method !== "dcf" || company.fx === null) throw new Error("unreachable");
  const s = selectDcf(valuation, company);
  const fx = selectFx(company.fx, company.currency, {
    inputs: s.inputs,
    baseEbit: s.basePeriodEbit,
  });
  assert.equal(fx.kind, "ready");
  if (fx.kind !== "ready") return;
  assert.deepEqual(fx.exposures, [
    { pair: "USDEUR", revenueShare: 0, costShare: 0.6 },
    { pair: "GBPEUR", revenueShare: 0.2, costShare: 0 },
  ]);
  assert.deepEqual(fx.resolutions, [
    { kind: "fxShareAssumedZero", currency: "USD", field: "revenueShare" },
    { kind: "fxShareAssumedZero", currency: "GBP", field: "costShare" },
  ]);
});
