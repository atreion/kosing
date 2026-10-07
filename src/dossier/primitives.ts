/**
 * Wire primitives, mirroring the small $defs of dossier.schema.json one for
 * one. This layer knows field names and JSON shapes and nothing else.
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

export const TenNumberPath = z.array(z.number()).length(10);

export const ScenarioTriple = z.strictObject({
  bear: z.number(),
  base: z.number(),
  bull: z.number(),
});

export const RangePair = z.strictObject({
  "5y_low": z.number().nullable().optional(),
  "5y_high": z.number().nullable().optional(),
  "10y_low": z.number().nullable().optional(),
  "10y_high": z.number().nullable().optional(),
});

/**
 * Wire-only vocabularies. They stay here rather than in `domain/types.ts`
 * because the domain never sees a source or a revision: both are research
 * bookkeeping that stops at this layer.
 */
export const SOURCE_KINDS = [
  "annual_report",
  "interim_report",
  "quarterly_report",
  "press_release",
  "ir_page",
  "broker_estimate",
  "aggregator",
  "regulator",
  "macro_reference",
  "market_data_feed",
] as const;

export const TRUST_TIERS = ["primary", "secondary", "tertiary"] as const;

export const REVISION_KINDS = [
  "initial",
  "price_refresh",
  "quarterly_refresh",
  "annual_refresh",
  "governance_review",
  "manual",
] as const;

/**
 * A year-month, for a source whose publication was only ever datable to a
 * month. The looseness stays on this one field: widening `IsoDateString`
 * instead would make `IsoDate` mean two shapes, and every comparison in the
 * application would have to handle both. Nothing reads `publication_date`, and
 * nothing can turn a year-month into an `IsoDate`, so it cannot leak.
 */
const YearMonth = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM");

export const SourceEntry = z.strictObject({
  id: z.string().regex(/^S[0-9]+$/, "must be S followed by digits"),
  kind: z.enum(SOURCE_KINDS),
  issuer: z.string(),
  title: z.string(),
  url: z.url(),
  publication_date: z.union([IsoDateString, YearMonth]).nullable().optional(),
  retrieved: IsoDateString,
  pages: z.string().optional(),
  trust_tier: z.enum(TRUST_TIERS),
});

export const RevisionEntry = z.strictObject({
  revision: z.number().int().min(1),
  as_of: IsoDateString,
  kind: z.enum(REVISION_KINDS),
  fields_changed: z.array(z.string()).optional(),
  trigger: z.string().min(1),
});

export type ScenarioTriple = z.infer<typeof ScenarioTriple>;
export type RangePair = z.infer<typeof RangePair>;
export type SourceEntry = z.infer<typeof SourceEntry>;
export type RevisionEntry = z.infer<typeof RevisionEntry>;
