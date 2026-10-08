/**
 * Advisory findings over the decoded Company. Never fatal: the valuation
 * runs, and the advisor decides what the warning means.
 */

import type { Company } from "../domain/company.ts";
import type { Case } from "./case.ts";
import type { Warning } from "./errors.ts";
import type { Facts } from "./facts.ts";

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
  return [...casePredatesFacts(facts, investmentCase), ...ltmOlderThanFiscalYear(company)];
}
