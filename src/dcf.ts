import type {
  NonNegativeInteger,
  NonNegativeNumber,
  PositiveInteger,
  PositiveNumber,
  UnitInterval,
} from "./validate.ts";

export type DcfInputs = {
  readonly revenueBase: NonNegativeNumber;
  readonly taxRate: UnitInterval;
  readonly wacc: PositiveNumber;
  readonly netDebt: number;
  readonly dilutedSharesOutstandingMillions: PositiveNumber;
  readonly nonOperatingAssets: number;
  readonly currency: string;
  readonly unit: string;
};

export type ExitMultipleBasis = "evEbit" | "evEbitda" | "evFcff";

export type TerminalValueMethod =
  | { readonly method: "perpetuityGrowth"; readonly growthRate: number }
  | {
      readonly method: "exitMultiple";
      readonly multiple: PositiveNumber;
      readonly basis: ExitMultipleBasis;
    };

export type DcfAssumptions = {
  readonly explicitPeriodYears: PositiveInteger;
  readonly fadePeriodYears: NonNegativeInteger;
  readonly revenueGrowthPath: readonly number[];
  readonly ebitMarginPath: readonly number[];
  readonly capexPercentOfRevenuePath: readonly number[];
  readonly daPercentOfRevenuePath: readonly number[];
  readonly workingCapitalPercentOfRevenue: number;
  readonly terminalValueMethod: TerminalValueMethod;
};

export type YearlyCashFlow = {
  readonly year: number;
  readonly revenue: number;
  readonly ebit: number;
  readonly ebitda: number;
  readonly nopat: number;
  readonly da: number;
  readonly capex: number;
  readonly changeInWorkingCapital: number;
  readonly fcff: number;
  readonly discountFactor: number;
  readonly pvFcff: number;
};

export type DcfNote = { readonly kind: "terminalValueDominates"; readonly percentOfEv: number };

export type DcfResult = {
  readonly valuePerShare: number;
  readonly enterpriseValue: number;
  readonly equityValue: number;
  readonly terminalValue: number;
  readonly terminalValuePercentOfEv: number;
  readonly pvExplicitPeriod: number;
  readonly yearlyCashFlows: readonly YearlyCashFlow[];
  readonly inputsUsed: DcfInputs;
  readonly assumptionsUsed: DcfAssumptions;
  readonly notes: readonly DcfNote[];
};
