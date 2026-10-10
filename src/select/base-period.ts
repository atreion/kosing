/**
 * Which period stands for "now". The LTM row when there is one, else the
 * latest fiscal year; for a use that needs particular figures, the newest
 * row that has them. Total over OperatingFinancials, because fiscalYears is
 * NonEmpty; nullable over reported rows, because a holding company may have
 * no row with revenue at all.
 */

import type {
  Financials,
  OperatingFinancials,
  Period,
  ReportedPeriod,
} from "../domain/financials.ts";
import type { IsoDate } from "../domain/types.ts";

export type BasePeriodRef =
  | { readonly kind: "ltm"; readonly fy: null; readonly endDate: IsoDate }
  | { readonly kind: "fiscalYear"; readonly fy: number; readonly endDate: IsoDate };

export type OperatingBasePeriod = { readonly ref: BasePeriodRef; readonly period: Period };
export type ReportedBasePeriod = { readonly ref: BasePeriodRef; readonly period: ReportedPeriod };

export function selectOperatingBasePeriod(f: OperatingFinancials): OperatingBasePeriod {
  if (f.ltm !== null) {
    return { ref: { kind: "ltm", fy: null, endDate: f.ltm.endDate }, period: f.ltm };
  }
  const latest = f.fiscalYears[f.fiscalYears.length - 1] ?? f.fiscalYears[0];
  return {
    ref: { kind: "fiscalYear", fy: latest.fy, endDate: latest.endDate },
    period: latest,
  };
}

/** Candidates newest first: the LTM row, then fiscal years from the latest back. */
function candidates(f: Financials): readonly ReportedBasePeriod[] {
  const years = [...f.fiscalYears].reverse().map((y) => ({
    ref: { kind: "fiscalYear" as const, fy: y.fy, endDate: y.endDate },
    period: y,
  }));
  if (f.ltm === null) return years;
  return [{ ref: { kind: "ltm", fy: null, endDate: f.ltm.endDate }, period: f.ltm }, ...years];
}

export function selectLatestReportedPeriod(f: Financials): ReportedBasePeriod {
  const first = candidates(f)[0];
  if (first === undefined) throw new Error("unreachable: fiscalYears is NonEmpty");
  return first;
}

export function selectUsableReportedPeriod(
  f: Financials,
  usable: (p: ReportedPeriod) => boolean,
): ReportedBasePeriod | null {
  return candidates(f).find((c) => usable(c.period)) ?? null;
}
