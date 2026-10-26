import type { Company } from "../domain/company.ts";
import type {
  CommodityModel,
  NavPart,
  ScenarioTriple,
  Valuation,
  ValuedNavPartKind,
} from "../domain/valuation.ts";
import type { NavInputs } from "../math/nav.ts";
import { contractBookValueUsd, type MineTerms, mineValueUsd, scenarioTerms } from "./mine.ts";

export type NavValuation = Extract<Valuation, { method: "nav" }>;

export type NavScenario = "bear" | "base" | "bull";

export const CONTRACT_BOOK_PART = "Contract book";

/** A part as results report it: every kind valued, in the reporting currency. */
export type NavPartValue = {
  readonly name: string;
  readonly kind: ValuedNavPartKind | "mine" | "contractBook";
  readonly holding: string | null;
  readonly value: ScenarioTriple;
};

type Holding = NavInputs["holdings"][number];

type MinesOn = { readonly commodity: CommodityModel; readonly terms: MineTerms } | null;

function minesOn(valuation: NavValuation, terms: MineTerms | null): MinesOn {
  return valuation.commodity === null || terms === null
    ? null
    : { commodity: valuation.commodity, terms };
}

function partValue(part: NavPart, scenario: NavScenario, mines: MinesOn): number {
  if (part.kind !== "mine") return part.value[scenario];
  if (mines === null) throw new Error("unreachable: decode requires commodity with a mine part");
  return mineValueUsd(part, mines.terms) * mines.commodity.usdToReporting;
}

/** In the reporting currency; null when the case carries no contract book. */
function contractBookValue(mines: MinesOn): number | null {
  if (mines === null) return null;
  const usd = contractBookValueUsd(mines.commodity, mines.terms);
  return usd === null ? null : usd * mines.commodity.usdToReporting;
}

/** The parts for one scenario, with the mines and the contract book on the given terms. */
function holdingsAt(
  valuation: NavValuation,
  scenario: NavScenario,
  terms: MineTerms | null,
): Holding[] {
  const mines = minesOn(valuation, terms);
  const parts = valuation.parts.map((p) => ({
    name: p.name,
    fairValue: partValue(p, scenario, mines),
  }));
  const book = contractBookValue(mines);
  return book === null ? parts : [...parts, { name: CONTRACT_BOOK_PART, fairValue: book }];
}

/** The terms the case's own deck and delays give for a scenario; null without mines. */
export function caseMineTerms(
  valuation: NavValuation,
  company: Company,
  scenario: NavScenario,
): MineTerms | null {
  if (valuation.commodity === null) return null;
  return scenarioTerms(valuation.commodity, company.costOfCapital, company.asOf, scenario);
}

/**
 * One scenario's sum of the parts; parent net debt and the discount are
 * shared. Mines are valued on `terms`, by default the scenario's own.
 */
export function selectNav(
  valuation: NavValuation,
  company: Company,
  scenario: NavScenario = "base",
  terms: MineTerms | null = caseMineTerms(valuation, company, scenario),
): NavInputs {
  return {
    holdings: holdingsAt(valuation, scenario, terms),
    parentNetDebt: valuation.parentNetDebt,
    warrantedDiscount: valuation.assumptions.warrantedDiscount,
    shares: company.market.shares,
  };
}

/** Each part's bear, base and bull value, with the contract book as a part of its own. */
export function selectNavPartValues(valuation: NavValuation, company: Company): NavPartValue[] {
  const mines = {
    bear: minesOn(valuation, caseMineTerms(valuation, company, "bear")),
    base: minesOn(valuation, caseMineTerms(valuation, company, "base")),
    bull: minesOn(valuation, caseMineTerms(valuation, company, "bull")),
  };
  const parts = valuation.parts.map(
    (p): NavPartValue => ({
      name: p.name,
      kind: p.kind,
      holding: p.kind === "mine" ? null : p.holding,
      value: {
        bear: partValue(p, "bear", mines.bear),
        base: partValue(p, "base", mines.base),
        bull: partValue(p, "bull", mines.bull),
      },
    }),
  );
  const book = {
    bear: contractBookValue(mines.bear),
    base: contractBookValue(mines.base),
    bull: contractBookValue(mines.bull),
  };
  if (book.bear === null || book.base === null || book.bull === null) return parts;
  return [
    ...parts,
    {
      name: CONTRACT_BOOK_PART,
      kind: "contractBook",
      holding: null,
      value: { bear: book.bear, base: book.base, bull: book.bull },
    },
  ];
}
