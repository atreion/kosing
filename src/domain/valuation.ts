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

export type ValuedNavPartKind = "factsFairValue" | "lookThrough" | "segment" | "analystValue";

/** One valued piece of a sum of the parts, in the reporting currency and the facts' unit. */
export type ValuedNavPart = {
  readonly name: string;
  readonly kind: ValuedNavPartKind;
  /** The facts holding it values, or null for a segment or an asset the facts do not list. */
  readonly holding: string | null;
  readonly value: ScenarioTriple;
};

export const MINE_STAGES = [
  "producing",
  "construction",
  "permittedFinanced",
  "feasibility",
] as const;
export type MineStage = (typeof MINE_STAGES)[number];

/**
 * The investor's risking of a mine's value by stage. A case may lower a
 * mine's factor with a reason, never raise it.
 */
export const STAGE_RISK_FACTOR: Readonly<Record<MineStage, number>> = {
  producing: 1,
  construction: 0.85,
  permittedFinanced: 0.6,
  feasibility: 0.35,
};

export type YearVolume = { readonly year: number; readonly volume: number };

export type YearAmount = { readonly year: number; readonly amount: number };

export type ContractPricing =
  | { readonly kind: "fixed"; readonly price: number }
  | {
      readonly kind: "marketRelated";
      /** Taken off the market price before the floor and ceiling, as a fraction. */
      readonly discount: number;
      readonly floor: number | null;
      readonly ceiling: number | null;
    };

/** An extra royalty rate that applies when the price is at or above fromPrice. */
export type RoyaltyStep = { readonly fromPrice: number; readonly extraRate: number };

export type ContractBlock = {
  readonly fromYear: number;
  readonly toYear: number;
  readonly volumePerYear: number;
  readonly pricing: ContractPricing;
};

/**
 * A mine on the case's assumptions, valued at the price deck when results are
 * assembled. USD millions, millions of units, USD per unit, today's money.
 */
export type MineNavPart = {
  readonly name: string;
  readonly kind: "mine";
  readonly stage: MineStage;
  /** The company's share, (0, 1]. */
  readonly ownership: number;
  /** The stage's factor, or the case's lower one. */
  readonly riskFactor: number;
  /** On a 100% basis, years in increasing order. */
  readonly production: NonEmpty<YearVolume>;
  readonly cashCostPerUnit: number;
  readonly royaltyRate: number;
  readonly royaltySteps: readonly RoyaltyStep[];
  readonly sustainingCapexPerUnit: number;
  readonly initialCapex: readonly YearAmount[];
  /** Undepreciated tax value of capital already spent, USD millions. */
  readonly openingTaxBase: number;
  readonly closureCost: number;
  readonly taxRate: number;
  /** Whole years production and initial capex start late; bull <= base <= bear. */
  readonly delayYears: ScenarioTriple;
};

/** Product held for sale, valued at the deck less tax on the gain over its tax cost. */
export type InventoryNavPart = {
  readonly name: string;
  readonly kind: "inventory";
  /** Millions of units, the company's own. */
  readonly volume: number;
  readonly costPerUnit: number;
  readonly taxRate: number;
};

export type NavPart = ValuedNavPart | MineNavPart | InventoryNavPart;

/**
 * What the mine parts share: one commodity, one flat price deck in today's
 * USD, the inputs of the real discount rate, and the company's contract book.
 */
export type CommodityModel = {
  readonly name: string;
  readonly unit: string;
  readonly priceDeck: ScenarioTriple;
  readonly usdRiskFree: number;
  readonly usdInflation: number;
  readonly contractBook: {
    readonly blocks: readonly ContractBlock[];
    readonly taxRate: number;
  } | null;
  /** Multiplies a USD amount into the reporting currency; 1 when the company reports in USD. */
  readonly usdToReporting: number;
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
      /** Non-null exactly when a part is a mine or inventory. */
      readonly commodity: CommodityModel | null;
    }
  | {
      readonly method: "excessReturn";
      /** Tangible book to ordinary shareholders, millions of the reporting currency. */
      readonly tangibleBook: number;
      /** The facts' cost of capital; only the cost of equity is used. */
      readonly costOfCapital: CostOfCapital;
      readonly assumptions: ExcessReturnAssumptions;
    };
