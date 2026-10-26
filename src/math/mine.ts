/**
 * A mine's value: the present value of its remaining cash flows at a flat
 * commodity price, in today's money and discounted at a real rate. A mine
 * depletes, so there is no terminal value. Amounts are USD millions, volumes
 * millions of units, prices and costs USD per unit.
 *
 * Each calendar year's cash arrives at its end. Initial capex and the opening
 * tax base of capital already spent are depreciated for tax by units of
 * production; sustaining capex is expensed in its year.
 * Tax is never negative: a loss year earns no shield and nothing carries
 * forward, which understates a developer slightly. Closure is paid the year
 * after the last production, without a tax deduction.
 */

import type {
  ContractBlock,
  ContractPricing,
  RoyaltyStep,
  YearAmount,
  YearVolume,
} from "../domain/valuation.ts";
import { assertNever } from "../exhaustive.ts";

export type MineInputs = {
  /** On a 100% basis, years in increasing order. */
  readonly production: readonly YearVolume[];
  readonly cashCostPerUnit: number;
  readonly royaltyRate: number;
  readonly royaltySteps: readonly RoyaltyStep[];
  readonly sustainingCapexPerUnit: number;
  readonly initialCapex: readonly YearAmount[];
  readonly openingTaxBase: number;
  readonly closureCost: number;
  readonly taxRate: number;
  /** Shifts production and initial capex later by whole years. */
  readonly delayYears: number;
};

export type DiscountTiming = {
  readonly realRate: number;
  /** The valuation date as a decimal year, e.g. 2026.82 for late October 2026. */
  readonly valuationYear: number;
};

export type MineYear = {
  readonly year: number;
  readonly volume: number;
  readonly revenue: number;
  readonly freeCashFlow: number;
};

export type MineValue = {
  /** 100% basis, before ownership and risking. */
  readonly npv: number;
  readonly years: readonly MineYear[];
};

/** Years from the valuation date to the end of a calendar year. */
export function yearsUntilEndOf(year: number, valuationYear: number): number {
  return year + 1 - valuationYear;
}

export function discountFactor(year: number, timing: DiscountTiming): number {
  return 1 / (1 + timing.realRate) ** yearsUntilEndOf(year, timing.valuationYear);
}

function shifted<T extends { readonly year: number }>(rows: readonly T[], by: number): T[] {
  return rows.map((r) => ({ ...r, year: r.year + by }));
}

function sumBy<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}

function amountIn(rows: readonly YearAmount[], year: number): number {
  return sumBy(
    rows.filter((r) => r.year === year),
    (r) => r.amount,
  );
}

function volumeIn(rows: readonly YearVolume[], year: number): number {
  return sumBy(
    rows.filter((r) => r.year === year),
    (r) => r.volume,
  );
}

