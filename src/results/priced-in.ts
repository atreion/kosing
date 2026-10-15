import type { Company } from "../domain/company.ts";
import type { Resolution } from "../input/errors.ts";
import { impliedSteadyStateRote } from "../math/excess-return.ts";
import { METRICS, type Multiples, median, positionInBand } from "../math/multiples.ts";
import { solveImpliedGrowth } from "../math/reverse-dcf.ts";
import { selectBands, selectPeerValues } from "../select/multiples.ts";
import { type ReverseDcfOptions, selectReverseDcf } from "../select/reverse-dcf.ts";
import type { ImpliedRoteSection, MultipleRow, ReverseDcfSection } from "./types.ts";

/** Position is judged against the five-year band; the ten-year one is reported beside it. */
export function multipleRows(company: Company, multiples: Multiples): readonly MultipleRow[] {
  return METRICS.map((metric) => {
    const current = multiples[metric];
    const { band5y, band10y } = selectBands(company, metric);
    return {
      metric,
      current,
      band5y,
      band10y,
      position: positionInBand(current, band5y.low, band5y.high),
      peerMedian: median(selectPeerValues(company, metric)),
    };
  });
}

export function reverseDcfSection(
  company: Company,
  wacc: number,
  options: ReverseDcfOptions,
): { readonly section: ReverseDcfSection | null; readonly resolutions: readonly Resolution[] } {
  if (company.financialInstitution !== null) {
    return {
      section: null,
      resolutions: [{ kind: "reverseDcfUnavailable", reason: "financialInstitution" }],
    };
  }
  const selection = selectReverseDcf(company, wacc, options);
  if (selection.kind === "unavailable") {
    return {
      section: null,
      resolutions: [{ kind: "reverseDcfUnavailable", reason: selection.reason }],
    };
  }
  const outcome = solveImpliedGrowth(selection.inputs);
  if (outcome.kind === "unsolvable") {
    return {
      section: null,
      resolutions: [{ kind: "reverseDcfUnavailable", reason: outcome.reason }],
    };
  }
  return {
    section: {
      impliedGrowth: outcome.impliedGrowth,
      basePeriod: selection.basePeriod,
      horizonYears: options.horizonYears,
      terminalGrowth: options.terminalGrowth,
      depreciationCappedAtCapex: selection.depreciationCappedAtCapex,
    },
    resolutions: [],
  };
}

/** For a bank or insurer, the steady ROTE today's price-to-tangible-book justifies. */
export function impliedRoteSection(
  company: Company,
  marketCap: number,
  costOfEquity: number,
  terminalGrowth: number,
): ImpliedRoteSection | null {
  const tbv = company.financialInstitution?.tangibleBookEquity ?? null;
  if (tbv === null || tbv <= 0) return null;
  const priceToTangibleBook = marketCap / tbv;
  return {
    impliedRote: impliedSteadyStateRote(priceToTangibleBook, costOfEquity, terminalGrowth),
    priceToTangibleBook,
    costOfEquity,
    terminalGrowth,
  };
}
