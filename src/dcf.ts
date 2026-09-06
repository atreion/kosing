import { assertNever } from "./exhaustive.ts";
import { err, ok, type Result } from "./result.ts";
import {
  type NonNegativeInteger,
  type NonNegativeNumber,
  type PositiveInteger,
  type PositiveNumber,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  parsePathLength,
  parsePositiveInteger,
  parsePositiveNumber,
  parseUnitInterval,
  type UnitInterval,
  type ValidationError,
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

export type DcfRawInputs = {
  readonly [K in keyof DcfInputs]: DcfInputs[K] extends number ? number : DcfInputs[K];
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

export type DcfRawTerminalValueMethod =
  | { readonly kind: "perpetuityGrowth"; readonly growthRate: number }
  | { readonly kind: "exitMultiple"; readonly multiple: number; readonly basis: ExitMultipleBasis };

export type YearAssumptions = {
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

export type DcfRawAssumptions = {
  readonly explicitPeriodYears: number;
  readonly fadePeriodYears: number;
  readonly revenueGrowthPath: readonly number[];
  readonly ebitMarginPath: readonly number[];
  readonly capexPercentOfRevenuePath: readonly number[];
  readonly daPercentOfRevenuePath: readonly number[];
  readonly workingCapitalPercentOfRevenue: number;
  readonly terminalValueMethod: DcfRawTerminalValueMethod;
};

export type TerminalGrowthNotBelowWaccError = {
  readonly kind: "terminalGrowthNotBelowWacc";
  readonly growthRate: number;
  readonly wacc: number;
};

export type DcfValidationError = ValidationError | TerminalGrowthNotBelowWaccError;

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

type ProjectionConstants = {
  readonly taxRate: number;
  readonly wacc: number;
  readonly workingCapitalPercentOfRevenue: number;
};

export function projectYear(
  previousRevenue: number,
  year: number,
  yearAssumptions: YearAssumptions,
  constants: ProjectionConstants,
): YearlyCashFlow {
  const { revenueGrowth, ebitMargin, daPercentOfRevenue, capexPercentOfRevenue } = yearAssumptions;
  const { wacc, taxRate, workingCapitalPercentOfRevenue } = constants;
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
  const constants: ProjectionConstants = {
    taxRate: inputs.taxRate,
    wacc: inputs.wacc,
    workingCapitalPercentOfRevenue: assumptions.workingCapitalPercentOfRevenue,
  };

  for (const [i, yearAssumptions] of assumptions.yearlyAssumptions.entries()) {
    const year = i + 1;
    const row = projectYear(previousRevenue, year, yearAssumptions, constants);
    yearlyCashFlows.push(row);
    previousRevenue = row.revenue;
  }
  return yearlyCashFlows;
}

function selectTerminalBasis(finalYear: TerminalBasis, basis: ExitMultipleBasis): number {
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

export function computeTerminalValue(
  finalYear: TerminalBasis,
  wacc: number,
  method: TerminalValueMethod,
): number {
  const { fcff } = finalYear;
  switch (method.kind) {
    case "perpetuityGrowth":
      return (fcff * (1 + method.growthRate)) / (wacc - method.growthRate);
    case "exitMultiple":
      return method.multiple * selectTerminalBasis(finalYear, method.basis);
    default:
      return assertNever(method);
  }
}

const TERMINAL_VALUE_DOMINANCE_THRESHOLD = 0.75;

function buildNotes(percentOfEv: number): readonly DcfNote[] {
  if (percentOfEv > TERMINAL_VALUE_DOMINANCE_THRESHOLD) {
    return [{ kind: "terminalValueDominates", percentOfEv }];
  }

  return [];
}

function sumPvFcff(yearlyCashFlows: readonly YearlyCashFlow[]): number {
  let sum = 0;

  for (const y of yearlyCashFlows) {
    sum += y.pvFcff;
  }

  return sum;
}

export function computeDcf(inputs: DcfInputs, assumptions: DcfAssumptions): DcfResult {
  const yearlyCashFlows = projectCashFlows(inputs, assumptions);
  const finalYear = yearlyCashFlows.at(-1);

  // impossible branch - used to narrow final year
  if (finalYear === undefined) {
    throw new Error("projection produced no cash flows");
  }

  const discountedTerminalValue =
    computeTerminalValue(finalYear, inputs.wacc, assumptions.terminalValueMethod) *
    finalYear.discountFactor;
  const pvExplicitPeriod = sumPvFcff(yearlyCashFlows);
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

export function parseDcfInputs(raw: DcfRawInputs): Result<DcfInputs, ValidationError> {
  const revenueBase = parseNonNegativeNumber(raw.revenueBase, "revenueBase");
  if (!revenueBase.ok) {
    return revenueBase;
  }

  const taxRate = parseUnitInterval(raw.taxRate, "taxRate");
  if (!taxRate.ok) {
    return taxRate;
  }

  const wacc = parsePositiveNumber(raw.wacc, "wacc");
  if (!wacc.ok) {
    return wacc;
  }

  const dilutedSharesOutstandingMillions = parsePositiveNumber(
    raw.dilutedSharesOutstandingMillions,
    "dilutedSharesOutstandingMillions",
  );
  if (!dilutedSharesOutstandingMillions.ok) {
    return dilutedSharesOutstandingMillions;
  }

  const { netDebt, nonOperatingAssets, currency, unit } = raw;

  return ok({
    revenueBase: revenueBase.value,
    taxRate: taxRate.value,
    wacc: wacc.value,
    netDebt,
    dilutedSharesOutstandingMillions: dilutedSharesOutstandingMillions.value,
    nonOperatingAssets,
    currency,
    unit,
  });
}

function parseTerminalValueMethod(
  raw: DcfRawTerminalValueMethod,
  wacc: PositiveNumber,
): Result<TerminalValueMethod, DcfValidationError> {
  switch (raw.kind) {
    case "perpetuityGrowth":
      if (raw.growthRate >= wacc) {
        return err({ kind: "terminalGrowthNotBelowWacc", growthRate: raw.growthRate, wacc });
      }
      return ok({ kind: "perpetuityGrowth", growthRate: raw.growthRate });
    case "exitMultiple": {
      const multiple = parsePositiveNumber(raw.multiple, "multiple");
      if (!multiple.ok) {
        return multiple;
      }
      return ok({ kind: "exitMultiple", multiple: multiple.value, basis: raw.basis });
    }
    default:
      return assertNever(raw);
  }
}

type PathAssumptions = {
  readonly revenueGrowthPath: readonly number[];
  readonly ebitMarginPath: readonly number[];
  readonly capexPercentOfRevenuePath: readonly number[];
  readonly daPercentOfRevenuePath: readonly number[];
};

function zipYearAssumptions(assumptions: PathAssumptions): readonly YearAssumptions[] {
  const { revenueGrowthPath, ebitMarginPath, capexPercentOfRevenuePath, daPercentOfRevenuePath } =
    assumptions;

  const rows: YearAssumptions[] = [];

  for (const [i, revenueGrowth] of revenueGrowthPath.entries()) {
    const ebitMargin = ebitMarginPath[i];
    const capexPercentOfRevenue = capexPercentOfRevenuePath[i];
    const daPercentOfRevenue = daPercentOfRevenuePath[i];

    if (
      ebitMargin === undefined ||
      capexPercentOfRevenue === undefined ||
      daPercentOfRevenue === undefined
    ) {
      throw new Error("path lengths diverged after validation");
    }

    rows.push({ revenueGrowth, ebitMargin, capexPercentOfRevenue, daPercentOfRevenue });
  }

  return rows;
}

export function parseDcfAssumptions(
  raw: DcfRawAssumptions,
  wacc: PositiveNumber,
): Result<DcfAssumptions, DcfValidationError> {
  const explicitPeriodYears = parsePositiveInteger(raw.explicitPeriodYears, "explicitPeriodYears");
  if (!explicitPeriodYears.ok) {
    return explicitPeriodYears;
  }

  const fadePeriodYears = parseNonNegativeInteger(raw.fadePeriodYears, "fadePeriodYears");
  if (!fadePeriodYears.ok) {
    return fadePeriodYears;
  }

  const totalYears = explicitPeriodYears.value + fadePeriodYears.value;

  const revenueGrowthPath = parsePathLength(raw.revenueGrowthPath, totalYears, "revenueGrowthPath");
  if (!revenueGrowthPath.ok) {
    return revenueGrowthPath;
  }

  const ebitMarginPath = parsePathLength(raw.ebitMarginPath, totalYears, "ebitMarginPath");
  if (!ebitMarginPath.ok) {
    return ebitMarginPath;
  }

  const capexPercentOfRevenuePath = parsePathLength(
    raw.capexPercentOfRevenuePath,
    totalYears,
    "capexPercentOfRevenuePath",
  );
  if (!capexPercentOfRevenuePath.ok) {
    return capexPercentOfRevenuePath;
  }

  const daPercentOfRevenuePath = parsePathLength(
    raw.daPercentOfRevenuePath,
    totalYears,
    "daPercentOfRevenuePath",
  );
  if (!daPercentOfRevenuePath.ok) {
    return daPercentOfRevenuePath;
  }

  const terminalValueMethod = parseTerminalValueMethod(raw.terminalValueMethod, wacc);
  if (!terminalValueMethod.ok) {
    return terminalValueMethod;
  }

  return ok({
    explicitPeriodYears: explicitPeriodYears.value,
    fadePeriodYears: fadePeriodYears.value,
    yearlyAssumptions: zipYearAssumptions({
      revenueGrowthPath: revenueGrowthPath.value,
      ebitMarginPath: ebitMarginPath.value,
      capexPercentOfRevenuePath: capexPercentOfRevenuePath.value,
      daPercentOfRevenuePath: daPercentOfRevenuePath.value,
    }),
    workingCapitalPercentOfRevenue: raw.workingCapitalPercentOfRevenue,
    terminalValueMethod: terminalValueMethod.value,
  });
}
