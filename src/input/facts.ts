/**
 * facts.json: what is observable about a company, as the researcher wrote it.
 * Every key is present; unknown is null. Aggregate monetary figures are in the
 * document's `currency` and `unit`; per-share figures are in `currency` as
 * quoted and never scaled.
 */

import { z } from "zod";
import { UNIT_VALUES } from "../domain/types.ts";
import { Iso4217, IsoDateString, SourceId, SourceRefs } from "./primitives.ts";

const nullableNumber = z.number().nullable();
const nullableNonNegative = z.number().min(0).nullable();

export const Market = z.strictObject({
  price: z.number().positive(),
  priceCurrency: Iso4217,
  asOf: IsoDateString,
  sharesOutstandingM: z.number().min(0),
  sharesDilutedM: nullableNonNegative,
  week52High: nullableNonNegative,
  week52Low: nullableNonNegative,
  sourceRefs: SourceRefs,
});

const periodFigures = {
  revenue: nullableNumber,
  ebit: nullableNumber,
  netIncome: nullableNumber,
  ebitda: nullableNumber,
  depreciationAmortization: nullableNumber,
  cogs: nullableNumber,
  grossProfit: nullableNumber,
  opex: nullableNumber,
  interestExpense: nullableNumber,
  taxExpense: nullableNumber,
  ocf: nullableNumber,
  capex: nullableNumber,
  fcf: nullableNumber,
  dividendsPaid: nullableNumber,
  sharesBasicM: nullableNonNegative,
  sharesDilutedM: nullableNonNegative,
  sourceRef: SourceId,
};

export const FiscalYearRow = z.strictObject({
  fy: z.number().int().min(1900).max(2200),
  endDate: IsoDateString,
  ...periodFigures,
});

/** The trailing-twelve-month row: a fiscal-year row with no fiscal year. */
export const LtmRow = z.strictObject({
  endDate: IsoDateString,
  ...periodFigures,
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
  ltm: LtmRow.nullable(),
  quarters: z.array(QuarterRow).nullable(),
});

export const BalanceSheet = z.strictObject({
  asOf: IsoDateString,
  cashAndEquivalents: z.number(),
  shortTermInvestments: nullableNumber,
  totalDebt: z.number().min(0),
  shortTermDebt: nullableNonNegative,
  longTermDebt: nullableNonNegative,
  operatingLeaseLiabilities: nullableNonNegative,
  pensionObligations: nullableNumber,
  goodwill: nullableNumber,
  intangiblesExGoodwill: nullableNumber,
  sourceRef: SourceId,
});

const unitInterval = z.number().min(0).max(1);

export const CostOfCapital = z.strictObject({
  riskFreeRate: z.number(),
  riskFreeBasis: z.string().min(1),
  erp: z.number().min(0),
  countryPremium: nullableNumber,
  betaCompany: nullableNumber,
  betaSector: nullableNumber,
  taxRateEffective: unitInterval,
  taxRateStatutory: unitInterval.nullable(),
  pretaxCostOfDebt: z.number().min(0),
  equityWeight: unitInterval,
  debtWeight: unitInterval,
  weightsAsOf: IsoDateString,
  sourceRefs: SourceRefs,
});

export const UNIT = z.enum(UNIT_VALUES);
