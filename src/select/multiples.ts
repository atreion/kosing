import type { Company, Peer, RangeBand } from "../domain/company.ts";
import type { ReportedPeriod } from "../domain/financials.ts";
import type { Metric, MultipleInputs } from "../math/multiples.ts";
import type { Derived } from "./derived.ts";

export type Band = { readonly low: number | null; readonly high: number | null };

const NO_BAND: RangeBand = { y5Low: null, y5High: null, y10Low: null, y10High: null };

/** A bank's P/E is on earnings to ordinary shareholders, so AT1 coupons come off. */
function earningsForPe(period: ReportedPeriod, company: Company): number | null {
  const coupons = company.financialInstitution?.at1Coupons ?? null;
  if (period.netIncome === null || coupons === null) return period.netIncome;
  return period.netIncome - coupons;
}

export function selectMultipleInputs(
  derived: Derived,
  period: ReportedPeriod,
  company: Company,
): MultipleInputs {
  return {
    marketCap: derived.marketCap,
    enterpriseValue: derived.enterpriseValue,
    netIncome: earningsForPe(period, company),
    ebit: period.ebit,
    ebitda: period.ebitda,
    revenue: period.revenue,
    bookValue: company.balanceSheet.totalEquity,
    tangibleBook: company.financialInstitution?.tangibleBookEquity ?? null,
    dividends: dividends(period, company),
  };
}

/** A declared run rate beats trailing payments when the payment schedule changed. */
function dividends(period: ReportedPeriod, company: Company): number | null {
  const runRate = company.market.dividendPerShareRunRate;
  if (runRate !== null) return runRate * company.market.shares;
  return period.dividendsPaid === null ? null : Math.abs(period.dividendsPaid);
}

/** Facts carry bands for P/E, EV/EBIT, EV/EBITDA and P/B only. */
function bandFor(company: Company, metric: Metric): RangeBand {
  const ranges = company.historicalRanges;
  if (
    ranges === null ||
    metric === "evRevenue" ||
    metric === "priceTangibleBook" ||
    metric === "dividendYield"
  ) {
    return NO_BAND;
  }
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

/** Peers carry P/E and the EV multiples only. */
export function selectPeerValues(company: Company, metric: Metric): readonly number[] {
  if (metric === "priceBook" || metric === "priceTangibleBook" || metric === "dividendYield") {
    return [];
  }
  const key: keyof Peer = metric;
  return company.peers.flatMap((p) => {
    const v = p[key];
    return typeof v === "number" ? [v] : [];
  });
}
