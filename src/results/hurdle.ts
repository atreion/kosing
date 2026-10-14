/**
 * The hurdle section: the investor's required discount applied to the base
 * value the valuation produced, so the entry price is computed, not worked
 * out in prose.
 */

import type { AiExposure, Classification, Currency } from "../domain/types.ts";
import { assertNever } from "../exhaustive.ts";
import type { Resolution } from "../input/errors.ts";
import { computeHurdle, requiredDiscount } from "../math/hurdle.ts";
import type {
  AlternativeBetaHurdle,
  HurdleSection,
  TradingCurrencyHurdle,
  ValuationSection,
} from "./types.ts";

function baseValue(valuation: ValuationSection): number {
  switch (valuation.method) {
    case "dcf":
      return valuation.valuePerShare;
    case "normalisedEarnings":
      return valuation.scenarios.base.valuePerShare;
    case "nav":
      return valuation.valuePerShare;
    default:
      return assertNever(valuation);
  }
}

type PriceConversion = Extract<Resolution, { kind: "priceConvertedToReporting" }>;

/** Undoes decode's conversion of the quoted price into the reporting currency. */
function toTradingCurrency(conversion: PriceConversion, value: number): number {
  return conversion.inverted ? value * conversion.rate : value / conversion.rate;
}

function tradingCurrency(conversion: PriceConversion, reporting: Currency): Currency {
  const first = conversion.pair.slice(0, 3);
  return (first === reporting ? conversion.pair.slice(3) : first) as Currency;
}

function trading(
  resolutions: readonly Resolution[],
  reporting: Currency,
  entryPrice: number,
  price: number,
): TradingCurrencyHurdle | null {
  const conversion = resolutions.find(
    (r): r is PriceConversion => r.kind === "priceConvertedToReporting",
  );
  if (conversion === undefined) return null;
  return {
    currency: tradingCurrency(conversion, reporting),
    entryPrice: toTradingCurrency(conversion, entryPrice),
    price: toTradingCurrency(conversion, price),
  };
}

function alternativeBeta(
  valuation: ValuationSection,
  discount: number,
  price: number,
): AlternativeBetaHurdle | null {
  if (valuation.method !== "dcf") return null;
  const value = valuation.alternativeBeta?.valuePerShare ?? null;
  if (value === null) return null;
  const h = computeHurdle({ requiredDiscount: discount, baseValue: value, price });
  return { baseValue: value, ...h };
}

export type HurdleContext = {
  readonly classification: Classification | null;
  readonly aiExposure: AiExposure | null;
  readonly valuation: ValuationSection | null;
  readonly price: number;
  readonly reportingCurrency: Currency;
  readonly resolutions: readonly Resolution[];
};

export function hurdleSection(ctx: HurdleContext): HurdleSection | null {
  if (ctx.valuation === null || ctx.classification === null || ctx.aiExposure === null) {
    return null;
  }
  const discount = requiredDiscount(ctx.classification, ctx.aiExposure);
  if (discount === null) return null;
  const base = baseValue(ctx.valuation);
  const h = computeHurdle({
    requiredDiscount: discount.requiredDiscount,
    baseValue: base,
    price: ctx.price,
  });
  return {
    ...discount,
    baseValue: base,
    entryPrice: h.entryPrice,
    price: ctx.price,
    clears: h.clears,
    trading: trading(ctx.resolutions, ctx.reportingCurrency, h.entryPrice, ctx.price),
    alternativeBeta: alternativeBeta(ctx.valuation, discount.requiredDiscount, ctx.price),
  };
}
