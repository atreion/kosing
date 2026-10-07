/**
 * Market data, cost-of-capital inputs and the rest of the quantitative blocks,
 * transcribed from $defs. None of these defs sets `additionalProperties`, so
 * strictness is the same deliberate tightening as in financials.ts.
 */

import { z } from "zod";
import { UNIT_VALUES } from "../domain/types.ts";
import { Iso4217, IsoDateString, RangePair } from "./primitives.ts";

export const MarketData = z.strictObject({
  as_of: IsoDateString,
  share_price: z.number().positive(),
  currency: Iso4217,
  market_cap: z.number().min(0),
  /** Required but nullable: a researcher may be unable to establish it. */
  enterprise_value: z.number().nullable(),
  net_debt: z.number(),
  shares_outstanding_m: z.number().min(0),
  shares_diluted_m: z.number().min(0).nullable().optional(),
  "52w_high": z.number().min(0).nullable().optional(),
  "52w_low": z.number().min(0).nullable().optional(),
  source_ref: z.string(),
});

export const CapitalStructure = z.strictObject({
  equity_weight_market: z.number().min(0).max(1),
  debt_weight_market: z.number().min(0).max(1),
  basis_date: IsoDateString,
});

export const WaccRawInputs = z.strictObject({
  risk_free_rate: z.number(),
  risk_free_basis: z.string().min(1),
  erp: z.number().min(0),
  country_premium: z.number().optional(),
  beta_sector: z.number().nullable().optional(),
  beta_company: z.number().nullable().optional(),
  tax_rate_effective: z.number().min(0).max(1),
  tax_rate_statutory: z.number().min(0).max(1).nullable().optional(),
  pretax_cost_of_debt: z.number().min(0),
  capital_structure: CapitalStructure,
  source_refs: z.array(z.string()).min(1),
});

export const Multiples = z.strictObject({
  as_of: IsoDateString,
  pe_trailing: z.number().nullable().optional(),
  pe_forward: z.number().nullable().optional(),
  ev_ebit: z.number().nullable().optional(),
  ev_ebitda: z.number().nullable().optional(),
  ev_revenue: z.number().nullable().optional(),
  fcf_yield: z.number().nullable().optional(),
  dividend_yield: z.number().min(0).nullable().optional(),
  price_book: z.number().nullable().optional(),
  price_tangible_book: z.number().nullable().optional(),
  source_ref: z.string(),
});

/** The schema's `allOf` of rangePair with an object requiring a currency. */
export const SharePriceRange = RangePair.extend({ currency: Iso4217 });

export const RegimeNote = z.strictObject({
  period: z.string(),
  event: z.string(),
  notes: z.string().optional(),
});

export const HistoricalPriceRanges = z.strictObject({
  share_price: SharePriceRange,
  pe_trailing: RangePair.optional(),
  ev_ebit: RangePair.optional(),
  ev_ebitda: RangePair.optional(),
  price_book: RangePair.optional(),
  regime_notes: z.array(RegimeNote).optional(),
  source_refs: z.array(z.string()).min(1),
});

export const BalanceSheetItems = z.strictObject({
  as_of_date: IsoDateString,
  currency: Iso4217,
  unit: z.enum(UNIT_VALUES),
  cash_and_equivalents: z.number(),
  short_term_investments: z.number().nullable().optional(),
  total_debt: z.number().min(0),
  short_term_debt: z.number().min(0).nullable().optional(),
  long_term_debt: z.number().min(0).nullable().optional(),
  operating_lease_liabilities: z.number().min(0).nullable().optional(),
  pension_obligations: z.number().nullable().optional(),
  goodwill: z.number().nullable().optional(),
  intangibles_ex_goodwill: z.number().nullable().optional(),
  contingent_liabilities_notes: z.string().optional(),
  source_ref: z.string(),
});

const CurrencyPair = z.string().regex(/^[A-Z]{6}$/, "must be six uppercase letters, as in EURSEK");

export const OperationalCurrency = z.strictObject({
  currency: Iso4217,
  revenue_share_pct: z.number().min(0).max(100).nullable().optional(),
  cost_share_pct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().optional(),
});

export const SpotRate = z.strictObject({
  pair: CurrencyPair,
  rate: z.number().positive(),
  as_of: IsoDateString,
  source_ref: z.string(),
});

/**
 * The wire keeps `applies` as a plain boolean alongside independently optional
 * pairs and rates. Task 10 turns that into a union, which is what makes
 * check_fx_layer_completeness stop being a check.
 */
export const FxLayer = z.strictObject({
  applies: z.boolean(),
  reporting_currency: Iso4217,
  trading_currency: Iso4217,
  operational_currencies: z.array(OperationalCurrency).optional(),
  sek_relevant_pairs: z.array(CurrencyPair).optional(),
  spot_rates: z.array(SpotRate).optional(),
});

export type MarketData = z.infer<typeof MarketData>;
export type CapitalStructure = z.infer<typeof CapitalStructure>;
export type WaccRawInputs = z.infer<typeof WaccRawInputs>;
export type Multiples = z.infer<typeof Multiples>;
export type HistoricalPriceRanges = z.infer<typeof HistoricalPriceRanges>;
export type BalanceSheetItems = z.infer<typeof BalanceSheetItems>;
export type SpotRate = z.infer<typeof SpotRate>;
export type FxLayer = z.infer<typeof FxLayer>;
