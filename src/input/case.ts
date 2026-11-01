/**
 * case.json: the analyst's case for investing in one company. Which valuation
 * applies and on what assumptions. The valuator takes the method as given and
 * decides nothing.
 *
 * `case` is a reserved word, so the schema is CaseSchema, the type Case, and a
 * variable holding one is investmentCase.
 */

import { z } from "zod";
import { AI_EXPOSURES, CLASSIFICATIONS } from "../domain/types.ts";
import { MINE_STAGES, STAGE_RISK_FACTOR } from "../domain/valuation.ts";
import { assertNever } from "../exhaustive.ts";
import { Iso4217, IsoDateString, ScenarioTriple, SourceRefs, TenNumberPath } from "./primitives.ts";

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
    "Capex as a positive fraction of revenue, including the facts' leasePayments, since leases are not deducted as debt. Under US GAAP that is finance-lease principal only: operating-lease cost is already in EBIT. A business that buys spectrum or licences includes those purchases.",
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

const HoldingName = z
  .string()
  .min(1)
  .describe("The name of a holding in the facts' holdings.items, exactly as written there.");

const Year = z.number().int().min(1900).max(2200);

export const MinePart = z.strictObject({
  kind: z.literal("mine"),
  name: z.string().min(1),
  stage: z
    .enum(MINE_STAGES)
    .describe(
      "Sets the risk factor: producing 1, construction 0.85, permittedFinanced (permitted and financed) 0.6, feasibility 0.35. A resource with no feasibility study is not a mine part; exclude it or value it as analystValue.",
    ),
  ownership: z.number().gt(0).max(1).describe("The company's share of the mine, as a fraction."),
  riskFactor: z
    .number()
    .gt(0)
    .max(1)
    .nullable()
    .describe(
      "Null for the stage's factor. A lower factor only, argued in rationale; one above the stage's is rejected.",
    ),
  production: z
    .array(z.strictObject({ year: Year, volume: z.number().min(0) }))
    .min(1)
    .describe(
      "Remaining production on a 100% basis, millions of units per calendar year from the company's latest mine plan, years increasing. The current year carries only what is left of it after the facts' balanceSheet.asOf, so nothing the balance sheet already holds is counted twice. Convert a fiscal-year plan by splitting each fiscal year across the calendar years it spans.",
    ),
  recoverableReserve: z
    .number()
    .gt(0)
    .nullable()
    .describe(
      "Contained reserve times metallurgical recovery, millions of units on a 100% basis, from the latest reserve statement. Production beyond it is warned about. Null when no reserve is reported.",
    ),
  delayYears: ScenarioTriple.describe(
    "Whole years production and initial capex start later than the plan, per scenario: bull <= base <= bear. 0 throughout for a producing mine.",
  ),
  cashCostPerUnit: z
    .number()
    .min(0)
    .describe("Site cash cost in today's USD per unit, before royalty and sustaining capex."),
  royaltyRate: z
    .number()
    .min(0)
    .lt(1)
    .describe("Royalties and revenue-based extraction taxes as a fraction of revenue."),
  royaltySteps: z
    .array(z.strictObject({ fromPrice: z.number().min(0), extraRate: z.number().gt(0).lt(1) }))
    .describe(
      "Extra rates added to royaltyRate when the price is at or above fromPrice in today's USD, for a price-linked royalty or extraction tax. Empty when the rate is flat.",
    ),
  sustainingCapexPerUnit: z.number().min(0).describe("Sustaining capex in today's USD per unit."),
  initialCapex: z
    .array(z.strictObject({ year: Year, amount: z.number().min(0) }))
    .describe(
      "Remaining construction or expansion capex, USD millions in today's money, by year. Empty when none remains.",
    ),
  openingTaxBase: z
    .number()
    .min(0)
    .describe(
      "Tax value of capital already spent and not yet deducted (undepreciated cost and unused losses tied to the mine), USD millions. Depreciated with initialCapex by units of production. 0 for a mine not yet built.",
    ),
  closureCost: z.number().min(0).describe("USD millions, paid the year after the last production."),
  taxRate: z.number().min(0).lt(1).describe("Income tax on the mine's profit, as a fraction."),
  rationale: z.string().min(1),
});

const ContractPricingSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("fixed"),
    price: z.number().min(0).describe("Today's USD per unit; deflate an escalated base price."),
  }),
  z.strictObject({
    kind: z.literal("marketRelated"),
    discount: z
      .number()
      .min(0)
      .lt(1)
      .describe("Taken off the market price before floor and ceiling, e.g. 0.03 for spot less 3%."),
    floor: z.number().min(0).nullable(),
    ceiling: z.number().min(0).nullable(),
  }),
]);

