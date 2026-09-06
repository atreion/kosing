import { assertNever } from "./exhaustive.ts";
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
export type TerminalBasis = Pick<YearlyCashFlow, "ebit" | "ebitda" | "fcff">;

export type TerminalValueMethod =
  | { readonly kind: "perpetuityGrowth"; readonly growthRate: number }
  | {
      readonly kind: "exitMultiple";
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

function terminalBasisValue(finalYear: TerminalBasis, basis: ExitMultipleBasis): number {
  switch (basis) {
    case "evEbit":
      return finalYear.ebit;
    case "evEbitda":
      return finalYear.ebitda;
    case "evFcff":
      return finalYear.fcff;
    default:
      return assertNever(basis);
  }
}

export function terminalValue(
  finalYear: TerminalBasis,
  wacc: number,
  method: TerminalValueMethod,
): number {
  const { fcff } = finalYear;
  switch (method.kind) {
    case "perpetuityGrowth":
      return (fcff * (1 + method.growthRate)) / (wacc - method.growthRate);
    case "exitMultiple":
      return method.multiple * terminalBasisValue(finalYear, method.basis);
    default:
      return assertNever(method);
  }
}

function buildNotes(percentOfEv: number): readonly DcfNote[] {
  if (percentOfEv > 0.75) {
    return [{ kind: "terminalValueDominates", percentOfEv }];
  }

  return [];
}

export function computeDcf(inputs: DcfInputs, assumptions: DcfAssumptions): DcfResult {
  const yearlyCashFlows = projectCashFlows(inputs, assumptions);
  const finalYear = yearlyCashFlows.at(-1);

  // impossible branch - used to narrow final year
  if (finalYear === undefined) {
    throw new Error(`projection produced no cash flows`);
  }

  const discountedTerminalValue =
    terminalValue(finalYear, inputs.wacc, assumptions.terminalValueMethod) *
    finalYear.discountFactor;
  let pvExplicitPeriod = 0;

  for (const y of yearlyCashFlows) {
    pvExplicitPeriod += y.pvFcff;
  }

  const enterpriseValue = pvExplicitPeriod + discountedTerminalValue;
  const terminalValuePercentOfEv =
    enterpriseValue === 0 ? 0 : discountedTerminalValue / enterpriseValue;
  const equityValue = enterpriseValue - inputs.netDebt + inputs.nonOperatingAssets;
  const valuePerShare = equityValue / inputs.dilutedSharesOutstandingMillions;

  return {
    valuePerShare,
    enterpriseValue,
    equityValue,
    terminalValue: discountedTerminalValue,
    terminalValuePercentOfEv,
    pvExplicitPeriod,
    yearlyCashFlows,
    inputsUsed: inputs,
    assumptionsUsed: assumptions,
    notes: buildNotes(terminalValuePercentOfEv),
  };
}
