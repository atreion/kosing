/**
 * Net asset value for a holding company: the sum of holdings at fair value,
 * less parent net debt, less the discount the case says the market warrants,
 * per share. A NAV below zero is reported as it is.
 */

export type NavInputs = {
  readonly holdings: readonly { readonly name: string; readonly fairValue: number }[];
  readonly parentNetDebt: number;
  readonly warrantedDiscount: number;
  readonly shares: number;
};

export type NavResult = {
  readonly grossAssetValue: number;
  readonly parentNetDebt: number;
  readonly nav: number;
  readonly discountApplied: number;
  readonly equityValue: number;
  readonly valuePerShare: number;
};

export function computeNav(inputs: NavInputs): NavResult {
  const grossAssetValue = inputs.holdings.reduce((sum, h) => sum + h.fairValue, 0);
  const nav = grossAssetValue - inputs.parentNetDebt;
  const discountApplied = nav * inputs.warrantedDiscount;
  const equityValue = nav - discountApplied;
  return {
    grossAssetValue,
    parentNetDebt: inputs.parentNetDebt,
    nav,
    discountApplied,
    equityValue,
    valuePerShare: equityValue / inputs.shares,
  };
}
