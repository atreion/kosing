/**
 * Financial rows, transcribed from $defs.financialRow and $defs.quarterlyRow.
 * Neither def sets `additionalProperties`, so strictness here is a deliberate
 * tightening: a misspelled field should reach the research model as an error
 * rather than be silently dropped.
 */

import { z } from "zod";
import { UNIT_VALUES } from "../domain/types.ts";
import { Iso4217, IsoDateString } from "./primitives.ts";

export const FinancialRow = z
  .strictObject({
    is_ltm: z.boolean(),
    fy: z.number().int().min(1900).max(2200).nullable().optional(),
    fy_end_date: IsoDateString,
    currency: Iso4217,
    unit: z.enum(UNIT_VALUES),
    revenue: z.number().optional(),
    cogs: z.number().nullable().optional(),
    gross_profit: z.number().nullable().optional(),
    opex: z.number().nullable().optional(),
    ebit: z.number().optional(),
    ebitda: z.number().nullable().optional(),
    depreciation_amortization: z.number().nullable().optional(),
    interest_expense: z.number().nullable().optional(),
    tax_expense: z.number().nullable().optional(),
    net_income: z.number().optional(),
    ocf: z.number().nullable().optional(),
    capex: z.number().nullable().optional(),
    fcf: z.number().nullable().optional(),
    shares_basic_m: z.number().min(0).nullable().optional(),
    shares_diluted_m: z.number().min(0).nullable().optional(),
    dividends_paid: z.number().nullable().optional(),
    source_ref: z.string(),
  })
  /**
   * The two if/then blocks of $defs.financialRow. Task 8 removes the pairing
   * from the domain entirely by splitting ltm from fiscalYears, but the wire
   * still has to reject the bad shape so the error names a path in the file a
   * human edits.
   */
  .superRefine((row, ctx) => {
    if (row.is_ltm && row.fy !== null && row.fy !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["fy"],
        message: "an LTM row must not carry an fy",
      });
    }
    if (!row.is_ltm && (row.fy === null || row.fy === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["fy"],
        message: "a fiscal-year row requires an integer fy",
      });
    }
  });

export const QuarterlyRow = z.strictObject({
  fq: z.string().regex(/^[12][0-9]{3}Q[1-4]$/, "must be a fiscal quarter such as 2026Q2"),
  fq_end_date: IsoDateString,
  /** `const: false` in the schema: the LTM row is annual, never quarterly. */
  is_ltm: z.literal(false),
  currency: Iso4217,
  unit: z.enum(UNIT_VALUES),
  revenue: z.number().optional(),
  ebit: z.number().optional(),
  net_income: z.number().optional(),
  ocf: z.number().nullable().optional(),
  capex: z.number().nullable().optional(),
  fcf: z.number().nullable().optional(),
  source_ref: z.string(),
});

export type FinancialRow = z.infer<typeof FinancialRow>;
export type QuarterlyRow = z.infer<typeof QuarterlyRow>;
