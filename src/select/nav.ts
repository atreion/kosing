import type { Company } from "../domain/company.ts";
import type { Valuation } from "../domain/valuation.ts";
import type { NavInputs } from "../math/nav.ts";

export type NavValuation = Extract<Valuation, { method: "nav" }>;

export function selectNav(valuation: NavValuation, company: Company): NavInputs {
  return {
    holdings: valuation.holdings.map((h) => ({ name: h.name, fairValue: h.fairValue })),
    parentNetDebt: valuation.parentNetDebt,
    warrantedDiscount: valuation.assumptions.warrantedDiscount,
    shares: company.market.shares,
  };
}
