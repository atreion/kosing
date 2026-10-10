import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import { assertNever } from "../exhaustive.ts";
import type { NormalisedEarningsInputs } from "../math/normalised-earnings.ts";

export type NormalisedValuation = Extract<Valuation, { method: "normalisedEarnings" }>;

export type RevenueBaseSummary = {
  readonly kind: "ltm" | "averageFy";
  readonly value: number;
  readonly window: readonly number[] | null;
};

export type NormalisedSelection = {
  readonly inputs: NormalisedEarningsInputs;
  readonly revenueBase: RevenueBaseSummary;
  readonly ltmEbitMargin: number | null;
};

function summarise(base: NormalisedValuation["revenueBase"]): RevenueBaseSummary {
  switch (base.kind) {
    case "ltm":
      return { kind: "ltm", value: base.period.revenue, window: null };
    case "averageFy": {
      const total = base.window.reduce((sum, y) => sum + y.revenue, 0);
      return {
        kind: "averageFy",
        value: total / base.window.length,
        window: base.window.map((y) => y.fy),
      };
    }
    default:
      return assertNever(base);
  }
}

export function selectNormalisedEarnings(
  valuation: NormalisedValuation,
  company: Company,
): NormalisedSelection {
  const revenueBase = summarise(valuation.revenueBase);
  const ltm = valuation.financials.ltm;
  return {
    inputs: {
      revenueBase: revenueBase.value,
      netDebt: company.netDebt,
      shares: company.market.shares,
      ebitMargin: valuation.assumptions.ebitMargin,
      evEbitMultiple: valuation.assumptions.evEbitMultiple,
    },
    revenueBase,
    ltmEbitMargin: ltm === null || ltm.revenue === 0 ? null : ltm.ebit / ltm.revenue,
  };
}
