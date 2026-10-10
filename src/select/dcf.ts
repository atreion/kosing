/**
 * From the dcf branch of a Valuation to the math's inputs. The base period is
 * ltm ?? latest fiscal year, resolved here rather than in decode because the
 * fallback always lands. The WACC is computed from the branch's cost of
 * capital (the beta override already applied) and replaced outright by the
 * case's override when there is one.
 */

import type { Company } from "../domain/company.ts";
import { isNonEmpty } from "../domain/types.ts";
import type { DcfScenarioPaths, SensitivityAxes, Valuation } from "../domain/valuation.ts";
import type { Resolution } from "../input/errors.ts";
import type { DcfInputs, YearAssumptions } from "../math/dcf.ts";
import type { SensitivityInputs } from "../math/sensitivity.ts";
import { computeWacc, type WaccResult } from "../math/wacc.ts";
import { type BasePeriodRef, selectOperatingBasePeriod } from "./base-period.ts";
import { selectWacc } from "./wacc.ts";

export type DcfValuation = Extract<Valuation, { method: "dcf" }>;

export type DcfSelection = {
  readonly inputs: DcfInputs;
  readonly wacc: WaccResult & { readonly overridden: boolean };
  readonly basePeriod: BasePeriodRef;
  readonly basePeriodEbit: number;
  readonly resolutions: readonly Resolution[];
};

function entry(path: readonly number[], i: number): number {
  const v = path[i];
  if (v === undefined) throw new Error("unreachable: the schema requires ten entries");
  return v;
}

function zipYears(a: DcfValuation["assumptions"]): DcfInputs["years"] {
  const years: YearAssumptions[] = a.revenueGrowthPath.map((revenueGrowth, i) => ({
    revenueGrowth,
    ebitMargin: entry(a.ebitMarginPath, i),
    capexPctRevenue: entry(a.capexPctRevenuePath, i),
    daPctRevenue: entry(a.daPctRevenuePath, i),
  }));
  if (!isNonEmpty(years)) throw new Error("unreachable: the schema requires ten entries");
  return years;
}

export function selectDcf(valuation: DcfValuation, company: Company): DcfSelection {
  const base = selectOperatingBasePeriod(valuation.financials);
  const resolutions: Resolution[] =
    base.ref.kind === "fiscalYear"
      ? [{ kind: "dcfBasePeriodFromFiscalYear", fy: base.ref.fy }]
      : [];
  const computed = computeWacc(selectWacc(valuation.costOfCapital));
  const wacc =
    valuation.waccOverride === null
      ? { ...computed, overridden: false }
      : { ...computed, wacc: valuation.waccOverride, overridden: true };
  return {
    inputs: {
      revenueBase: base.period.revenue,
      taxRate: valuation.costOfCapital.taxRateForCashFlows,
      wacc: wacc.wacc,
      netDebt: company.netDebt,
      shares: company.market.shares,
      years: zipYears(valuation.assumptions),
      workingCapitalPctRevenue: valuation.assumptions.workingCapitalPctRevenue,
      terminal: valuation.assumptions.terminal,
    },
    wacc,
    basePeriod: base.ref,
    basePeriodEbit: base.period.ebit,
    resolutions,
  };
}

export function selectSensitivity(inputs: DcfInputs, axes: SensitivityAxes): SensitivityInputs {
  return { base: inputs, waccSteps: axes.waccSteps, terminalGrowthSteps: axes.terminalGrowthSteps };
}

/** A scenario replaces the growth and margin paths and keeps every other base input. */
export function selectScenarioInputs(base: DcfInputs, paths: DcfScenarioPaths): DcfInputs {
  const years = base.years.map((y, i) => ({
    ...y,
    revenueGrowth: entry(paths.revenueGrowthPath, i),
    ebitMargin: entry(paths.ebitMarginPath, i),
  }));
  if (!isNonEmpty(years)) throw new Error("unreachable: years is NonEmpty");
  return { ...base, years };
}

/**
 * The cost of capital on the beta the researcher did not use. None when the
 * case overrides the WACC, since the override replaces both.
 */
export function selectAlternativeBetaWacc(
  valuation: DcfValuation,
): (WaccResult & { beta: number }) | null {
  const beta = valuation.costOfCapital.alternativeBeta;
  if (beta === null || valuation.waccOverride !== null) return null;
  return { ...computeWacc(selectWacc({ ...valuation.costOfCapital, beta })), beta };
}
