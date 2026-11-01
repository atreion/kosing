/**
 * results.json and advice.md reduced to what the report shows. Every number
 * here is read or derived from results; nothing is re-valued.
 */

import type { ReportedPeriod } from "../domain/financials.ts";
import { assertNever } from "../exhaustive.ts";
import type { Metric } from "../math/multiples.ts";
import type { SensitivityResult } from "../math/sensitivity.ts";
import type { HurdleSection, Results, ValuationSection } from "../results/types.ts";
import type { BasePeriodRef } from "../select/base-period.ts";
import type { Band } from "../select/multiples.ts";

export type Verdict = { readonly label: string; readonly conviction: string | null };

export type ValueRange = {
  readonly bear: number | null;
  readonly base: number;
  readonly bull: number | null;
};

export type HistoryPoint = {
  readonly label: string;
  readonly kind: "reported" | "case";
  readonly revenue: number;
  readonly ebitMargin: number | null;
  /** Year on year; null for the first point and across the LTM seam. */
  readonly growth: number | null;
};

export type ValueComposition = {
  readonly pvExplicitPeriod: number;
  readonly pvTerminalValue: number;
  readonly enterpriseValue: number;
  readonly equityValue: number;
  readonly horizonYears: number;
};

export type MultipleView = {
  readonly metric: Metric;
  readonly current: number;
  readonly peerMedian: number | null;
  readonly band5y: Band;
};

/** What today's price implies, on the method's own terms. */
export type Implied =
  | { readonly kind: "growth"; readonly value: number }
  | { readonly kind: "growthBeyondRange" }
  | { readonly kind: "rote"; readonly value: number }
  | { readonly kind: "priceToNav"; readonly value: number }
  | { readonly kind: "commodityPrice"; readonly value: number; readonly unit: string };

export type ReportModel = {
  readonly name: string;
  readonly id: string;
  readonly currency: string;
  readonly valuedOn: string | null;
  readonly factsAsOf: string;
  readonly priceAsOf: string;
  readonly classification: string | null;
  readonly aiExposure: string | null;
  readonly method: ValuationSection["method"] | null;
  readonly verdict: Verdict | null;
  readonly price: number;
  readonly week52: { readonly low: number | null; readonly high: number | null };
  readonly values: ValueRange | null;
  readonly hurdle: HurdleSection | null;
  readonly history: readonly HistoryPoint[];
  readonly implied: Implied | null;
  /** The quote currency's price and entry, when the exchange quotes outside the reporting currency. */
  readonly trading: {
    readonly currency: string;
    readonly price: number;
    readonly entry: number;
  } | null;
  readonly composition: ValueComposition | null;
  readonly sensitivity: SensitivityResult | null;
  readonly multiples: readonly MultipleView[];
  readonly adviceMarkdown: string | null;
};

const VERDICTS = ["watching", "accumulate", "pass", "tooHard"] as const;

/**
 * The skill leads advice.md with a bold verdict line, worded freely:
 * **Verdict: `watching`, conviction medium.** or **Verdict: accumulate.
 * Conviction in the base value: medium-high.** The conviction is kept as
 * written, up to the end of its sentence.
 */
