import assert from "node:assert/strict";
import { test } from "node:test";
import { BalanceSheet, CostOfCapital, Financials, FiscalYearRow, Market } from "./facts.ts";

export const market = {
  price: 212,
  priceCurrency: "SEK",
  asOf: "2026-10-01",
  sharesOutstandingM: 113.2,
  sharesDilutedM: 115,
  week52High: 260,
  week52Low: 150,
  sourceRefs: ["S2"],
};

test("market parses and a zero price is rejected", () => {
  assert.equal(Market.safeParse(market).success, true);
  assert.equal(Market.safeParse({ ...market, price: 0 }).success, false);
});

test("market rejects an absent key even when the value may be null", () => {
  const { sharesDilutedM: _s, ...absent } = market;
  assert.equal(Market.safeParse(absent).success, false);
  assert.equal(Market.safeParse({ ...market, sharesDilutedM: null }).success, true);
});

export function fiscalYear(fy: number, over: Record<string, unknown> = {}) {
  return {
    fy,
    endDate: `${fy}-12-31`,
    revenue: 1000,
    ebit: 120,
    netIncome: 90,
    ebitda: 150,
    depreciationAmortization: 30,
    cogs: null,
    grossProfit: null,
    opex: null,
    interestExpense: null,
    taxExpense: null,
    ocf: 140,
    capex: -40,
    fcf: 100,
    dividendsPaid: null,
    sharesBasicM: 113,
    sharesDilutedM: 115,
    sourceRef: "S1",
    ...over,
  };
}

test("a fiscal-year row parses with nulls and rejects a non-integer or out-of-range fy", () => {
  assert.equal(FiscalYearRow.safeParse(fiscalYear(2025)).success, true);
  assert.equal(FiscalYearRow.safeParse(fiscalYear(2025.5)).success, false);
  assert.equal(FiscalYearRow.safeParse(fiscalYear(1899)).success, false);
});

test("an ltm row is a fiscal-year row without fy", () => {
  const { fy: _fy, ...ltm } = fiscalYear(2026, { endDate: "2026-06-30" });
  const financials = { fiscalYears: [fiscalYear(2025)], ltm, quarters: null };
  assert.equal(Financials.safeParse(financials).success, true);
  assert.equal(Financials.safeParse({ ...financials, ltm: { ...ltm, fy: 2026 } }).success, false);
});

test("financials require at least one fiscal year", () => {
  assert.equal(Financials.safeParse({ fiscalYears: [], ltm: null, quarters: null }).success, false);
});

test("a quarter's fq is YYYYQn", () => {
  const quarter = {
    fq: "2026Q2",
    endDate: "2026-06-30",
    revenue: 260,
    ebit: 30,
    netIncome: 22,
    ocf: null,
    capex: null,
    fcf: null,
    sourceRef: "S1",
  };
  const financials = { fiscalYears: [fiscalYear(2025)], ltm: null, quarters: [quarter] };
  assert.equal(Financials.safeParse(financials).success, true);
  assert.equal(
    Financials.safeParse({ ...financials, quarters: [{ ...quarter, fq: "2026-Q2" }] }).success,
    false,
  );
});

export const balanceSheet = {
  asOf: "2026-06-30",
  cashAndEquivalents: 4200,
  shortTermInvestments: null,
  totalDebt: 9100,
  shortTermDebt: 1100,
  longTermDebt: 8000,
  operatingLeaseLiabilities: 600,
  pensionObligations: 300,
  goodwill: 2500,
  intangiblesExGoodwill: null,
  sourceRef: "S1",
};

test("balance sheet rejects negative debt", () => {
  assert.equal(BalanceSheet.safeParse(balanceSheet).success, true);
  assert.equal(BalanceSheet.safeParse({ ...balanceSheet, totalDebt: -1 }).success, false);
});

export const costOfCapital = {
  riskFreeRate: 0.025,
  riskFreeBasis: "Swedish 10-year government bond",
  erp: 0.055,
  countryPremium: null,
  betaCompany: null,
  betaSector: 1.1,
  taxRateEffective: 0.21,
  taxRateStatutory: 0.206,
  pretaxCostOfDebt: 0.04,
  equityWeight: 0.9,
  debtWeight: 0.1,
  weightsAsOf: "2026-10-01",
  sourceRefs: ["S3"],
};

test("cost of capital bounds its rates and weights", () => {
  assert.equal(CostOfCapital.safeParse(costOfCapital).success, true);
  assert.equal(CostOfCapital.safeParse({ ...costOfCapital, taxRateEffective: 1.2 }).success, false);
  assert.equal(CostOfCapital.safeParse({ ...costOfCapital, equityWeight: -0.1 }).success, false);
  assert.equal(CostOfCapital.safeParse({ ...costOfCapital, sourceRefs: [] }).success, false);
});