export const Commodity = z.strictObject({
  name: z.string().min(1).describe("The commodity, e.g. U3O8."),
  unit: z.string().min(1).describe("The unit volumes and prices are in, e.g. lb."),
  priceDeck: ScenarioTriple.describe(
    "A flat price per unit in today's USD for each scenario, held for the life of every mine. Bear near the incentive price for new supply, base at or below the current long-term contract price, bull with a reason.",
  ),
  discount: z
    .strictObject({
      usdRiskFree: z.number().describe("The US 10-year Treasury yield, nominal, as a fraction."),
      usdInflation: z.number().describe("The US 10-year breakeven inflation rate, as a fraction."),
      basis: z.string().min(1).describe("Which series and on what date."),
    })
    .describe(
      "Mines are discounted at the company's WACC with usdRiskFree as the risk-free rate, made real with usdInflation, because their cash flows are in USD and today's money.",
    ),
  contractBook: z
    .strictObject({
      taxRate: z.number().min(0).lt(1),
      blocks: z
        .array(
          z.strictObject({
            fromYear: Year,
            toYear: Year,
            volumePerYear: z.number().gt(0).describe("Millions of units delivered each year."),
            pricing: ContractPricingSchema,
          }),
        )
        .min(1),
      rationale: z.string().min(1),
    })
    .nullable()
    .describe(
      "The company's own committed sales in aggregate, at the volumes it reports (its attributable sales, not a joint venture's at 100%). Valued as the after-tax premium or discount to selling the same volume at the deck. Null when the company sells at market or does not disclose a book; say which in rationale.",
    ),
  rationale: z.string().min(1),
});

export const InventoryPart = z.strictObject({
  kind: z.literal("inventory"),
  name: z.string().min(1),
  volume: z.number().gt(0).describe("Millions of units held, the company's own."),
  costPerUnit: z
    .number()
    .min(0)
    .describe("Tax cost per unit in USD; the gain above it is taxed when sold."),
  taxRate: z.number().min(0).lt(1),
  rationale: z.string().min(1),
});

/** One piece of a sum of the parts, valued in the case rather than read from the facts. */
export const NavPart = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("factsFairValue"),
    holding: HoldingName,
    rationale: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("lookThrough"),
    holding: HoldingName,
    sharesM: z.number().positive().describe("Millions of the holding's shares owned."),
    valuePerShare: ScenarioTriple.describe(
      "Per-share value in `currency`, for example the base, bear and bull values of the holding's own Kosing results.",
    ),
    currency: Iso4217.describe(
      "The currency of valuePerShare; converted to the reporting currency through the facts' spot rate.",
    ),
    rationale: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("segment"),
    name: z.string().min(1),
    metric: z
      .string()
      .min(1)
      .describe("What metricValue is and for which period, e.g. 'Germany EBITDA AL FY2025'."),
    metricValue: z
      .number()
      .describe("In the reporting currency and the facts' unit, from a cited source."),
    multiple: ScenarioTriple,
    rationale: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("analystValue"),
    name: z.string().min(1),
    holding: HoldingName.nullable().describe(
      "The facts holding this values, or null for an asset the facts do not list.",
    ),
    value: ScenarioTriple.describe("In the reporting currency and the facts' unit."),
    rationale: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("excluded"),
    holding: HoldingName,
    rationale: z.string().min(1),
  }),
  MinePart,
  InventoryPart,
]);

export const NavMethod = z.strictObject({
  kind: z.literal("nav"),
  warrantedDiscount: z.number().min(0).max(0.9),
  parts: z
    .array(NavPart)
    .min(1)
    .nullable()
    .describe(
      "Null to take every facts holding at its fair value. Otherwise the sum of the parts: every facts holding appears in exactly one part (factsFairValue, lookThrough, analystValue or excluded), and segment, analystValue or mine parts add what the facts do not list, such as an operating business or a mine. Bear, base and bull NAV come from the parts' triples and, for mines, the price deck; parentNetDebt (net debt from the balance sheet when the facts have no holdings) and the warranted discount are shared.",
    ),
  commodity: Commodity.nullable().describe(
    "Required when a part is a mine or inventory, null otherwise. A commodity producer takes a warrantedDiscount of 0. Partners' share of the net cash of subsidiaries consolidated at 100% is a negative analystValue part (positive for their share of net debt). A loan structure that changes what the company receives from a mine, such as a priority repayment waterfall, is an analystValue part with its working in rationale.",
  ),
  rationale: z.string().min(1),
  sourceRefs: SourceRefs,
});

