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

type YearAssumptions = {
  readonly revenueGrowth: number;
  readonly ebitMargin: number;
  readonly capexPercentOfRevenue: number;
  readonly daPercentOfRevenue: number;
};

export type DcfAssumptions = {
  readonly explicitPeriodYears: PositiveInteger;
  readonly fadePeriodYears: NonNegativeInteger;
  readonly yearlyAssumptions: readonly YearAssumptions[];
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

export function projectYear(
  previousRevenue: number,
  year: number,
  yearAssumptions: YearAssumptions,
  rates: { readonly taxRate: number; readonly wacc: number },
  workingCapitalPercentOfRevenue: number,
): YearlyCashFlow {
  const { revenueGrowth, ebitMargin, daPercentOfRevenue, capexPercentOfRevenue } = yearAssumptions;
  const { wacc, taxRate } = rates;
  const revenue = previousRevenue * (1 + revenueGrowth);
  const ebit = revenue * ebitMargin;
  const nopat = ebit * (1 - taxRate);
  const da = revenue * daPercentOfRevenue;
  const ebitda = ebit + da;
  const capex = revenue * capexPercentOfRevenue;
  const changeInWorkingCapital = workingCapitalPercentOfRevenue * (revenue - previousRevenue);
  const fcff = nopat + da - capex - changeInWorkingCapital;
  const discountFactor = 1 / (1 + wacc) ** year;
  const pvFcff = fcff * discountFactor;

  return {
    year,
    revenue,
    ebit,
    nopat,
    da,
    ebitda,
    capex,
    changeInWorkingCapital,
    fcff,
    discountFactor,
    pvFcff,
  };
}

export function projectCashFlows(
  inputs: DcfInputs,
  assumptions: DcfAssumptions,
): readonly YearlyCashFlow[] {
  const yearlyCashFlows: YearlyCashFlow[] = [];
  let previousRevenue: number = inputs.revenueBase;
  for (const [i, year] of assumptions.yearlyAssumptions.entries()) {
    const row = projectYear(
      previousRevenue,
      i + 1,
      year,
      inputs,
      assumptions.workingCapitalPercentOfRevenue,
    );
    yearlyCashFlows.push(row);
    previousRevenue = row.revenue;
  }
  return yearlyCashFlows;
}
