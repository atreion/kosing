/**
 * facts.json: what is observable about a company, as the researcher wrote it.
 * Every key is present; unknown is null. Aggregate monetary figures are in the
 * document's `currency` and `unit`; per-share figures are in `currency` as
 * quoted and never scaled.
 */

import { z } from "zod";
import { BASIS_VALUES, UNIT_VALUES } from "../domain/types.ts";
import {
  Gap,
  Iso4217,
  IsoDateString,
  RangeBand,
  SourceEntry,
  SourceId,
  SourceRefs,
} from "./primitives.ts";

const nullableNumber = z.number().nullable();
const nullableNonNegative = z.number().min(0).nullable();

export const Market = z.strictObject({
  price: z
    .number()
    .positive()
    .describe(
      "Last price per share in priceCurrency, the currency the exchange quotes. Never scaled by unit.",
    ),
  priceCurrency: Iso4217,
  asOf: IsoDateString.describe(
    "Date of the price. A price-only refresh moves this date and leaves the document's asOf alone.",
  ),
  sharesOutstandingM: z
    .number()
    .min(0)
    .describe(
      "Millions of shares, whatever unit says: the latest reported count less any repurchases disclosed since (cite the notice).",
    ),
  sharesDilutedM: nullableNonNegative,
  week52High: nullableNonNegative,
  week52Low: nullableNonNegative,
  sourceRefs: SourceRefs,
});

const periodFigures = {
  revenue: nullableNumber,
  ebit: nullableNumber,
  netIncome: nullableNumber,
  ebitda: nullableNumber.describe(
    "Reported EBITDA, or EBIT plus depreciation and amortisation when the company reports none. Not the company's adjusted EBITDA.",
  ),
  depreciationAmortization: nullableNumber,
  cogs: nullableNumber.describe("Cost of revenue, negative as an expense."),
  grossProfit: nullableNumber,
  opex: nullableNumber.describe(
    "Operating expenses other than cost of revenue, negative as an expense.",
  ),
  netFinancialResult: nullableNumber.describe(
    "Net financial result as reported: negative when a net cost, positive when net income.",
  ),
  taxExpense: nullableNumber.describe(
    "Signed as the statements give it: negative when an outflow.",
  ),
  ocf: nullableNumber,
  capex: nullableNumber.describe("Signed as the statements give it: negative when an outflow."),
  fcf: nullableNumber.describe(
    "Free cash flow as the company defines and reports it; when it reports none, ocf plus capex.",
  ),
  dividendsPaid: nullableNumber.describe("Negative when an outflow."),
  sharesBasicM: nullableNonNegative,
  sharesDilutedM: nullableNonNegative,
  sourceRef: SourceId,
};

function withoutSourceRef<T extends { sourceRef: unknown }>(figures: T): Omit<T, "sourceRef"> {
  const { sourceRef: _s, ...rest } = figures;
  return rest;
}

export const FiscalYearRow = z.strictObject({
  fy: z.number().int().min(1900).max(2200),
  endDate: IsoDateString,
  ...periodFigures,
});

/** The trailing-twelve-month row: a fiscal-year row with no fiscal year. */
export const LtmRow = z.strictObject({
  endDate: IsoDateString,
  ...withoutSourceRef(periodFigures),
  /** Usually two documents: the last annual report and the latest interim. */
  sourceRefs: SourceRefs,
});

export const QuarterRow = z.strictObject({
  fq: z.string().regex(/^[12][0-9]{3}Q[1-4]$/, "must be a fiscal quarter such as 2026Q2"),
  endDate: IsoDateString,
  revenue: nullableNumber,
  ebit: nullableNumber,
  netIncome: nullableNumber,
  ocf: nullableNumber,
  capex: nullableNumber,
  fcf: nullableNumber,
  sourceRef: SourceId,
});

export const Financials = z.strictObject({
  fiscalYears: z.array(FiscalYearRow).min(1),
  ltm: LtmRow.nullable().describe(
    "Trailing twelve months to the latest reported quarter or half, citing every document it is built from. Null when the company reports neither.",
  ),
  quarters: z
    .array(QuarterRow)
    .nullable()
    .describe(
      "Reported quarters only. Null for a company that reports halves; ltm carries the latest half.",
    ),
});

export const BalanceSheet = z.strictObject({
  asOf: IsoDateString,
  cashAndEquivalents: z.number(),
  shortTermInvestments: nullableNumber,
  totalDebt: z
    .number()
    .min(0)
    .describe(
      "Interest-bearing debt at its balance-sheet carrying amount. Leases and pensions have their own fields and stay out.",
    ),
  shortTermDebt: nullableNonNegative,
  longTermDebt: nullableNonNegative,
  operatingLeaseLiabilities: nullableNonNegative.describe(
    "Lease liabilities. Not deducted as debt, so a dcf case carries lease payments in its capex path.",
  ),
  pensionObligations: nullableNumber.describe(
    "Net pension deficit. Not deducted as debt; a case says in its rationale when it is material.",
  ),
  goodwill: nullableNumber,
  intangiblesExGoodwill: nullableNumber,
  totalEquity: nullableNumber.describe("Book equity attributable to shareholders."),
  sourceRef: SourceId,
});

