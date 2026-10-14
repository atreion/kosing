/**
 * Input primitives shared by facts.ts and case.ts. This layer knows field
 * names and JSON shapes and nothing else.
 */

import { z } from "zod";
import type { Currency, IsoDate } from "../domain/types.ts";

/**
 * The cast is the one sanctioned bridge to a domain brand. The domain declares
 * its brands with a `unique symbol` so that Zod never appears in `src/domain/`,
 * which also means Zod's own `.brand<>()` cannot produce them. Only a parser
 * reaches this line, so the brand still means what it claims: validated.
 */
export const Iso4217 = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a three-letter ISO 4217 code")
  .transform((value) => value as Currency);

export const IsoDateString = z.iso.date().transform((value) => value as IsoDate);

/** A month, for a source whose publication was only ever datable to one. */
export const YearMonth = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM");

export const TenNumberPath = z.array(z.number()).length(10);

export const ScenarioTriple = z.strictObject({
  bear: z.number(),
  base: z.number(),
  bull: z.number(),
});

export const RangeBand = z.strictObject({
  y5Low: z.number().nullable(),
  y5High: z.number().nullable(),
  y10Low: z.number().nullable(),
  y10High: z.number().nullable(),
});

export const SourceId = z
  .string()
  .regex(/^S[0-9]+$/, "must be S followed by digits")
  .describe("S1, S2, … in order of first use. One id is one document retrieved once.");
export const SourceRefs = z.array(SourceId).min(1);

/** Wire-only vocabularies: the domain never sees a source. */
export const SOURCE_KINDS = [
  "annualReport",
  "interimReport",
  "quarterlyReport",
  "pressRelease",
  "irPage",
  "brokerEstimate",
  "aggregator",
  "regulator",
  "macroReference",
  "marketDataFeed",
] as const;

export const TRUST_TIERS = ["primary", "secondary", "tertiary"] as const;

export const SourceEntry = z.strictObject({
  id: SourceId,
  kind: z.enum(SOURCE_KINDS),
  issuer: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  published: z.union([IsoDateString, YearMonth]).nullable(),
  retrieved: IsoDateString,
  pages: z.string().nullable(),
  tier: z
    .enum(TRUST_TIERS)
    .describe(
      "primary: the company's own filings or the regulator. secondary: brokers and consensus. tertiary: aggregators. On a conflict, use the highest tier and say so in research.md.",
    ),
});

export const Gap = z.strictObject({
  field: z.string().min(1),
  reason: z.string().min(1),
});

export type ScenarioTriple = z.infer<typeof ScenarioTriple>;
export type RangeBand = z.infer<typeof RangeBand>;
export type SourceEntry = z.infer<typeof SourceEntry>;
export type Gap = z.infer<typeof Gap>;
