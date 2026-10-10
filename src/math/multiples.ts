/**
 * Current valuation multiples and where they sit. A multiple over a
 * non-positive denominator has no meaning (a loss-maker has no P/E), so it
 * is null rather than a negative number an advisor could misread as cheap.
 */

export type MultipleInputs = {
  readonly marketCap: number;
  readonly enterpriseValue: number;
  readonly netIncome: number | null;
  readonly ebit: number | null;
  readonly ebitda: number | null;
  readonly revenue: number | null;
  readonly bookValue: number | null;
};

export const METRICS = ["peTrailing", "evEbit", "evEbitda", "evRevenue", "priceBook"] as const;
export type Metric = (typeof METRICS)[number];

export type Multiples = { readonly [M in Metric]: number | null };

export type Position = "below" | "within" | "above";

function ratio(numerator: number, denominator: number | null): number | null {
  return denominator === null || denominator <= 0 ? null : numerator / denominator;
}

export function computeMultiples(inputs: MultipleInputs): Multiples {
  return {
    peTrailing: ratio(inputs.marketCap, inputs.netIncome),
    evEbit: ratio(inputs.enterpriseValue, inputs.ebit),
    evEbitda: ratio(inputs.enterpriseValue, inputs.ebitda),
    evRevenue: ratio(inputs.enterpriseValue, inputs.revenue),
    priceBook: ratio(inputs.marketCap, inputs.bookValue),
  };
}

export function positionInBand(
  current: number | null,
  low: number | null,
  high: number | null,
): Position | null {
  if (current === null || low === null || high === null) return null;
  if (current < low) return "below";
  if (current > high) return "above";
  return "within";
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  const lower = sorted[mid - 1];
  if (upper === undefined) return null;
  return sorted.length % 2 === 1 || lower === undefined ? upper : (lower + upper) / 2;
}
