/**
 * Reverse DCF: the constant revenue growth over the horizon that makes the
 * forward DCF's value per share equal the price, holding the base period's
 * margin and capex and D&A ratios, no working capital drag, and a Gordon
 * terminal at the given growth.
 *
 * Solved by bisection. Value is not monotone in growth when the FCFF margin
 * is negative, so the bracket's end points are checked for a sign change
 * first: no sign change means no growth in the bracket reaches the price,
 * which is reported rather than guessed.
 */

import { isNonEmpty } from "../domain/types.ts";
import { computeDcf, type DcfInputs, type YearAssumptions } from "./dcf.ts";

export type ReverseDcfInputs = {
  readonly targetValuePerShare: number;
  readonly revenueBase: number;
  readonly ebitMargin: number;
  readonly capexPctRevenue: number;
  readonly daPctRevenue: number;
  readonly taxRate: number;
  readonly wacc: number;
  readonly netDebt: number;
  readonly shares: number;
  /** An integer of at least 1; the selector's option, not user input. */
  readonly horizonYears: number;
  readonly terminalGrowth: number;
};

export const GROWTH_BRACKET = { low: -0.5, high: 1 } as const;

const MAX_ITERATIONS = 200;
const GROWTH_TOLERANCE = 1e-14;

export type ReverseDcfOutcome =
  | { readonly kind: "solved"; readonly impliedGrowth: number }
  | {
      readonly kind: "unsolvable";
      readonly reason: "terminalGrowthNotBelowWacc" | "noGrowthInBracketMatchesPrice";
    };

export function dcfInputsAtGrowth(inputs: ReverseDcfInputs, growth: number): DcfInputs {
  const year: YearAssumptions = {
    revenueGrowth: growth,
    ebitMargin: inputs.ebitMargin,
    capexPctRevenue: inputs.capexPctRevenue,
    daPctRevenue: inputs.daPctRevenue,
  };
  const years = Array.from({ length: inputs.horizonYears }, () => year);
  if (!isNonEmpty(years)) throw new Error("horizonYears must be at least 1");
  return {
    revenueBase: inputs.revenueBase,
    taxRate: inputs.taxRate,
    wacc: inputs.wacc,
    netDebt: inputs.netDebt,
    shares: inputs.shares,
    years,
    workingCapitalPctRevenue: 0,
    terminal: { kind: "perpetuityGrowth", growth: inputs.terminalGrowth },
  };
}

export function solveImpliedGrowth(inputs: ReverseDcfInputs): ReverseDcfOutcome {
  if (inputs.terminalGrowth >= inputs.wacc) {
    return { kind: "unsolvable", reason: "terminalGrowthNotBelowWacc" };
  }
  const gap = (growth: number): number => {
    const r = computeDcf(dcfInputsAtGrowth(inputs, growth));
    if (r.kind !== "value") throw new Error("unreachable: the precondition was checked");
    return r.valuePerShare - inputs.targetValuePerShare;
  };
  let low: number = GROWTH_BRACKET.low;
  let high: number = GROWTH_BRACKET.high;
  let gapLow = gap(low);
  const gapHigh = gap(high);
  if (gapLow === 0) return { kind: "solved", impliedGrowth: low };
  if (gapHigh === 0) return { kind: "solved", impliedGrowth: high };
  if (Math.sign(gapLow) === Math.sign(gapHigh)) {
    return { kind: "unsolvable", reason: "noGrowthInBracketMatchesPrice" };
  }
  for (let i = 0; i < MAX_ITERATIONS && high - low > GROWTH_TOLERANCE; i += 1) {
    const mid = (low + high) / 2;
    const gapMid = gap(mid);
    if (gapMid === 0) return { kind: "solved", impliedGrowth: mid };
    if (Math.sign(gapMid) === Math.sign(gapLow)) {
      low = mid;
      gapLow = gapMid;
    } else {
      high = mid;
    }
  }
  return { kind: "solved", impliedGrowth: (low + high) / 2 };
}
