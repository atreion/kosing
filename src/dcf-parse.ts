import type {
  DcfAssumptions,
  DcfInputs,
  ExitMultipleBasis,
  TerminalValueMethod,
  YearAssumptions,
} from "./dcf.ts";
import { assertNever } from "./exhaustive.ts";
import { collectResults, err, ok, type Result } from "./result.ts";
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

export function parseDcfInputs(raw: DcfRawInputs): Result<DcfInputs, readonly ValidationError[]> {
  const parsed = collectResults({
    revenueBase: parseNonNegativeNumber(raw.revenueBase, "revenueBase"),
    taxRate: parseUnitInterval(raw.taxRate, "taxRate"),
    wacc: parsePositiveNumber(raw.wacc, "wacc"),
    dilutedSharesOutstandingMillions: parsePositiveNumber(
      raw.dilutedSharesOutstandingMillions,
      "dilutedSharesOutstandingMillions",
    ),
  });

  if (!parsed.ok) {
    return parsed;
  }

  const { netDebt, nonOperatingAssets, currency, unit } = raw;

  return ok({
    ...parsed.value,
    netDebt,
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
): Result<DcfAssumptions, readonly DcfValidationError[]> {
  const scalars = collectResults({
    explicitPeriodYears: parsePositiveInteger(raw.explicitPeriodYears, "explicitPeriodYears"),
    fadePeriodYears: parseNonNegativeInteger(raw.fadePeriodYears, "fadePeriodYears"),
    terminalValueMethod: parseTerminalValueMethod(raw.terminalValueMethod, wacc),
  });

  if (!scalars.ok) {
    return scalars;
  }

  const totalYears = scalars.value.explicitPeriodYears + scalars.value.fadePeriodYears;

  const paths = collectResults({
    revenueGrowthPath: parsePathLength(raw.revenueGrowthPath, totalYears, "revenueGrowthPath"),
    ebitMarginPath: parsePathLength(raw.ebitMarginPath, totalYears, "ebitMarginPath"),
    capexPercentOfRevenuePath: parsePathLength(
      raw.capexPercentOfRevenuePath,
      totalYears,
      "capexPercentOfRevenuePath",
    ),
    daPercentOfRevenuePath: parsePathLength(
      raw.daPercentOfRevenuePath,
      totalYears,
      "daPercentOfRevenuePath",
    ),
  });

  if (!paths.ok) {
    return paths;
  }

  return ok({
    ...scalars.value,
    yearlyAssumptions: zipYearAssumptions(paths.value),
    workingCapitalPercentOfRevenue: raw.workingCapitalPercentOfRevenue,
  });
}
