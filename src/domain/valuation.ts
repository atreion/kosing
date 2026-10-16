import type { CostOfCapital } from "./company.ts";
import type { FiscalYear, OperatingFinancials, Period } from "./financials.ts";
import type { NonEmpty } from "./types.ts";

export type ScenarioTriple = {
  readonly bear: number;
  readonly base: number;
  readonly bull: number;
};

export type Terminal =
  | { readonly kind: "perpetuityGrowth"; readonly growth: number }
  | {
      readonly kind: "exitMultiple";
      readonly multiple: number;
      readonly on: "evEbit" | "evEbitda" | "evFcff";
    };

export type DcfScenarioPaths = {
  readonly revenueGrowthPath: readonly number[];
  readonly ebitMarginPath: readonly number[];
};

export type DcfAssumptions = {
  readonly revenueGrowthPath: readonly number[];
  readonly ebitMarginPath: readonly number[];
  readonly capexPctRevenuePath: readonly number[];
  readonly daPctRevenuePath: readonly number[];
  readonly workingCapitalPctRevenue: number;
  readonly terminal: Terminal;
  readonly scenarios: { readonly bear: DcfScenarioPaths; readonly bull: DcfScenarioPaths } | null;
};

export type CyclicalAssumptions = {
  readonly ebitMargin: ScenarioTriple;
  readonly evEbitMultiple: ScenarioTriple;
  readonly multipleCeiling: number | null;
};

export type NavAssumptions = { readonly warrantedDiscount: number };

export type ExcessReturnAssumptions = {
  readonly rotePath: readonly number[];
  readonly payoutRatio: number;
  readonly terminalGrowth: number;
  readonly scenarios: {
    readonly bear: { readonly rotePath: readonly number[] };
    readonly bull: { readonly rotePath: readonly number[] };
  } | null;
};

export type SensitivityAxes = {
  readonly waccSteps: NonEmpty<number>;
  readonly terminalGrowthSteps: NonEmpty<number>;
};

/** Carries the evidence that the stated policy was satisfiable. */
export type CyclicalRevenueBase =
  | { readonly kind: "ltm"; readonly period: Period }
  | { readonly kind: "averageFy"; readonly window: NonEmpty<FiscalYear> };

export type NavPartKind = "factsFairValue" | "lookThrough" | "segment" | "analystValue";

/** One valued piece of a sum of the parts, in the reporting currency and the facts' unit. */
export type NavPart = {
  readonly name: string;
  readonly kind: NavPartKind;
  /** The facts holding it values, or null for a segment or an asset the facts do not list. */
  readonly holding: string | null;
  readonly value: ScenarioTriple;
};

/**
 * Exactly what the chosen method needs and nothing else. Financials live on
 * the branches that have them, so a holding company's missing revenue is a
 * structural fact rather than an absent field. The discriminant is never
 * given a named type alias.
 */
export type Valuation =
  | {
      readonly method: "dcf";
      readonly financials: OperatingFinancials;
      /** The facts' cost of capital with the case's beta override applied. */
      readonly costOfCapital: CostOfCapital;
      /** The case's WACC override, replacing the computed WACC outright. */
      readonly waccOverride: number | null;
      readonly assumptions: DcfAssumptions;
      readonly sensitivity: SensitivityAxes;
    }
  | {
      readonly method: "normalisedEarnings";
      readonly financials: OperatingFinancials;
      readonly revenueBase: CyclicalRevenueBase;
      readonly assumptions: CyclicalAssumptions;
    }
  | {
      readonly method: "nav";
      readonly parts: NonEmpty<NavPart>;
      /** False when every part is flat because the case took the facts' fair values. */
      readonly hasScenarios: boolean;
      readonly parentNetDebt: number;
      readonly lookThroughNav: number | null;
      readonly assumptions: NavAssumptions;
    }
  | {
      readonly method: "excessReturn";
      /** Tangible book to ordinary shareholders, millions of the reporting currency. */
      readonly tangibleBook: number;
      /** The facts' cost of capital; only the cost of equity is used. */
      readonly costOfCapital: CostOfCapital;
      readonly assumptions: ExcessReturnAssumptions;
    };
