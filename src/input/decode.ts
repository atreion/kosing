/**
 * The valuator's entry point from documents to domain. Both files are parsed
 * before either is decoded, so a bad facts file and a bad case file are
 * reported together.
 */

import type { Company } from "../domain/company.ts";
import type { AiExposure, Classification, IsoDate } from "../domain/types.ts";
import type { Valuation } from "../domain/valuation.ts";
import { type Case, CaseSchema } from "./case.ts";
import { decodeCompany } from "./decode-company.ts";
import { decodeValuation } from "./decode-valuation.ts";
import {
  type DecodeError,
  type DecodeResult,
  decoded,
  failed,
  type Resolution,
  type Warning,
  zodIssuesToErrors,
} from "./errors.ts";
import { type Facts, FactsSchema } from "./facts.ts";
import { collectWarnings } from "./warnings.ts";

export type Decoded = {
  readonly company: Company;
  readonly valuation: Valuation | null;
  /** Passed through for the advisor; the valuator never reads it. */
  readonly classification: Classification | null;
  /** With classification, sets the required discount. */
  readonly aiExposure: AiExposure | null;
  /** The facts snapshot the case was written against; echoed in results. */
  readonly caseFactsAsOf: IsoDate | null;
  readonly resolutions: readonly Resolution[];
  readonly warnings: readonly Warning[];
};

function parseBoth(
  factsJson: unknown,
  caseJson: unknown,
): DecodeResult<{ facts: Facts; investmentCase: Case | null }> {
  const errors: DecodeError[] = [];
  const facts = FactsSchema.safeParse(factsJson);
  if (!facts.success) errors.push(...zodIssuesToErrors("facts", facts.error.issues));
  let investmentCase: Case | null = null;
  if (caseJson !== undefined) {
    const c = CaseSchema.safeParse(caseJson);
    if (c.success) investmentCase = c.data;
    else errors.push(...zodIssuesToErrors("case", c.error.issues));
  }
  if (!facts.success || errors.length > 0) return failed(errors);
  return decoded({ facts: facts.data, investmentCase });
}

export function decode(factsJson: unknown, caseJson?: unknown): DecodeResult<Decoded> {
  const parsed = parseBoth(factsJson, caseJson);
  if (!parsed.success) return failed(parsed.error);
  const { facts, investmentCase } = parsed.data;

  const company = decodeCompany(facts);
  if (!company.success) return failed(company.error);

  let valuation: Valuation | null = null;
  const resolutions: Resolution[] = [...company.data.resolutions];
  if (investmentCase !== null) {
    const v = decodeValuation(facts, investmentCase, company.data.company);
    if (!v.success) return failed(v.error);
    valuation = v.data.valuation;
    resolutions.push(...v.data.resolutions);
  }

  return decoded({
    company: company.data.company,
    valuation,
    classification: investmentCase?.classification ?? null,
    aiExposure: investmentCase?.aiExposure ?? null,
    caseFactsAsOf: investmentCase?.factsAsOf ?? null,
    resolutions,
    warnings: collectWarnings(facts, investmentCase, company.data.company),
  });
}
