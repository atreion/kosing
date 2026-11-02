/**
 * What a mine needs from the company and the case: the real USD discount
 * rate, the valuation date as a decimal year, and the terms one scenario
 * values the mines on.
 */

import type { CostOfCapital } from "../domain/company.ts";
import type { IsoDate } from "../domain/types.ts";
import type { CommodityModel, MineNavPart } from "../domain/valuation.ts";
import { computeContractBookValue, computeMineValue, realRate } from "../math/mine.ts";
import { computeWacc } from "../math/wacc.ts";
import { selectWacc } from "./wacc.ts";

export type MineScenario = "bear" | "base" | "bull";

export type MineDiscount = {
  /** The company's WACC with the US 10-year as the risk-free rate. */
  readonly usdWacc: number;
  readonly realRate: number;
};

/**
 * The terms the mines are valued on: the main commodity's price, every other
 * product's price by name, whose delay, and the discounting.
 */
export type MineTerms = {
  readonly price: number;
  readonly otherPrices: ReadonlyMap<string, number>;
  readonly delay: MineScenario;
  readonly realRate: number;
  readonly valuationYear: number;
};

export function selectMineDiscount(
  commodity: CommodityModel,
  costOfCapital: CostOfCapital,
): MineDiscount {
  const usdWacc = computeWacc({
    ...selectWacc(costOfCapital),
    riskFree: commodity.usdRiskFree,
  }).wacc;
  return { usdWacc, realRate: realRate(usdWacc, commodity.usdInflation) };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 2026-01-01 is 2026.0; 2026-10-26 is about 2026.82. */
export function decimalYear(date: IsoDate): number {
  const year = Number(date.slice(0, 4));
  const startOfYear = Date.UTC(year, 0, 1);
  const elapsedDays = (Date.parse(`${date}T00:00:00Z`) - startOfYear) / 86_400_000;
  return year + elapsedDays / (isLeapYear(year) ? 366 : 365);
}

export function scenarioTerms(
  commodity: CommodityModel,
  costOfCapital: CostOfCapital,
  asOf: IsoDate,
  scenario: MineScenario,
): MineTerms {
  return {
    price: commodity.priceDeck[scenario],
    otherPrices: new Map(commodity.otherProducts.map((p) => [p.name, p.priceDeck[scenario]])),
    delay: scenario,
    realRate: selectMineDiscount(commodity, costOfCapital).realRate,
    valuationYear: decimalYear(asOf),
  };
}

/** A product's price on the terms: the main commodity's, or another product's by name. */
function priceOf(product: string, commodity: CommodityModel, terms: MineTerms): number {
  if (product === commodity.name) return terms.price;
  const price = terms.otherPrices.get(product);
  if (price === undefined) throw new Error(`unreachable: decode resolves product ${product}`);
  return price;
}

/** The company's share of the mine's value after risking, USD millions. */
export function mineValueUsd(
  mine: MineNavPart,
  commodity: CommodityModel,
  terms: MineTerms,
): number {
  const value = computeMineValue(
    {
      production: mine.production,
      byProducts: mine.byProducts.map((b) => ({
        production: b.production,
        price: priceOf(b.product, commodity, terms),
      })),
      cashCostPerUnit: mine.cashCostPerUnit,
      royaltyRate: mine.royaltyRate,
      royaltySteps: mine.royaltySteps,
      sustainingCapexPerUnit: mine.sustainingCapexPerUnit,
      initialCapex: mine.initialCapex,
      openingTaxBase: mine.openingTaxBase,
      closureCost: mine.closureCost,
      taxRate: mine.taxRate,
      delayYears: mine.delayYears[terms.delay],
    },
    priceOf(mine.product, commodity, terms),
    terms,
  );
  return value.npv * mine.ownership * mine.riskFactor;
}

/** USD millions; null when the case carries no contract book. */
export function contractBookValueUsd(commodity: CommodityModel, terms: MineTerms): number | null {
  const book = commodity.contractBook;
  if (book === null) return null;
  return computeContractBookValue(book.blocks, book.taxRate, terms.price, terms);
}