/** Fractions between -1 and 1, so a path typed in percent is rejected. */
const RotePath = z.array(z.number().min(-1).max(1)).length(10);

export const ExcessReturnScenario = z.strictObject({
  rotePath: RotePath,
  rationale: z.string().min(1),
});

export const ExcessReturnMethod = z.strictObject({
  kind: z.literal("excessReturn"),
  rotePath: RotePath.describe(
    "Return on tangible equity for each of ten years, as fractions, normalised across the rate regimes the company has lived through rather than extrapolated from the latest year. The ROTE is charged on opening tangible book for the year; reported ROTE on average equity runs slightly higher.",
  ),
  payoutRatio: z
    .number()
    .min(0)
    .max(1)
    .describe("Share of earnings paid out as dividends or buybacks; book grows by the rest."),
  terminal: z.strictObject({
    growth: z.number(),
    basis: z.string().min(1),
  }),
  /** Bear and bull replace the ROTE path; everything else is shared. */
  scenarios: z
    .strictObject({ bear: ExcessReturnScenario, bull: ExcessReturnScenario })
    .nullable()
    .describe(
      "Bear and bull replace the ROTE path; everything else is shared. A bank's or insurer's bear carries a credit-loss cycle: one or two years of losses taking ROTE toward zero, taken from the company's own worst years (for a Nordic bank, 2008-2009), then recovery to a lower normalised level. Lower rates alone are not a bear case for a levered business.",
    ),
  rationale: z.string().min(1),
  sourceRefs: SourceRefs,
});

export const Method = z.discriminatedUnion("kind", [
  DcfMethod,
  NormalisedEarningsMethod,
  NavMethod,
  ExcessReturnMethod,
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
      "Decides the method: qualityCompounder and garp take dcf, valueCyclical takes normalisedEarnings, holdingCompany takes nav, bankInsurer takes excessReturn, commodityProducer takes nav with at least one mine part, specialSituation any of dcf, normalisedEarnings or nav. reitUtility and saasPreProfit have no method and get no case.",
    ),
  aiExposure: z
    .enum(AI_EXPOSURES)
    .describe(
      "The company's strongest channel of exposure to the AI cycle: direct (revenue depends on AI compute or model economics), picksAndShovels (a material share from datacentre capex), wealthEffect (demand from customers' financial gains), disruption (AI substitutes for the product or compresses its pricing), secondOrderOnly (the general recession channel only). Sets the add-on to the required discount; the bear case should carry it.",
    ),
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
  path: readonly (string | number)[],
  triple: z.infer<typeof ScenarioTriple>,
  ctx: z.RefinementCtx,
): void {
  if (!(triple.bear <= triple.base && triple.base <= triple.bull)) {
    ctx.addIssue({
      code: "custom",
      path: ["method", ...path],
      message: "bear <= base <= bull is required",
    });
  }
}

/** The triple a part orders, under the key it is written at; null when the part has none. */
function partTriple(
  part: z.infer<typeof NavPart>,
): { readonly key: string; readonly triple: z.infer<typeof ScenarioTriple> } | null {
  switch (part.kind) {
    case "lookThrough":
      return { key: "valuePerShare", triple: part.valuePerShare };
    case "segment":
      return { key: "multiple", triple: part.multiple };
    case "analystValue":
      return { key: "value", triple: part.value };
    case "mine":
    case "inventory":
    case "factsFairValue":
    case "excluded":
      return null;
    default:
      return assertNever(part);
  }
}

type NavMethodShape = z.infer<typeof NavMethod>;

function hasMine(method: z.infer<typeof Method>): boolean {
  return method.kind === "nav" && (method.parts ?? []).some((p) => p.kind === "mine");
}

function checkMine(
  mine: z.infer<typeof MinePart>,
  path: readonly (string | number)[],
  ctx: z.RefinementCtx,
): void {
  const { bear, base, bull } = mine.delayYears;
  if (![bear, base, bull].every((d) => Number.isInteger(d) && d >= 0)) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "delayYears"],
      message: "whole years, 0 or more",
    });
  }
  if (!(bull <= base && base <= bear)) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "delayYears"],
      message: "bull <= base <= bear is required: the bear case is the late one",
    });
  }
  for (const [i, row] of mine.production.entries()) {
    const previous = mine.production[i - 1];
    if (previous !== undefined && row.year <= previous.year) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "production", i, "year"],
        message: "production years must increase",
      });
    }
  }
  const topRate = mine.royaltyRate + mine.royaltySteps.reduce((sum, s) => sum + s.extraRate, 0);
  if (topRate >= 1) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "royaltySteps"],
      message: `royaltyRate and every step together reach ${topRate}; they must stay below 1`,
    });
  }
  const stageFactor = STAGE_RISK_FACTOR[mine.stage];
  if (mine.riskFactor !== null && mine.riskFactor > stageFactor) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "riskFactor"],
      message: `a ${mine.stage} mine's risk factor is at most ${stageFactor}`,
    });
  }
}