function yearSpan(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** The base rate plus every step the price has reached. */
export function royaltyRateAt(base: number, steps: readonly RoyaltyStep[], price: number): number {
  return (
    base +
    sumBy(
      steps.filter((s) => price >= s.fromPrice),
      (s) => s.extraRate,
    )
  );
}

export function computeMineValue(
  mine: MineInputs,
  price: number,
  timing: DiscountTiming,
): MineValue {
  const production = shifted(mine.production, mine.delayYears);
  const capex = shifted(mine.initialCapex, mine.delayYears);
  const royaltyRate = royaltyRateAt(mine.royaltyRate, mine.royaltySteps, price);
  const totalVolume = sumBy(production, (p) => p.volume);
  const depreciable = sumBy(capex, (c) => c.amount) + mine.openingTaxBase;
  const allYears = [...production, ...capex].map((r) => r.year);
  const lastProduction = Math.max(...production.map((p) => p.year));
  const years = yearSpan(Math.min(...allYears), lastProduction + 1).map((year) => {
    const volume = volumeIn(production, year);
    const revenue = volume * price;
    const royalty = revenue * royaltyRate;
    const operating = volume * mine.cashCostPerUnit;
    const sustaining = volume * mine.sustainingCapexPerUnit;
    const depreciation = totalVolume > 0 ? (depreciable * volume) / totalVolume : 0;
    const taxable = revenue - royalty - operating - sustaining - depreciation;
    const tax = Math.max(0, taxable) * mine.taxRate;
    const closure = year === lastProduction + 1 ? mine.closureCost : 0;
    const freeCashFlow =
      revenue - royalty - operating - sustaining - amountIn(capex, year) - tax - closure;
    return { year, volume, revenue, freeCashFlow };
  });
  const npv = sumBy(years, (y) => y.freeCashFlow * discountFactor(y.year, timing));
  return { npv, years };
}

export function contractPrice(pricing: ContractPricing, market: number): number {
  switch (pricing.kind) {
    case "fixed":
      return pricing.price;
    case "marketRelated": {
      const discounted = market * (1 - pricing.discount);
      return Math.min(
        Math.max(discounted, pricing.floor ?? Number.NEGATIVE_INFINITY),
        pricing.ceiling ?? Number.POSITIVE_INFINITY,
      );
    }
    default:
      return assertNever(pricing);
  }
}

/**
 * What the contract book is worth against selling the same volume at the
 * market price: positive when contracts price above the deck, negative when a
 * ceiling or a low fixed price gives value away. Taxed at the company's rate,
 * a negative premium earning the shield because it reduces taxable profit.
 */
export function computeContractBookValue(
  blocks: readonly ContractBlock[],
  taxRate: number,
  market: number,
  timing: DiscountTiming,
): number {
  return sumBy(blocks, (b) =>
    sumBy(yearSpan(b.fromYear, b.toYear), (year) => {
      const premium = b.volumePerYear * (contractPrice(b.pricing, market) - market);
      return premium * (1 - taxRate) * discountFactor(year, timing);
    }),
  );
}

/** Sold at the price, taxed on the gain over its tax cost; a loss earns no shield. USD millions. */
export function computeInventoryValue(
  inventory: { readonly volume: number; readonly costPerUnit: number; readonly taxRate: number },
  price: number,
): number {
  const gain = Math.max(0, price - inventory.costPerUnit) * inventory.volume;
  return price * inventory.volume - gain * inventory.taxRate;
}

export type ImpliedPriceOutcome =
  | { readonly kind: "solved"; readonly price: number }
  | { readonly kind: "unsolvable"; readonly reason: "noPriceInBracketMatchesValue" };

const MAX_ITERATIONS = 200;
const PRICE_TOLERANCE = 1e-9;

/**
 * The price at which valueAt(price) equals the target, by bisection over
 * [low, high]. Value is not always monotone in price (a book of ceilings can
 * give back more than a small mine earns), so the end points are checked for a
 * sign change first and no answer is reported rather than guessed.
 */
export function solveImpliedPrice(
  valueAt: (price: number) => number,
  target: number,
  bracket: { readonly low: number; readonly high: number },
): ImpliedPriceOutcome {
  const gap = (price: number): number => valueAt(price) - target;
  let low = bracket.low;
  let high = bracket.high;
  let gapLow = gap(low);
  const gapHigh = gap(high);
  if (gapLow === 0) return { kind: "solved", price: low };
  if (gapHigh === 0) return { kind: "solved", price: high };
  if (Math.sign(gapLow) === Math.sign(gapHigh)) {
    return { kind: "unsolvable", reason: "noPriceInBracketMatchesValue" };
  }
  for (let i = 0; i < MAX_ITERATIONS && high - low > PRICE_TOLERANCE; i += 1) {
    const mid = (low + high) / 2;
    const gapMid = gap(mid);
    if (gapMid === 0) return { kind: "solved", price: mid };
    if (Math.sign(gapMid) === Math.sign(gapLow)) {
      low = mid;
      gapLow = gapMid;
    } else {
      high = mid;
    }
  }
  return { kind: "solved", price: (low + high) / 2 };
}

/** Fisher: the real rate that a nominal rate and an inflation rate leave. */
export function realRate(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}
