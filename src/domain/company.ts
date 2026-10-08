import type { Financials } from "./financials.ts";
import type { Basis, Currency, IsoDate } from "./types.ts";

export type Identity = {
  readonly ticker: string;
  readonly exchange: string;
  readonly name: string;
  readonly isin: string | null;
  readonly country: string;
};

/** Price in reporting currency; shares resolved; per-share figures unscaled. */
export type Market = {
  readonly price: number;
  readonly shares: number;
  readonly week52High: number | null;
  readonly week52Low: number | null;
  readonly asOf: IsoDate;
};

export type BalanceSheet = {
  readonly asOf: IsoDate;
  readonly cashAndEquivalents: number;
  readonly shortTermInvestments: number | null;
  readonly totalDebt: number;
  readonly shortTermDebt: number | null;
  readonly longTermDebt: number | null;
  readonly goodwill: number | null;
  readonly intangiblesExGoodwill: number | null;
};

/** Claims on the enterprise reported beside net debt, not folded into it. */
export type OtherClaims = {
  readonly operatingLeaseLiabilities: number | null;
  readonly pensionObligations: number | null;
};

/** From facts alone: beta resolved, both tax rates, no overrides. */
export type CostOfCapital = {
  readonly riskFree: number;
  readonly erp: number;
  readonly beta: number;
  readonly countryPremium: number;
  readonly preTaxCostOfDebt: number;
  readonly equityWeight: number;
  readonly debtWeight: number;
  /** statutory if reported, else effective. Discounts future cash flows. */
  readonly taxRateForDiscounting: number;
  /** effective, always reported. Taxes the modelled cash flows. */
  readonly taxRateForCashFlows: number;
};

export type RangeBand = {
  readonly y5Low: number | null;
  readonly y5High: number | null;
  readonly y10Low: number | null;
  readonly y10High: number | null;
};

export type HistoricalRanges = {
  readonly sharePrice: RangeBand;
  readonly peTrailing: RangeBand;
  readonly evEbit: RangeBand;
  readonly evEbitda: RangeBand;
  readonly priceBook: RangeBand;
};

export type Peer = {
  readonly name: string;
  readonly ticker: string | null;
  readonly peTrailing: number | null;
  readonly evEbit: number | null;
  readonly evEbitda: number | null;
  readonly evRevenue: number | null;
};

export type Estimate = {
  readonly fy: number;
  readonly revenue: number | null;
  readonly ebit: number | null;
  readonly eps: number | null;
};

/** As reported: fairValue nullable here, required on the nav branch. */
export type ReportedHolding = {
  readonly name: string;
  readonly fairValue: number | null;
  readonly basis: Basis;
};

export type Holdings = {
  readonly items: readonly ReportedHolding[];
  readonly parentNetDebt: number;
  readonly lookThroughNav: number | null;
};

export type SpotRate = {
  readonly pair: string;
  readonly rate: number;
  readonly asOf: IsoDate;
};

export type Exposure = {
  readonly currency: Currency;
  readonly revenueShare: number | null;
  readonly costShare: number | null;
};

export type Fx = {
  readonly spotRates: readonly SpotRate[];
  readonly exposures: readonly Exposure[];
};

/** Everything inside is reporting currency, millions, by construction. */
export type Company = {
  readonly identity: Identity;
  readonly currency: Currency;
  readonly asOf: IsoDate;
  readonly market: Market;
  readonly financials: Financials;
  readonly balanceSheet: BalanceSheet;
  /** totalDebt - cashAndEquivalents - shortTermInvestments, recorded as a resolution. */
  readonly netDebt: number;
  readonly otherClaims: OtherClaims;
  readonly costOfCapital: CostOfCapital;
  readonly historicalRanges: HistoricalRanges | null;
  readonly peers: readonly Peer[];
  readonly estimates: readonly Estimate[];
  readonly holdings: Holdings | null;
  readonly fx: Fx | null;
};