/** A part valued at the price deck: a mine or inventory. */
function hasDeckPart(method: NavMethodShape): boolean {
  return (method.parts ?? []).some((p) => p.kind === "mine" || p.kind === "inventory");
}

function checkCommodity(method: NavMethodShape, ctx: z.RefinementCtx): void {
  const mines = hasDeckPart(method);
  if (mines && method.commodity === null) {
    ctx.addIssue({
      code: "custom",
      path: ["method", "commodity"],
      message: "a mine or inventory part needs the commodity block",
    });
  }
  if (!mines && method.commodity !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["method", "commodity"],
      message: "commodity is for a case with a mine or inventory part; set it to null",
    });
  }
  if (method.commodity === null) return;
  requireOrdered(["commodity", "priceDeck"], method.commodity.priceDeck, ctx);
  for (const [i, block] of (method.commodity.contractBook?.blocks ?? []).entries()) {
    const path = ["method", "commodity", "contractBook", "blocks", i];
    if (block.fromYear > block.toYear) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "toYear"],
        message: "fromYear <= toYear is required",
      });
    }
    const p = block.pricing;
    if (
      p.kind === "marketRelated" &&
      p.floor !== null &&
      p.ceiling !== null &&
      p.floor > p.ceiling
    ) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "pricing"],
        message: "floor <= ceiling is required",
      });
    }
  }
}

/**
 * The value rules the shape cannot carry. schema.test.ts lists each as
 * unrepresentable in the emitted JSON Schema, and the skills spec restates it
 * in English for the analyst.
 */
export const CaseSchema = CaseShape.describe(
  "The assumptions a company is valued on. Rules decode enforces beyond this schema: scenario triples are ordered bear <= base <= bull; no scenario multiple exceeds multipleCeiling; overrides and sensitivity apply to dcf only, and sensitivity steps each include 0; each nav part's triple is ordered bear <= base <= bull, except a mine's delayYears, whole years ordered bull <= base <= bear; a mine's production years increase and its riskFactor is at most its stage's; a contract block's fromYear <= toYear and floor <= ceiling; royaltyRate plus its steps stays below 1; commodity is set exactly when a part is a mine or inventory; commodityProducer takes nav with a mine part. Against the facts, decode requires every holding named by a nav part to exist and every facts holding to be accounted for by exactly one part, a factsFairValue part's holding to carry a fair value, a lookThrough part in a foreign currency to have its spot rate in fx, a mine valued for a company not reporting in USD to have its USD spot rate in fx, no mine year before the facts' year, and at least one part that is not excluded. excessReturn and bankInsurer go together: each requires the other.",
).superRefine((c, ctx) => {
  if (c.method.kind === "excessReturn" && c.classification !== "bankInsurer") {
    ctx.addIssue({
      code: "custom",
      path: ["method", "kind"],
      message: "excessReturn is for bankInsurer only",
    });
  }

  if (c.classification === "bankInsurer" && c.method.kind !== "excessReturn") {
    ctx.addIssue({
      code: "custom",
      path: ["method", "kind"],
      message: "bankInsurer takes excessReturn",
    });
  }

  if (c.method.kind === "normalisedEarnings") {
    requireOrdered(["ebitMargin"], c.method.ebitMargin, ctx);
    requireOrdered(["evEbitMultiple"], c.method.evEbitMultiple, ctx);
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

  if (c.method.kind === "nav" && c.method.parts !== null) {
    for (const [i, part] of c.method.parts.entries()) {
      const t = partTriple(part);
      if (t !== null) requireOrdered(["parts", i, t.key], t.triple, ctx);
      if (part.kind === "mine") checkMine(part, ["method", "parts", i], ctx);
    }
  }

  if (c.method.kind === "nav") checkCommodity(c.method, ctx);

  if (c.classification === "commodityProducer" && !hasMine(c.method)) {
    ctx.addIssue({
      code: "custom",
      path: ["method"],
      message: "commodityProducer takes nav with at least one mine part",
    });
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
