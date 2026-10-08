/**
 * Advisory findings over the decoded Company. Never fatal: the valuation
 * runs, and the advisor decides what the warning means.
 */

import type { Company } from "../domain/company.ts";
import type { Case } from "./case.ts";
import type { Warning } from "./errors.ts";
import type { Facts } from "./facts.ts";

/** Carried over from invest's semantic.py; a currency with no entry never warns. */
const COUNTRY_HINTS: Record<string, readonly string[]> = {
  SEK: ["swed", "sverige", "riksbank"],
  NOK: ["norw", "norge", "norges bank"],
  DKK: ["dan", "denmark", "nationalbank"],
  EUR: ["euro", "bund", "german", "ecb", "french", "oat", "dutch", "finnish", "finland"],
  USD: ["us ", "u.s.", "treasury", "united states", "american"],
  GBP: ["uk ", "gilt", "british", "united kingdom", "bank of england"],
  CHF: ["swiss", "switzerland", "snb"],
  JPY: ["japan", "jgb"],
};

function casePredatesFacts(facts: Facts, c: Case | null): Warning[] {
  if (c === null || c.factsAsOf === null || c.factsAsOf >= facts.asOf) return [];
  return [
    {
      rule: "casePredatesFacts",
      path: "factsAsOf",
      message: `case was written against facts of ${c.factsAsOf}; facts are now ${facts.asOf}`,
    },
  ];
}

function rfBasisMismatch(facts: Facts): Warning[] {
  const hints = COUNTRY_HINTS[facts.currency];
  if (hints === undefined) return [];
  const basis = facts.costOfCapital.riskFreeBasis.toLowerCase();
  if (hints.some((h) => basis.includes(h))) return [];
  return [
    {
      rule: "rfBasisMismatch",
      path: "costOfCapital.riskFreeBasis",
      message: `riskFreeBasis "${facts.costOfCapital.riskFreeBasis}" does not look like a ${facts.currency} curve`,
    },
  ];
}

/** ISO dates compare lexically, which is why IsoDate is a branded string. */
function ltmOlderThanFiscalYear(company: Company): Warning[] {
  const ltm = company.financials.ltm;
  // .at(-1) is T | undefined even on a NonEmpty; the guard keeps tsc honest.
  const latest = company.financials.fiscalYears.at(-1);
  if (ltm === null || latest === undefined || ltm.endDate >= latest.endDate) return [];
  return [
    {
      rule: "ltmOlderThanFiscalYear",
      path: "financials.ltm.endDate",
      message: `ltm ends ${ltm.endDate}, before fiscal year ${latest.fy} ends ${latest.endDate}`,
    },
  ];
}

export function collectWarnings(
  facts: Facts,
  investmentCase: Case | null,
  company: Company,
): Warning[] {
  return [
    ...casePredatesFacts(facts, investmentCase),
    ...rfBasisMismatch(facts),
    ...ltmOlderThanFiscalYear(company),
  ];
}