const unitInterval = z.number().min(0).max(1);

export const CostOfCapital = z.strictObject({
  riskFreeRate: z
    .number()
    .describe(
      "10-year government bond yield in the reporting currency, as a fraction; riskFreeBasis names the bond and date.",
    ),
  riskFreeBasis: z.string().min(1),
  erp: z
    .number()
    .min(0)
    .describe("Equity risk premium from Damodaran's current country table, as a fraction."),
  countryPremium: nullableNumber.describe(
    "Damodaran's country risk premium; 0 when the table shows 0.",
  ),
  betaCompany: nullableNumber.describe(
    "Five-year beta as published by a named data provider; never computed by the researcher. Null when none is published or it is implausible (for example, it prices the cost of equity below the company's own bond coupon); betaSector is then used.",
  ),
  betaSector: nullableNumber.describe(
    "Damodaran's levered sector beta from the table for the company's region (Europe for a European company).",
  ),
  taxRateEffective: unitInterval,
  taxRateStatutory: unitInterval
    .nullable()
    .describe(
      "The rate the company's own tax reconciliation uses when published, otherwise the headline corporate rate.",
    ),
  pretaxCostOfDebt: z
    .number()
    .min(0)
    .describe(
      "Yield on the company's traded bonds, or its reported average borrowing rate, as a fraction.",
    ),
  equityWeight: unitInterval.describe(
    "Market capitalisation over market capitalisation plus total debt, on weightsAsOf.",
  ),
  debtWeight: unitInterval,
  weightsAsOf: IsoDateString,
  sourceRefs: SourceRefs,
});

export const UNIT = z.enum(UNIT_VALUES);

export const HistoricalRanges = z.strictObject({
  sharePrice: RangeBand,
  peTrailing: RangeBand,
  evEbit: RangeBand,
  evEbitda: RangeBand,
  priceBook: RangeBand,
  sourceRefs: SourceRefs,
});

export const Peer = z.strictObject({
  name: z.string().min(1),
  ticker: z.string().nullable(),
  peTrailing: nullableNumber,
  evEbit: nullableNumber,
  evEbitda: nullableNumber,
  evRevenue: nullableNumber,
  sourceRef: SourceId,
});

export const ESTIMATE_BASES = ["reported", "adjusted"] as const;

/** Consensus often mixes sources and bases, so both are stated. */
export const Estimate = z.strictObject({
  fy: z.number().int(),
  revenue: nullableNumber,
  ebit: nullableNumber,
  eps: nullableNumber,
  basis: z
    .enum(ESTIMATE_BASES)
    .nullable()
    .describe(
      "reported when consensus is on the IFRS or GAAP basis, adjusted when on the company's non-GAAP basis.",
    ),
  sourceRefs: SourceRefs,
});

export const HoldingItem = z.strictObject({
  name: z.string().min(1),
  fairValue: nullableNumber,
  basis: z.enum(BASIS_VALUES),
  sourceRef: SourceId,
});

export const Holdings = z.strictObject({
  items: z.array(HoldingItem),
  parentNetDebt: z.number(),
  lookThroughNav: nullableNumber,
  sourceRefs: SourceRefs,
});

const CurrencyPair = z.string().regex(/^[A-Z]{6}$/, "must be six uppercase letters, as in EURSEK");

export const SpotRate = z.strictObject({
  pair: CurrencyPair,
  rate: z.number().positive(),
  asOf: IsoDateString,
  sourceRef: SourceId,
});

export const Exposure = z.strictObject({
  currency: Iso4217,
  revenueShare: unitInterval.nullable(),
  costShare: unitInterval.nullable(),
});

export const Fx = z.strictObject({
  spotRates: z.array(SpotRate),
  exposures: z
    .array(Exposure)
    .describe(
      "Each currency with a material share of revenue or costs, as reported. Unknown shares are null, and such an exposure is not revalued.",
    ),
});

/** Named CompanyBlock so the domain's Company is the only Company. */
export const CompanyBlock = z.strictObject({
  ticker: z.string().min(1),
  exchange: z.string().min(1),
  name: z.string().min(1),
  isin: z.string().nullable(),
  country: z.string().regex(/^[A-Z]{2}$/, "must be a two-letter country code"),
});

