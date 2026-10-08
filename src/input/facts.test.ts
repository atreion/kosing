import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BalanceSheet,
  CostOfCapital,
  FactsSchema,
  Financials,
  FiscalYearRow,
  HistoricalRanges,
  Holdings,
  Market,
} from "./facts.ts";

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

const band = { y5Low: 120, y5High: 260, y10Low: 80, y10High: 260 };
const nullBand = { y5Low: null, y5High: null, y10Low: null, y10High: null };

test("historical ranges carry five bands and source refs", () => {
  const ranges = {
    sharePrice: band,
    peTrailing: band,
    evEbit: nullBand,
    evEbitda: nullBand,
    priceBook: nullBand,
    sourceRefs: ["S2"],
  };
  assert.equal(HistoricalRanges.safeParse(ranges).success, true);
  const { priceBook: _pb, ...missing } = ranges;
  assert.equal(HistoricalRanges.safeParse(missing).success, false);
});

test("holdings carry items with a nullable fair value and a closed basis", () => {
  const holdings = {
    items: [{ name: "Investor AB", fairValue: 1200, basis: "listed", sourceRef: "S1" }],
    parentNetDebt: -300,
    lookThroughNav: 1500,
    sourceRefs: ["S1"],
  };
  assert.equal(Holdings.safeParse(holdings).success, true);
  assert.equal(
    Holdings.safeParse({
      ...holdings,
      items: [{ name: "X", fairValue: null, basis: "guessed", sourceRef: "S1" }],
    }).success,
    false,
  );
});

export const sources = [
  {
    id: "S1",
    kind: "annualReport",
    issuer: "Acme Industrial AB",
    title: "Annual Report 2025",
    url: "https://acme.example/ar2025.pdf",
    published: "2026-02-12",
    retrieved: "2026-10-01",
    pages: null,
    tier: "primary",
  },
  {
    id: "S2",
    kind: "marketDataFeed",
    issuer: "Nasdaq Stockholm",
    title: "ACME quote",
    url: "https://quotes.example/ACME",
    published: null,
    retrieved: "2026-10-01",
    pages: null,
    tier: "secondary",
  },
  {
    id: "S3",
    kind: "macroReference",
    issuer: "Riksbanken",
    title: "Government bond yields",
    url: "https://riksbank.example/yields",
    published: null,
    retrieved: "2026-10-01",
    pages: null,
    tier: "primary",
  },
];

export function facts(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    company: {
      ticker: "ACME",
      exchange: "STO",
      name: "Acme Industrial AB",
      isin: "SE0000000001",
      country: "SE",
    },
    asOf: "2026-10-01",
    currency: "SEK",
    unit: "millions",
    market,
    financials: {
      fiscalYears: [fiscalYear(2024), fiscalYear(2025)],
      ltm: null,
      quarters: null,
    },
    balanceSheet,
    costOfCapital,
    historicalRanges: null,
    peers: null,
    estimates: null,
    holdings: null,
    fx: null,
    sources,
    gaps: [],
    ...over,
  };
}

test("a minimal facts document parses", () => {
  const result = FactsSchema.safeParse(facts());
  assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
});

test("an unresolvable source ref is rejected with its path", () => {
  const result = FactsSchema.safeParse(facts({ market: { ...market, sourceRefs: ["S9"] } }));
  assert.equal(result.success, false);
  const issue = result.error?.issues.find((i) => i.message.includes("S9"));
  assert.deepEqual(issue?.path, ["market", "sourceRefs", 0]);
});

test("a duplicate fiscal year is rejected at the second occurrence", () => {
  const result = FactsSchema.safeParse(
    facts({
      financials: {
        fiscalYears: [fiscalYear(2025), fiscalYear(2024), fiscalYear(2025)],
        ltm: null,
        quarters: null,
      },
    }),
  );
  assert.equal(result.success, false);
  const issue = result.error?.issues.find((i) => i.message.includes("2025"));
  assert.deepEqual(issue?.path, ["financials", "fiscalYears", 2, "fy"]);
});

test("capital-structure weights must sum to one", () => {
  const result = FactsSchema.safeParse(
    facts({ costOfCapital: { ...costOfCapital, equityWeight: 0.8, debtWeight: 0.1 } }),
  );
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some((i) => i.path.join(".") === "costOfCapital.debtWeight"));
});

test("a trading currency differing from reporting needs a spot rate for the pair", () => {
  const dual = facts({ market: { ...market, priceCurrency: "EUR" } });
  const result = FactsSchema.safeParse(dual);
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some((i) => i.path.join(".") === "fx"));

  const withRate = facts({
    market: { ...market, priceCurrency: "EUR" },
    fx: {
      spotRates: [{ pair: "SEKEUR", rate: 0.088, asOf: "2026-10-01", sourceRef: "S2" }],
      exposures: [],
    },
  });
  assert.equal(FactsSchema.safeParse(withRate).success, true, "either direction satisfies it");
});

test("the document is strict at every level", () => {
  assert.equal(FactsSchema.safeParse(facts({ extra: 1 })).success, false);
  assert.equal(FactsSchema.safeParse(facts({ market: { ...market, extra: 1 } })).success, false);
});
