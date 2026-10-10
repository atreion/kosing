import type { Company, Peer, RangeBand } from "../domain/company.ts";
import type { ReportedPeriod } from "../domain/financials.ts";
import type { Metric, MultipleInputs } from "../math/multiples.ts";
import type { Derived } from "./derived.ts";

export type Band = { readonly low: number | null; readonly high: number | null };

const NO_BAND: RangeBand = { y5Low: null, y5High: null, y10Low: null, y10High: null };

export function selectMultipleInputs(
  derived: Derived,
  period: ReportedPeriod,
  bookValue: number | null,
): MultipleInputs {
  return {
    marketCap: derived.marketCap,
    enterpriseValue: derived.enterpriseValue,
    netIncome: period.netIncome,
    ebit: period.ebit,
    ebitda: period.ebitda,
    revenue: period.revenue,
    bookValue,
  };
}

/** Facts carry no EV/revenue band, so that metric has none. */
function bandFor(company: Company, metric: Metric): RangeBand {
  const ranges = company.historicalRanges;
  if (ranges === null || metric === "evRevenue") return NO_BAND;
  return ranges[metric];
}

export function selectBands(
  company: Company,
  metric: Metric,
): { readonly band5y: Band; readonly band10y: Band } {
  const b = bandFor(company, metric);
  return {
    band5y: { low: b.y5Low, high: b.y5High },
    band10y: { low: b.y10Low, high: b.y10High },
  };
}

/** Peers carry no price-to-book, so that metric has no peer set. */
export function selectPeerValues(company: Company, metric: Metric): readonly number[] {
  if (metric === "priceBook") return [];
  const key: keyof Peer = metric;
  return company.peers.flatMap((p) => {
    const v = p[key];
    return typeof v === "number" ? [v] : [];
  });
}
