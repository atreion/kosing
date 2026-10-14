/**
 * case.json: the analyst's case for investing in one company. Which valuation
 * applies, on what assumptions, and which world-view theses it rests on. The
 * valuator takes the method as given and decides nothing.
 *
 * `case` is a reserved word, so the schema is CaseSchema, the type Case, and a
 * variable holding one is investmentCase.
 */

import { z } from "zod";
import { CLASSIFICATIONS } from "../domain/types.ts";
import { IsoDateString, ScenarioTriple, SourceRefs, TenNumberPath } from "./primitives.ts";

export const Terminal = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("perpetuityGrowth"),
    growth: z.number(),
    basis: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("exitMultiple"),
    multiple: z.number().positive(),
    on: z.enum(["evEbit", "evEbitda", "evFcff"]),
    basis: z.string().min(1),
  }),
]);

/** A whole alternative path for the two assumptions a disruption bear case moves. */
export const DcfScenario = z.strictObject({
  revenueGrowthPath: TenNumberPath,
  ebitMarginPath: TenNumberPath,
  rationale: z.string().min(1),
});

export const DcfMethod = z.strictObject({
  kind: z.literal("dcf"),
  revenueGrowthPath: TenNumberPath.describe(
    "Ten yearly growth rates as fractions. Year 1 starts from the base period (ltm, else the latest fiscal year).",
  ),
  ebitMarginPath: TenNumberPath.describe(
    "EBIT margins as fractions. An adjusted margin is allowed when daPctRevenuePath is on the same basis; say so in rationale.",
  ),
  capexPctRevenuePath: TenNumberPath.describe(
    "Capex as a positive fraction of revenue, including lease payments, since leases are not deducted as debt.",
  ),
  daPctRevenuePath: TenNumberPath,
  workingCapitalPctRevenue: z
    .number()
    .describe(
      "Working capital tied up per unit of revenue growth. Negative when growth releases cash, as with subscriptions billed in advance.",
    ),
  terminal: Terminal,
  /** Bear and bull share every other assumption with the base case. */
  scenarios: z.strictObject({ bear: DcfScenario, bull: DcfScenario }).nullable(),
  rationale: z.string().min(1),
  sourceRefs: SourceRefs,
});

export const RevenueBasePolicy = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ltm") }),
  z.strictObject({ kind: z.literal("averageFy"), years: z.number().int().min(1) }),
]);

export const NormalisedEarningsMethod = z.strictObject({
  kind: z.literal("normalisedEarnings"),
  revenueBase: RevenueBasePolicy,
  ebitMargin: ScenarioTriple,
  evEbitMultiple: ScenarioTriple,
  multipleCeiling: z.number().nullable(),
  rationale: z.string().min(1),
  sourceRefs: SourceRefs,
});

export const NavMethod = z.strictObject({
  kind: z.literal("nav"),
  warrantedDiscount: z.number().min(0).max(0.9),
  rationale: z.string().min(1),
  sourceRefs: SourceRefs,
});

export const Method = z.discriminatedUnion("kind", [
  DcfMethod,
  NormalisedEarningsMethod,
  NavMethod,
]);

export const Overrides = z.strictObject({
  beta: z.number().nullable(),
  /** A discount rate, so strictly between 0 and 1. */
  wacc: z.number().gt(0).lt(1).nullable(),
  /** The cash-flow tax rate, when the reported effective rate is distorted. */
  taxRate: z.number().min(0).lt(1).nullable(),
  rationale: z.string().min(1).nullable(),
});

export const DEFAULT_SENSITIVITY_STEPS = [-0.01, -0.005, 0, 0.005, 0.01] as const;

export const Sensitivity = z.strictObject({
  waccSteps: z.array(z.number()).min(1),
  terminalGrowthSteps: z.array(z.number()).min(1),
});

const CaseShape = z.strictObject({
  schemaVersion: z.literal("1.0"),
  ticker: z.string().min(1),
  factsAsOf: IsoDateString.nullable().describe("The facts' asOf the case was written against."),
  classification: z
    .enum(CLASSIFICATIONS)
    .describe(
      "Decides the method: qualityCompounder and garp take dcf, valueCyclical takes normalisedEarnings, holdingCompany takes nav, specialSituation any of the three. The other classifications have no method and get no case.",
    ),
  theses: z
    .array(z.string().min(1))
    .describe("Slugs of theses in the data repo the case rests on. May be empty."),
  method: Method.describe(
    "The base case is the most likely outcome, not a hoped-for one. Every assumption is argued in rationale and cites sources from the facts.",
  ),
  overrides: Overrides.describe(
    "Null fields unless there is a reason, given in rationale. dcf only.",
  ),
  sensitivity: Sensitivity.nullable().describe(
    "Null for the default grid. Steps are deltas added to the WACC and terminal growth, as fractions.",
  ),
});

function requireOrdered(
  path: string,
  triple: z.infer<typeof ScenarioTriple>,
  ctx: z.RefinementCtx,
): void {
  if (!(triple.bear <= triple.base && triple.base <= triple.bull)) {
    ctx.addIssue({
      code: "custom",
      path: ["method", path],
      message: "bear <= base <= bull is required",
    });
  }
}

/**
 * The value rules the shape cannot carry. schema.test.ts lists each as
 * unrepresentable in the emitted JSON Schema, and the skills spec restates it
 * in English for the analyst.
 */
export const CaseSchema = CaseShape.describe(
  "The assumptions a company is valued on. Rules decode enforces beyond this schema: scenario triples are ordered bear <= base <= bull; no scenario multiple exceeds multipleCeiling; overrides and sensitivity apply to dcf only, and sensitivity steps each include 0.",
).superRefine((c, ctx) => {
  if (c.method.kind === "normalisedEarnings") {
    requireOrdered("ebitMargin", c.method.ebitMargin, ctx);
    requireOrdered("evEbitMultiple", c.method.evEbitMultiple, ctx);
    const ceiling = c.method.multipleCeiling;
    if (ceiling !== null) {
      for (const scenario of ["bear", "base", "bull"] as const) {
        if (c.method.evEbitMultiple[scenario] > ceiling) {
          ctx.addIssue({
            code: "custom",
            path: ["method", "evEbitMultiple", scenario],
            message: `${scenario} multiple exceeds multipleCeiling ${ceiling}`,
          });
        }
      }
    }
  }

  const { beta, wacc, taxRate, rationale } = c.overrides;
  const anyOverride = beta !== null || wacc !== null || taxRate !== null;
  if (anyOverride && rationale === null) {
    ctx.addIssue({
      code: "custom",
      path: ["overrides", "rationale"],
      message: "an override needs a rationale",
    });
  }

  if (c.sensitivity) {
    for (const axis of ["waccSteps", "terminalGrowthSteps"] as const) {
      if (!c.sensitivity[axis].includes(0)) {
        ctx.addIssue({
          code: "custom",
          path: ["sensitivity", axis],
          message: `${axis} must include 0, the base case`,
        });
      }
    }
  }

  // Only a DCF discounts, so only a DCF can have its discount rate overridden or swept.
  if (c.method.kind !== "dcf") {
    if (anyOverride) {
      ctx.addIssue({
        code: "custom",
        path: ["overrides"],
        message: `overrides apply to the dcf method only; this case is ${c.method.kind}`,
      });
    }
    if (c.sensitivity !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["sensitivity"],
        message: `sensitivity applies to the dcf method only; this case is ${c.method.kind}`,
      });
    }
  }
});

export type Case = z.infer<typeof CaseSchema>;
