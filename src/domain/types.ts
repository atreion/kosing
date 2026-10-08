declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type Currency = Brand<string, "Currency">;

export type IsoDate = Brand<string, "IsoDate">;

export type NonEmpty<T> = readonly [T, ...T[]];

export function isNonEmpty<T>(values: readonly T[]): values is NonEmpty<T> {
  return values.length > 0;
}

export const BASIS_VALUES = ["listed", "unlisted"] as const;
export type Basis = (typeof BASIS_VALUES)[number];

export const UNIT_VALUES = ["millions", "thousands", "ones"] as const;
export type Unit = (typeof UNIT_VALUES)[number];
export const CLASSIFICATIONS = [
  "qualityCompounder",
  "garp",
  "valueCyclical",
  "holdingCompany",
  "bankInsurer",
  "reitUtility",
  "saasPreProfit",
  "commodityProducer",
  "specialSituation",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
