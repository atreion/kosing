/**
 * Advisory findings over the decoded Company. Never fatal: the valuation
 * runs, and the advisor decides what the warning means.
 */

import type { Company } from "../domain/company.ts";
import type { IsoDate } from "../domain/types.ts";
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

/** A price older than this on the valuation date should be refreshed before deciding on it. */
export const PRICE_STALE_DAYS = 30;

const MS_PER_DAY = 86_400_000;

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

export function priceStale(priceAsOf: IsoDate, valuedOn: IsoDate | null): Warning[] {
  if (valuedOn === null) return [];
  const days = daysBetween(priceAsOf, valuedOn);
  if (days <= PRICE_STALE_DAYS) return [];
  return [
    {
      rule: "priceStale",
      path: "market.asOf",
      message: `price is from ${priceAsOf}, ${days} days before ${valuedOn}`,
    },
  ];
}

/** Without a stated management buffer, one percentage point stands in for it. */
const DEFAULT_CAPITAL_BUFFER = 0.01;

function capitalNearRequirement(facts: Facts): Warning[] {
  const fi = facts.financialInstitution;
  if (fi === null) return [];
  const buffer = fi.capitalTarget ?? DEFAULT_CAPITAL_BUFFER;
  const floor = fi.capitalRequirement + buffer;
  if (fi.capitalRatio >= floor) return [];
  return [
    {
      rule: "capitalNearRequirement",
      path: "financialInstitution.capitalRatio",
      message: `capital ratio ${fi.capitalRatio} is below requirement ${fi.capitalRequirement} plus buffer ${buffer}`,
    },
  ];
}

/** Advisory: whether reported equity includes AT1 varies by bank, so this cannot be a decode error. */
function tangibleBookAboveEquity(facts: Facts): Warning[] {
  const fi = facts.financialInstitution;
  const equity = facts.balanceSheet.totalEquity;
  if (fi === null || equity === null || fi.tangibleBookEquity <= equity) return [];
  return [
    {
      rule: "tangibleBookAboveEquity",
      path: "financialInstitution.tangibleBookEquity",
      message: `tangible book ${fi.tangibleBookEquity} exceeds total equity ${equity}; a unit slip or a stale figure`,
    },
  ];
}

/** A company beta this far from its sector's is more likely a bad source than a different business. */
export const BETA_SECTOR_BAND = { low: 0.6, high: 1 / 0.6 } as const;

function betaFarFromSector(facts: Facts): Warning[] {
  const { betaCompany, betaSector } = facts.costOfCapital;
  if (betaCompany === null || betaSector === null || betaSector <= 0) return [];
  const ratio = betaCompany / betaSector;
  if (ratio >= BETA_SECTOR_BAND.low && ratio <= BETA_SECTOR_BAND.high) return [];
  return [
    {
      rule: "betaFarFromSector",
      path: "costOfCapital.betaCompany",
      message: `company beta ${betaCompany} is ${ratio.toFixed(2)} times the sector's ${betaSector}; check the source, and read the value on the sector beta`,
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
    ...ltmOlderThanFiscalYear(company),
    ...capitalNearRequirement(facts),
    ...tangibleBookAboveEquity(facts),
    ...betaFarFromSector(facts),
  ];
}
