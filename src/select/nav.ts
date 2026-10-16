import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import type { NavInputs } from "../math/nav.ts";

export type NavValuation = Extract<Valuation, { method: "nav" }>;

export type NavScenario = "bear" | "base" | "bull";

/** One scenario's sum of the parts; parent net debt and the discount are shared. */
export function selectNav(
  valuation: NavValuation,
  company: Company,
  scenario: NavScenario = "base",
): NavInputs {
  return {
    holdings: valuation.parts.map((p) => ({ name: p.name, fairValue: p.value[scenario] })),
    parentNetDebt: valuation.parentNetDebt,
    warrantedDiscount: valuation.assumptions.warrantedDiscount,
    shares: company.market.shares,
  };
}
