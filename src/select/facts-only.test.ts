import assert from "node:assert/strict";
import { test } from "node:test";
import type { Company } from "../domain/company.ts";
import { decode } from "../input/decode.ts";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { selectLatestReportedPeriod, selectUsableReportedPeriod } from "./base-period.ts";
import { selectDerived } from "./derived.ts";
import { selectBands, selectMultipleInputs, selectPeerValues } from "./multiples.ts";
import { DEFAULT_REVERSE_DCF_OPTIONS, selectReverseDcf } from "./reverse-dcf.ts";
import { selectWacc } from "./wacc.ts";

function company(name: string, edit?: (doc: unknown) => unknown): Company {
  const doc = edit ? edit(loadFixture(name)) : loadFixture(name);
  const r = decode(doc);
  assert.ok(r.success, JSON.stringify(r.error));
  return r.data.company;
}

test("the base period is the ltm row when present, else the latest fiscal year", () => {
  const acme = selectLatestReportedPeriod(company("acme.facts").financials);
  assert.deepEqual(acme.ref, { kind: "ltm", fy: null, endDate: "2026-06-30" });
  assert.equal(acme.period.revenue, 11400);
  const holdco = selectLatestReportedPeriod(company("holdco.facts").financials);
  assert.deepEqual(holdco.ref, { kind: "fiscalYear", fy: 2025, endDate: "2025-12-31" });
});

test("a usable base period is searched newest first and may not exist", () => {
  const needsCapex = (p: { capex: number | null }) => p.capex !== null;
  const noLtmCapex = company("acme.facts", (d) => mutate(d, "financials.ltm.capex", null));
  const found = selectUsableReportedPeriod(noLtmCapex.financials, needsCapex);
  assert.deepEqual(found?.ref, { kind: "fiscalYear", fy: 2025, endDate: "2025-12-31" });
  assert.equal(selectUsableReportedPeriod(company("holdco.facts").financials, needsCapex), null);
});

test("wacc inputs take the discounting tax rate", () => {
  const c = company("acme.facts");
  const w = selectWacc(c.costOfCapital);
  assert.equal(w.taxRate, 0.206);
  assert.equal(w.beta, 1.1);
  assert.equal(w.countryPremium, 0);
});

test("derived figures: market cap is price x shares in millions, EV adds net debt", () => {
  const d = selectDerived(company("acme.facts"));
  assert.equal(d.marketCap, 212 * 115);
  assert.equal(d.netDebt, 2000);
  assert.equal(d.enterpriseValue, 212 * 115 + 2000);
  assert.deepEqual(d.otherClaims, { operatingLeaseLiabilities: 700, pensionObligations: 450 });
});

test("multiple inputs come from the base period and book value", () => {
  const c = company("acme.facts");
  const inputs = selectMultipleInputs(
    selectDerived(c),
    selectLatestReportedPeriod(c.financials).period,
    c.balanceSheet.totalEquity,
  );
  assert.deepEqual(inputs, {
    marketCap: 212 * 115,
    enterpriseValue: 212 * 115 + 2000,
    netIncome: 1020,
    ebit: 1380,
    ebitda: 1750,
    revenue: 11400,
    bookValue: 6200,
  });
});

test("bands come from historical ranges; evRevenue has none; peers have no priceBook", () => {
  const c = company("acme.facts");
  assert.deepEqual(selectBands(c, "peTrailing"), {
    band5y: { low: 14, high: 28 },
    band10y: { low: 11, high: 28 },
  });
  assert.deepEqual(selectBands(c, "evRevenue"), {
    band5y: { low: null, high: null },
    band10y: { low: null, high: null },
  });
  assert.deepEqual(selectPeerValues(c, "peTrailing"), [19, 22]);
  assert.deepEqual(selectPeerValues(c, "evEbitda"), [11]);
  assert.deepEqual(selectPeerValues(c, "priceBook"), []);
  const bare = company("holdco.facts");
  assert.deepEqual(selectBands(bare, "evEbit").band5y, { low: null, high: null });
  assert.deepEqual(selectPeerValues(bare, "evEbit"), []);
});

test("reverse dcf inputs hold the base period's ratios with capex and D&A as positive shares", () => {
  const c = company("acme.facts");
  const s = selectReverseDcf(c, 0.085, DEFAULT_REVERSE_DCF_OPTIONS);
  assert.equal(s.kind, "ready");
  if (s.kind !== "ready") return;
  assert.deepEqual(s.basePeriod, { kind: "ltm", fy: null, endDate: "2026-06-30" });
  assert.equal(s.inputs.targetValuePerShare, 212);
  assert.equal(s.inputs.revenueBase, 11400);
  assert.equal(s.inputs.ebitMargin, 1380 / 11400);
  assert.equal(s.inputs.capexPctRevenue, 450 / 11400);
  assert.equal(s.inputs.daPctRevenue, 370 / 11400);
  assert.equal(s.inputs.taxRate, 0.21, "cash flows are taxed at the effective rate");
  assert.equal(s.inputs.wacc, 0.085);
  assert.equal(s.inputs.netDebt, 2000);
  assert.equal(s.inputs.shares, 115);
  assert.equal(s.inputs.horizonYears, 10);
  assert.equal(s.inputs.terminalGrowth, 0.02);
});

test("a company with no row carrying revenue, ebit, capex and D&A has no reverse dcf", () => {
  const s = selectReverseDcf(company("holdco.facts"), 0.08, DEFAULT_REVERSE_DCF_OPTIONS);
  assert.deepEqual(s, { kind: "unavailable", reason: "noUsableBasePeriod" });
  const zeroRevenue = company("acme.facts", (d) =>
    mutate(mutate(d, "financials.ltm.revenue", 0), "financials.fiscalYears.4.revenue", 0),
  );
  const partial = selectReverseDcf(zeroRevenue, 0.08, DEFAULT_REVERSE_DCF_OPTIONS);
  assert.equal(partial.kind, "ready");
  if (partial.kind !== "ready") return;
  assert.deepEqual(partial.basePeriod, { kind: "fiscalYear", fy: 2024, endDate: "2024-12-31" });
});
