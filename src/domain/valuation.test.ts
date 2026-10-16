import assert from "node:assert/strict";
import { test } from "node:test";
import type { Valuation } from "./valuation.ts";

const period = {
  revenue: 1000,
  ebit: 120,
  netIncome: 90,
  ebitda: 150,
  depreciationAmortization: 30,
  dividendsPaid: null,
  ocf: 140,
  capex: -40,
  fcf: 100,
};

// A test-only shortcut past the IsoDate brand; a parser is the only production path to one.
const date = "2025-12-31" as never;

test("a nav valuation carries parts and nothing operating", () => {
  const nav: Valuation = {
    method: "nav",
    parts: [
      {
        name: "Investor AB",
        kind: "factsFairValue",
        holding: "Investor AB",
        value: { bear: 1200, base: 1200, bull: 1200 },
      },
    ],
    hasScenarios: false,
    parentNetDebt: -300,
    lookThroughNav: 1500,
    assumptions: { warrantedDiscount: 0.25 },
  };
  assert.equal(nav.method, "nav");
  // @ts-expect-error a nav valuation has no financials
  assert.equal(nav.financials, undefined);
});

test("a dcf valuation cannot carry cyclical assumptions", () => {
  const bad = {
    method: "dcf",
    // @ts-expect-error ebitMargin is a cyclical assumption
    assumptions: { ebitMargin: { bear: 1, base: 2, bull: 3 } },
  } satisfies Partial<Valuation>;
  assert.ok(bad);
});

test("a period in a valuation has non-null revenue and ebit", () => {
  const cyclical: Valuation = {
    method: "normalisedEarnings",
    financials: { ltm: null, fiscalYears: [{ ...period, fy: 2025, endDate: date }] },
    revenueBase: { kind: "averageFy", window: [{ ...period, fy: 2025, endDate: date }] },
    assumptions: {
      ebitMargin: { bear: 0.05, base: 0.08, bull: 0.11 },
      evEbitMultiple: { bear: 6, base: 8, bull: 10 },
      multipleCeiling: null,
    },
  };
  assert.equal(cyclical.financials.fiscalYears[0].revenue, 1000);
  const nullRevenue: Valuation = {
    ...cyclical,
    // @ts-expect-error revenue cannot be null on a valuation's period
    financials: { ltm: null, fiscalYears: [{ ...period, revenue: null, fy: 2025, endDate: date }] },
  };
  assert.ok(nullRevenue);
});

test("an averageFy window cannot be empty", () => {
  const base: Extract<Valuation, { method: "normalisedEarnings" }>["revenueBase"] = {
    kind: "averageFy",
    // @ts-expect-error NonEmpty requires at least one element
    window: [],
  };
  assert.ok(base);
});
