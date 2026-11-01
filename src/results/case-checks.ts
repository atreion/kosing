/**
 * Advisory checks on the case against the facts and its own results: the
 * ways a case can look prudent without being so. The thresholds come from
 * backtesting nine companies a year back, where a value estimate moved by
 * -23% to +28% in a year on unchanged methods.
 */

import type { Company } from "../domain/company.ts";
import type { ReportedPeriod } from "../domain/financials.ts";
import type { Valuation } from "../domain/valuation.ts";
import type { Warning } from "../input/errors.ts";
import type { BasePeriodRef } from "../select/base-period.ts";
import type { ValuationSection } from "./types.ts";

/** A bear this close to the base is inside one year's ordinary change in value. */
export const NARROW_BEAR_RATIO = 0.8;

/** Reserve statements round; a plan a few percent over is not a finding. */
const RESERVE_TOLERANCE = 1.02;

function margin(period: ReportedPeriod | null | undefined): number | null {
  if (period == null || period.revenue === null || period.ebit === null || period.revenue <= 0) {
    return null;
  }
  return period.ebit / period.revenue;
}

function basePeriodMargin(company: Company, ref: BasePeriodRef): number | null {
  const { ltm, fiscalYears } = company.financials;
  return margin(ref.kind === "ltm" ? ltm : fiscalYears.find((y) => y.fy === ref.fy));
}

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function bearMarginWarning(bear: number, current: number | null, path: string): Warning[] {
  if (current === null || bear <= current) return [];
  return [
    {
      rule: "bearMarginAboveCurrent",
      path,
      message: `bear margin ${pct(bear)} is above the current ${pct(current)}; the bear is not a downside`,
    },
  ];
}

function bearMarginAboveCurrent(
  valuation: Valuation | null,
  section: ValuationSection | null,
  company: Company,
): Warning[] {
  if (valuation?.method === "dcf" && section?.method === "dcf") {
    const bearFirst = valuation.assumptions.scenarios?.bear.ebitMarginPath[0];
    if (bearFirst === undefined) return [];
    return bearMarginWarning(
      bearFirst,
      basePeriodMargin(company, section.basePeriod),
      "method.scenarios.bear.ebitMarginPath.0",
    );
  }
  if (valuation?.method === "normalisedEarnings" && section?.method === "normalisedEarnings") {
    return bearMarginWarning(
      valuation.assumptions.ebitMargin.bear,
      section.ltmEbitMargin,
      "method.ebitMargin.bear",
    );
  }
  return [];
}

function scenarioTriple(section: ValuationSection | null): [number, number] | null {
  switch (section?.method) {
    case "dcf":
    case "excessReturn":
    case "nav": {
      const bear = section.scenarios?.bear?.valuePerShare;
      return bear === undefined ? null : [bear, section.valuePerShare];
    }
    case "normalisedEarnings":
      return [section.scenarios.bear.valuePerShare, section.scenarios.base.valuePerShare];
    default:
      return null;
  }
}

function scenariosNarrow(section: ValuationSection | null): Warning[] {
  const pair = scenarioTriple(section);
  if (pair === null) return [];
  const [bear, base] = pair;
  if (base <= 0 || bear < base * NARROW_BEAR_RATIO) return [];
  return [
    {
      rule: "scenariosNarrow",
      path: "method.scenarios.bear",
      message: `bear ${bear.toFixed(2)} is within ${pct(1 - NARROW_BEAR_RATIO)} of base ${base.toFixed(2)}; one year's ordinary change in value can exceed that`,
    },
  ];
}

function productionBeyondReserve(valuation: Valuation | null): Warning[] {
  if (valuation?.method !== "nav") return [];
  return valuation.parts.flatMap((part, i) => {
    if (part.kind !== "mine" || part.recoverableReserve === null) return [];
    const planned = part.production.reduce((sum, r) => sum + r.volume, 0);
    if (planned <= part.recoverableReserve * RESERVE_TOLERANCE) return [];
    return [
      {
        rule: "productionBeyondReserve" as const,
        path: `method.parts.${i}.production`,
        message: `${part.name} plans ${planned.toFixed(1)} against a recoverable reserve of ${part.recoverableReserve.toFixed(1)}`,
      },
    ];
  });
}

/**
 * The model runs a mine at a loss rather than placing it on care and
 * maintenance, or building it anyway; a negative part understates the option
 * to stop or wait.
 */
function mineValueNegative(section: ValuationSection | null): Warning[] {
  if (section?.method !== "nav") return [];
  return section.parts.flatMap((part) => {
    if (part.kind !== "mine") return [];
    const scenario = part.value.base < 0 ? "base" : part.value.bear < 0 ? "bear" : null;
    if (scenario === null) return [];
    return [
      {
        rule: "mineValueNegative" as const,
        path: "method.parts",
        message: `${part.name} is worth ${part.value[scenario].toFixed(1)} in the ${scenario} case; the model has no option to stop it or not build it`,
      },
    ];
  });
}

export function caseWarnings(
  valuation: Valuation | null,
  section: ValuationSection | null,
  company: Company,
): Warning[] {
  return [
    ...bearMarginAboveCurrent(valuation, section, company),
    ...scenariosNarrow(section),
    ...productionBeyondReserve(valuation),
    ...mineValueNegative(section),
  ];
}
