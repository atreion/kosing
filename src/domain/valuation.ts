import type { CostOfCapital } from "./company.ts";
import type { FiscalYear, OperatingFinancials, Period } from "./financials.ts";
import type { Basis, NonEmpty } from "./types.ts";

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

export type SensitivityAxes = {
  readonly waccSteps: NonEmpty<number>;
  readonly terminalGrowthSteps: NonEmpty<number>;
};

/** Carries the evidence that the stated policy was satisfiable. */
export type CyclicalRevenueBase =
  | { readonly kind: "ltm"; readonly period: Period }
  | { readonly kind: "averageFy"; readonly window: NonEmpty<FiscalYear> };

export type Holding = {
  readonly name: string;
  readonly fairValue: number;
  readonly basis: Basis;
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
      readonly holdings: NonEmpty<Holding>;
      readonly parentNetDebt: number;
      readonly lookThroughNav: number | null;
      readonly assumptions: NavAssumptions;
    };