export function parseVerdict(advice: string): Verdict | null {
  const line = advice.split("\n").find((l) => /\*\*Verdict:/.test(l));
  if (line === undefined) return null;
  const word = /Verdict:\s*`?([A-Za-z]+)/.exec(line)?.[1];
  const label = VERDICTS.find((v) => v === word);
  if (label === undefined) return null;
  const conviction = /conviction(?: in the base value)?:?\s+([^.*;]+)/i.exec(line)?.[1];
  return { label, conviction: conviction?.trim().toLowerCase() ?? null };
}

export function valueRange(valuation: ValuationSection): ValueRange {
  switch (valuation.method) {
    case "dcf":
    case "excessReturn":
      return {
        bear: valuation.scenarios?.bear?.valuePerShare ?? null,
        base: valuation.valuePerShare,
        bull: valuation.scenarios?.bull?.valuePerShare ?? null,
      };
    case "nav":
      return {
        bear: valuation.scenarios?.bear.valuePerShare ?? null,
        base: valuation.valuePerShare,
        bull: valuation.scenarios?.bull.valuePerShare ?? null,
      };
    case "normalisedEarnings":
      return {
        bear: valuation.scenarios.bear.valuePerShare,
        base: valuation.scenarios.base.valuePerShare,
        bull: valuation.scenarios.bull.valuePerShare,
      };
    default:
      return assertNever(valuation);
  }
}

function margin(period: ReportedPeriod): number | null {
  return period.revenue !== null && period.ebit !== null && period.revenue > 0
    ? period.ebit / period.revenue
    : null;
}

function growth(previous: number | null, current: number): number | null {
  return previous === null || previous <= 0 ? null : current / previous - 1;
}

function reportedHistory(results: Results): readonly HistoryPoint[] {
  const { fiscalYears, ltm } = results.inputs.company.financials;
  const years = fiscalYears.flatMap((fy, i) => {
    if (fy.revenue === null) return [];
    const before = fiscalYears[i - 1];
    const previous = before !== undefined && before.fy === fy.fy - 1 ? before.revenue : null;
    return [
      {
        label: `FY${String(fy.fy).slice(2)}`,
        kind: "reported" as const,
        revenue: fy.revenue,
        ebitMargin: margin(fy),
        growth: growth(previous, fy.revenue),
      },
    ];
  });
  const lastYear = fiscalYears[fiscalYears.length - 1];
  const ltmIsNewer = ltm !== null && lastYear !== undefined && ltm.endDate > lastYear.endDate;
  if (!ltmIsNewer || ltm.revenue === null) return years;
  return [
    ...years,
    { label: "LTM", kind: "reported", revenue: ltm.revenue, ebitMargin: margin(ltm), growth: null },
  ];
}

function baseRevenue(results: Results, ref: BasePeriodRef): number | null {
  const { fiscalYears, ltm } = results.inputs.company.financials;
  if (ref.kind === "ltm") return ltm?.revenue ?? null;
  return fiscalYears.find((fy) => fy.fy === ref.fy)?.revenue ?? null;
}

function caseProjection(results: Results): readonly HistoryPoint[] {
  const valuation = results.valuation;
  if (valuation?.method !== "dcf") return [];
  const baseYear = Number(valuation.basePeriod.endDate.slice(0, 4));
  let previous = baseRevenue(results, valuation.basePeriod);
  return valuation.projection.map((row) => {
    const point: HistoryPoint = {
      label: `${String(baseYear + row.year).slice(2)}E`,
      kind: "case",
      revenue: row.revenue,
      ebitMargin: row.revenue > 0 ? row.ebit / row.revenue : null,
      growth: growth(previous, row.revenue),
    };
    previous = row.revenue;
    return point;
  });
}

function composition(valuation: ValuationSection | null): ValueComposition | null {
  if (valuation?.method !== "dcf") return null;
  return {
    pvExplicitPeriod: valuation.pvExplicitPeriod,
    pvTerminalValue: valuation.pvTerminalValue,
    enterpriseValue: valuation.enterpriseValue,
    equityValue: valuation.equityValue,
    horizonYears: valuation.projection.length,
  };
}

function multiples(results: Results): readonly MultipleView[] {
  return results.pricedIn.multiples.flatMap((row) =>
    row.current === null
      ? []
      : [
          {
            metric: row.metric,
            current: row.current,
            peerMedian: row.peerMedian,
            band5y: row.band5y,
          },
        ],
  );
}

function growthImplied(results: Results): Implied | null {
  const reverse = results.pricedIn.reverseDcf;
  if (reverse !== null) return { kind: "growth", value: reverse.impliedGrowth };
  const outOfRange = results.resolutions.some(
    (r) => r.kind === "reverseDcfUnavailable" && r.reason === "noGrowthInBracketMatchesPrice",
  );
  return outOfRange ? { kind: "growthBeyondRange" } : null;
}

/**
 * A holding company or a miner is valued on its parts, so the reverse DCF on
 * consolidated flows is the wrong question; a bank is priced on its ROTE.
 */
export function impliedByPrice(results: Results, price: number): Implied | null {
  const valuation = results.valuation;
  if (valuation?.method === "nav") {
    const commodity = valuation.commodity;
    if (commodity !== null && commodity.impliedPrice !== null) {
      return { kind: "commodityPrice", value: commodity.impliedPrice, unit: commodity.unit };
    }
    return valuation.valuePerShare > 0
      ? { kind: "priceToNav", value: price / valuation.valuePerShare }
      : null;
  }
  const rote = results.pricedIn.impliedRote;
  if (rote !== null) return { kind: "rote", value: rote.impliedRote };
  return growthImplied(results);
}

function trading(hurdle: HurdleSection | null): ReportModel["trading"] {
  const t = hurdle?.trading ?? null;
  return t === null ? null : { currency: t.currency, price: t.price, entry: t.entryPrice };
}

export function buildReportModel(results: Results, advice: string | null): ReportModel {
  const { company } = results.inputs;
  const { identity, market } = company;
  const price = results.hurdle?.price ?? market.price;
  return {
    name: identity.name,
    id: `${identity.ticker}.${identity.exchange}`,
    currency: company.currency,
    valuedOn: results.inputs.valuedOn,
    factsAsOf: results.inputs.factsAsOf,
    priceAsOf: market.asOf,
    classification: results.inputs.classification,
    aiExposure: results.inputs.aiExposure,
    method: results.valuation?.method ?? null,
    verdict: advice === null ? null : parseVerdict(advice),
    price,
    week52: { low: market.week52Low ?? null, high: market.week52High ?? null },
    values: results.valuation === null ? null : valueRange(results.valuation),
    hurdle: results.hurdle,
    history: [...reportedHistory(results), ...caseProjection(results)],
    implied: impliedByPrice(results, price),
    trading: trading(results.hurdle),
    composition: composition(results.valuation),
    sensitivity: results.sensitivity,
    multiples: multiples(results),
    adviceMarkdown: advice,
  };
}
