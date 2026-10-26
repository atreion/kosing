/**
 * The commodity section of a nav valuation with mines: the deck and the
 * discount rate it ran on, each mine's value, what the price implies for the
 * commodity, and the base value at the brokers' 8% real for comparison.
 */

import type { Company } from "../domain/company.ts";
import type { ScenarioTriple } from "../domain/valuation.ts";
import type { Resolution } from "../input/errors.ts";
import { solveImpliedPrice } from "../math/mine.ts";
import { computeNav } from "../math/nav.ts";
import {
  contractBookValueUsd,
  type MineScenario,
  mineValueUsd,
  scenarioTerms,
  selectMineDiscount,
} from "../select/mine.ts";
import { type NavValuation, selectNav } from "../select/nav.ts";
import type { CommoditySection, MineValueRow } from "./types.ts";

/** The convention broker notes quote NAV at, "NAV8". */
export const BROKER_REAL_RATE = 0.08;

/** The implied price is searched between zero and this multiple of the bull deck. */
const IMPLIED_PRICE_CEILING_X_BULL = 10;

function triple(f: (s: MineScenario) => number): ScenarioTriple {
  return { bear: f("bear"), base: f("base"), bull: f("bull") };
}

function priceToNav(price: number, valuePerShare: number): number | null {
  return valuePerShare > 0 ? price / valuePerShare : null;
}

export function commoditySection(
  valuation: NavValuation,
  company: Company,
): { readonly section: CommoditySection | null; readonly resolutions: readonly Resolution[] } {
  const commodity = valuation.commodity;
  if (commodity === null) return { section: null, resolutions: [] };
  const terms = (s: MineScenario) =>
    scenarioTerms(commodity, company.costOfCapital, company.asOf, s);
  const discount = selectMineDiscount(commodity, company.costOfCapital);
  const valuePerShare = (s: MineScenario) =>
    computeNav(selectNav(valuation, company, s)).valuePerShare;
  const mines = valuation.parts.flatMap((p): MineValueRow[] =>
    p.kind === "mine"
      ? [
          {
            name: p.name,
            stage: p.stage,
            ownership: p.ownership,
            riskFactor: p.riskFactor,
            valueUsd: triple((s) => mineValueUsd(p, terms(s))),
          },
        ]
      : [],
  );
  const book =
    commodity.contractBook === null
      ? null
      : triple((s) => contractBookValueUsd(commodity, terms(s)) ?? 0);
  const base = terms("base");
  const atBrokerRate = computeNav(
    selectNav(valuation, company, "base", { ...base, realRate: BROKER_REAL_RATE }),
  ).valuePerShare;
  const implied = solveImpliedPrice(
    (price) => computeNav(selectNav(valuation, company, "base", { ...base, price })).valuePerShare,
    company.market.price,
    { low: 0, high: commodity.priceDeck.bull * IMPLIED_PRICE_CEILING_X_BULL },
  );
  const price = company.market.price;
  return {
    section: {
      name: commodity.name,
      unit: commodity.unit,
      priceDeck: commodity.priceDeck,
      usdRiskFree: commodity.usdRiskFree,
      usdInflation: commodity.usdInflation,
      usdWacc: discount.usdWacc,
      realRate: discount.realRate,
      usdToReporting: commodity.usdToReporting,
      mines,
      contractBookUsd: book,
      valuePerShareAt8PctReal: atBrokerRate,
      priceToNav: {
        bear: priceToNav(price, valuePerShare("bear")),
        base: priceToNav(price, valuePerShare("base")),
        bull: priceToNav(price, valuePerShare("bull")),
      },
      impliedPrice: implied.kind === "solved" ? implied.price : null,
    },
    resolutions:
      implied.kind === "solved"
        ? []
        : [{ kind: "impliedCommodityPriceUnavailable", reason: implied.reason }],
  };
}
