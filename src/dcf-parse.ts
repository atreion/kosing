import type {
  DcfAssumptions,
  DcfInputs,
  ExitMultipleBasis,
  TerminalValueMethod,
  YearAssumptions,
} from "./dcf.ts";
import { assertNever } from "./exhaustive.ts";
import { err, ok, type Result } from "./result.ts";
import {
  type PositiveNumber,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  parsePathLength,
  parsePositiveInteger,
  parsePositiveNumber,
  parseUnitInterval,
  type ValidationError,
} from "./validate.ts";

export type DcfRawInputs = {
  readonly [K in keyof DcfInputs]: DcfInputs[K] extends number ? number : DcfInputs[K];
};

export type DcfRawTerminalValueMethod =
  | { readonly kind: "perpetuityGrowth"; readonly growthRate: number }
  | { readonly kind: "exitMultiple"; readonly multiple: number; readonly basis: ExitMultipleBasis };

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