export const FactsShape = z.strictObject({
  schemaVersion: z.literal("1.0"),
  company: CompanyBlock,
  asOf: IsoDateString.describe(
    "Period end of the latest financial report the facts reflect, not its publication date. Moves on a quarterly or annual refresh, not on a price refresh.",
  ),
  currency: Iso4217.describe("The reporting currency."),
  unit: UNIT.describe(
    "Applies to every aggregate figure. Per-share figures and share counts are never scaled. Percentages are fractions.",
  ),
  market: Market,
  financials: Financials,
  balanceSheet: BalanceSheet,
  costOfCapital: CostOfCapital,
  historicalRanges: HistoricalRanges.nullable(),
  peers: z.array(Peer).nullable(),
  estimates: z.array(Estimate).nullable(),
  holdings: Holdings.nullable(),
  fx: Fx.nullable(),
  sources: z.array(SourceEntry).min(1),
  gaps: z
    .array(Gap)
    .describe(
      "Every field left null, with its path and the reason: no source found, or a sourced value rejected.",
    ),
});

export type FactsShape = z.infer<typeof FactsShape>;

/**
 * Every place a source id appears, with its path, so the refinement can point
 * at the exact reference that does not resolve.
 */
export function collectSourceRefs(facts: FactsShape): readonly { path: string; id: string }[] {
  const refs: { path: string; id: string }[] = [];
  function one(path: string, id: string): void {
    refs.push({ path, id });
  }
  function many(path: string, ids: readonly string[]): void {
    for (const [i, id] of ids.entries()) one(`${path}.${i}`, id);
  }
  function each(path: string, rows: readonly { sourceRef: string }[]): void {
    for (const [i, row] of rows.entries()) one(`${path}.${i}.sourceRef`, row.sourceRef);
  }

  many("market.sourceRefs", facts.market.sourceRefs);
  each("financials.fiscalYears", facts.financials.fiscalYears);
  if (facts.financials.ltm) many("financials.ltm.sourceRefs", facts.financials.ltm.sourceRefs);
  each("financials.quarters", facts.financials.quarters ?? []);
  one("balanceSheet.sourceRef", facts.balanceSheet.sourceRef);
  many("costOfCapital.sourceRefs", facts.costOfCapital.sourceRefs);
  if (facts.historicalRanges) {
    many("historicalRanges.sourceRefs", facts.historicalRanges.sourceRefs);
  }
  each("peers", facts.peers ?? []);
  for (const [i, e] of (facts.estimates ?? []).entries()) {
    many(`estimates.${i}.sourceRefs`, e.sourceRefs);
  }
  if (facts.holdings) {
    each("holdings.items", facts.holdings.items);
    many("holdings.sourceRefs", facts.holdings.sourceRefs);
  }
  each("fx.spotRates", facts.fx?.spotRates ?? []);
  return refs;
}

function toPath(dotted: string): (string | number)[] {
  return dotted.split(".").map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}

/**
 * The four value rules the shape cannot carry. Each issue names the path in
 * the file the researcher edits; schema.test.ts lists them as unrepresentable
 * in the emitted JSON Schema.
 */
export const FactsSchema = FactsShape.describe(
  "What is observable about one listed company. Every key is present; unknown is null with a gaps entry. Every figure cites a source id. No computed metrics, valuations or opinions. Rules decode enforces beyond this schema: source ids are unique and every reference resolves; fiscal years are distinct; equityWeight + debtWeight is 1; a priceCurrency different from currency needs that spot rate in fx.",
).superRefine((facts, ctx) => {
  const ids = new Set<string>();
  for (const [i, source] of facts.sources.entries()) {
    if (ids.has(source.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["sources", i, "id"],
        message: `source id ${source.id} appears more than once`,
      });
    }
    ids.add(source.id);
  }
  for (const { path, id } of collectSourceRefs(facts)) {
    if (!ids.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: toPath(path),
        message: `source ${id} is not in sources`,
      });
    }
  }

  const seen = new Set<number>();
  facts.financials.fiscalYears.forEach((row, i) => {
    if (seen.has(row.fy)) {
      ctx.addIssue({
        code: "custom",
        path: ["financials", "fiscalYears", i, "fy"],
        message: `fiscal year ${row.fy} appears more than once`,
      });
    }
    seen.add(row.fy);
  });

  const { equityWeight, debtWeight } = facts.costOfCapital;
  if (Math.abs(equityWeight + debtWeight - 1) > 1e-6) {
    ctx.addIssue({
      code: "custom",
      path: ["costOfCapital", "debtWeight"],
      message: `equityWeight + debtWeight must be 1, got ${equityWeight + debtWeight}`,
    });
  }

  const { priceCurrency } = facts.market;
  if (priceCurrency !== facts.currency) {
    const direct = `${priceCurrency}${facts.currency}`;
    const inverse = `${facts.currency}${priceCurrency}`;
    const hasPair = facts.fx?.spotRates.some((s) => s.pair === direct || s.pair === inverse);
    if (!hasPair) {
      ctx.addIssue({
        code: "custom",
        path: ["fx"],
        message: `price is in ${priceCurrency} but no spot rate for ${direct} or ${inverse} is given`,
      });
    }
  }
});

export type Facts = z.infer<typeof FactsSchema>;
