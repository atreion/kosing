/**
 * Cost of capital, textbook: CAPM for equity with the country premium scaled
 * by beta alongside the equity risk premium, the tax shield on debt, and the
 * weighted average. Weights are taken as given; decode has checked they sum
 * to one.
 */

export type WaccInputs = {
  readonly riskFree: number;
  readonly erp: number;
  readonly beta: number;
  readonly countryPremium: number;
  readonly preTaxCostOfDebt: number;
  readonly taxRate: number;
  readonly equityWeight: number;
  readonly debtWeight: number;
};

export type WaccResult = {
  readonly costOfEquity: number;
  readonly afterTaxCostOfDebt: number;
  readonly wacc: number;
};

export function computeWacc(inputs: WaccInputs): WaccResult {
  const costOfEquity = inputs.riskFree + inputs.beta * (inputs.erp + inputs.countryPremium);
  const afterTaxCostOfDebt = inputs.preTaxCostOfDebt * (1 - inputs.taxRate);
  const wacc = inputs.equityWeight * costOfEquity + inputs.debtWeight * afterTaxCostOfDebt;
  return { costOfEquity, afterTaxCostOfDebt, wacc };
}
