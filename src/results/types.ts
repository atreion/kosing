/**
 * results.json. One shape regardless of what ran; a section that could not
 * run is null, and when it had inputs and still could not run, a resolution
 * says why. Nothing here is a formatted sentence.
 */

import type { Company } from "../domain/company.ts";
import type { AiExposure, Classification, Currency, IsoDate } from "../domain/types.ts";
import type { Holding, Terminal } from "../domain/valuation.ts";
import type { Resolution, Warning } from "../input/errors.ts";
import type { DcfNote, YearRow } from "../math/dcf.ts";
import type { FxPairResult } from "../math/fx.ts";
import type { Metric, Multiples, Position } from "../math/multiples.ts";
import type { NormalisedEarningsResult } from "../math/normalised-earnings.ts";
import type { SensitivityResult } from "../math/sensitivity.ts";
import type { WaccResult } from "../math/wacc.ts";
import type { BasePeriodRef } from "../select/base-period.ts";
import type { Derived } from "../select/derived.ts";
import type { Band } from "../select/multiples.ts";
import type { RevenueBaseSummary } from "../select/normalised-earnings.ts";
import { DEFAULT_REVERSE_DCF_OPTIONS, type ReverseDcfOptions } from "../select/reverse-dcf.ts";

export type ValuatorOptions = {
  readonly reverseDcf: ReverseDcfOptions;
  readonly fxMoves: readonly number[];
  /** The date of the run, passed in so the valuator stays pure; null skips the price-age check. */
  readonly valuedOn: IsoDate | null;
};

export const DEFAULT_VALUATOR_OPTIONS: ValuatorOptions = {
  reverseDcf: DEFAULT_REVERSE_DCF_OPTIONS,
  fxMoves: [-0.1, -0.05, 0.05, 0.1],
  valuedOn: null,
};

export type MultipleRow = {
  readonly metric: Metric;
  readonly current: number | null;
  readonly band5y: Band;
  readonly band10y: Band;
  readonly position: Position | null;
  readonly peerMedian: number | null;
};

export type ReverseDcfSection = {
  readonly impliedGrowth: number;
  readonly basePeriod: BasePeriodRef;
  readonly horizonYears: number;
  readonly terminalGrowth: number;
};

export type ScenarioValue = {
  readonly valuePerShare: number;
  readonly enterpriseValue: number;
  readonly equityValue: number;
  readonly terminalValuePctOfEv: number;
};

/** Value on the beta the researcher did not use, so a clearance that flips on it is visible. */
export type AlternativeBetaValue = {
  readonly beta: number;
  readonly costOfEquity: number;
  readonly wacc: number;
  /** null when the Gordon formula is undefined at that WACC. */
  readonly valuePerShare: number | null;
};

export type DcfSection = {
  readonly method: "dcf";
  readonly basePeriod: BasePeriodRef;
  readonly wacc: WaccResult & { readonly overridden: boolean };
  readonly valuePerShare: number;
  readonly enterpriseValue: number;
  readonly equityValue: number;
  readonly terminalValue: number;
  readonly pvTerminalValue: number;
  readonly terminalValuePctOfEv: number;
  readonly pvExplicitPeriod: number;
  readonly projection: readonly YearRow[];
  readonly terminal: Terminal;
  readonly notes: readonly DcfNote[];
  /** null when the case has no scenarios; a side is null when its DCF is undefined. */
  readonly scenarios: {
    readonly bear: ScenarioValue | null;
    readonly bull: ScenarioValue | null;
  } | null;
  /** null when there is no alternative beta or the WACC is overridden. */
  readonly alternativeBeta: AlternativeBetaValue | null;
};

export type NormalisedEarningsSection = {
  readonly method: "normalisedEarnings";
  readonly revenueBase: RevenueBaseSummary;
  readonly scenarios: NormalisedEarningsResult;
  readonly ltmEbitMargin: number | null;
};

export type NavSection = {
  readonly method: "nav";
  readonly grossAssetValue: number;
  readonly parentNetDebt: number;
  readonly nav: number;
  readonly discountApplied: number;
  readonly equityValue: number;
  readonly valuePerShare: number;
  readonly lookThroughNav: number | null;
  readonly holdings: readonly Holding[];
};

export type ValuationSection = DcfSection | NormalisedEarningsSection | NavSection;

/** The price the investor sees, when the exchange quotes outside the reporting currency. */
export type TradingCurrencyHurdle = {
  readonly currency: Currency;
  readonly entryPrice: number;
  readonly price: number;
};

/** The same test on the dcf's alternative beta. */
export type AlternativeBetaHurdle = {
  readonly baseValue: number;
  readonly entryPrice: number;
  readonly clears: boolean;
};

/** Values per share in the reporting currency unless `trading` says otherwise. */
export type HurdleSection = {
  readonly classificationDiscount: number;
  readonly aiExposureAddOn: number;
  readonly requiredDiscount: number;
  readonly baseValue: number;
  readonly entryPrice: number;
  readonly price: number;
  readonly clears: boolean;
  readonly trading: TradingCurrencyHurdle | null;
  readonly alternativeBeta: AlternativeBetaHurdle | null;
};

export type Results = {
  readonly schemaVersion: "1.0";
  readonly inputs: {
    readonly ticker: string;
    readonly valuedOn: IsoDate | null;
    readonly factsAsOf: IsoDate;
    readonly caseFactsAsOf: IsoDate | null;
    readonly classification: Classification | null;
    readonly aiExposure: AiExposure | null;
    readonly company: Company;
  };
  /** From facts alone; the wacc here is never overridden. */
  readonly derived: Derived & { readonly multiples: Multiples; readonly wacc: WaccResult };
  readonly pricedIn: {
    readonly reverseDcf: ReverseDcfSection | null;
    readonly multiples: readonly MultipleRow[];
  };
  readonly valuation: ValuationSection | null;
  /** null without a valuation, or for a classification with no required discount. */
  readonly hurdle: HurdleSection | null;
  readonly sensitivity: SensitivityResult | null;
  readonly fx: readonly FxPairResult[] | null;
  readonly resolutions: readonly Resolution[];
  readonly warnings: readonly Warning[];
};
