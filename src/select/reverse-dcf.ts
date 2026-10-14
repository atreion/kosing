/**
 * The reverse DCF prices the company from facts alone: the newest period
 * with revenue, EBIT, capex and D&A supplies the ratios. D&A above capex is
 * capped at capex: the excess is amortisation of acquired rights or leased
 * assets whose cash cost never shows in capex, and holding it for ten years
 * and a terminal would count it as cash forever. Facts report capex
 * and D&A as the cash-flow statement does, so the absolute value turns an
 * outflow into a share of revenue whichever sign the researcher used.
 */

import type { Company } from "../domain/company.ts";
import type { ReportedPeriod } from "../domain/financials.ts";
import type { ReverseDcfInputs } from "../math/reverse-dcf.ts";
import { type BasePeriodRef, selectUsableReportedPeriod } from "./base-period.ts";

export type ReverseDcfOptions = {
  readonly horizonYears: number;
  readonly terminalGrowth: number;
};

export const DEFAULT_REVERSE_DCF_OPTIONS: ReverseDcfOptions = {
  horizonYears: 10,
  terminalGrowth: 0.02,
};

export type ReverseDcfSelection =
  | {
      readonly kind: "ready";
      readonly inputs: ReverseDcfInputs;
      readonly basePeriod: BasePeriodRef;
      readonly depreciationCappedAtCapex: boolean;
    }
  | { readonly kind: "unavailable"; readonly reason: "noUsableBasePeriod" };

type Usable = ReportedPeriod & {
  readonly revenue: number;
  readonly ebit: number;
  readonly capex: number;
  readonly depreciationAmortization: number;
};

function isUsable(p: ReportedPeriod): p is Usable {
  return (
    p.revenue !== null &&
    p.revenue > 0 &&
    p.ebit !== null &&
    p.capex !== null &&
    p.depreciationAmortization !== null
  );
}

export function selectReverseDcf(
  company: Company,
  wacc: number,
  options: ReverseDcfOptions,
): ReverseDcfSelection {
  const base = selectUsableReportedPeriod(company.financials, isUsable);
  if (base === null || !isUsable(base.period)) {
    return { kind: "unavailable", reason: "noUsableBasePeriod" };
  }
  const p = base.period;
  const capex = Math.abs(p.capex);
  const da = Math.abs(p.depreciationAmortization);
  return {
    kind: "ready",
    basePeriod: base.ref,
    depreciationCappedAtCapex: da > capex,
    inputs: {
      targetValuePerShare: company.market.price,
      revenueBase: p.revenue,
      ebitMargin: p.ebit / p.revenue,
      capexPctRevenue: capex / p.revenue,
      daPctRevenue: Math.min(da, capex) / p.revenue,
      taxRate: company.costOfCapital.taxRateForCashFlows,
      wacc,
      netDebt: company.netDebt,
      shares: company.market.shares,
      horizonYears: options.horizonYears,
      terminalGrowth: options.terminalGrowth,
    },
  };
}
