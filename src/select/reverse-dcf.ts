/**
 * The reverse DCF prices the company from facts alone: the newest period
 * with revenue, EBIT, capex and D&A supplies the ratios. Facts report capex
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
  return {
    kind: "ready",
    basePeriod: base.ref,
    inputs: {
      targetValuePerShare: company.market.price,
      revenueBase: p.revenue,
      ebitMargin: p.ebit / p.revenue,
      capexPctRevenue: Math.abs(p.capex) / p.revenue,
      daPctRevenue: Math.abs(p.depreciationAmortization) / p.revenue,
      taxRate: company.costOfCapital.taxRateForCashFlows,
      wacc,
      netDebt: company.netDebt,
      shares: company.market.shares,
      horizonYears: options.horizonYears,
      terminalGrowth: options.terminalGrowth,
    },
  };
}
