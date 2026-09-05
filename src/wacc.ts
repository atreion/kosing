import { ok, type Result } from "./result.ts";
import {
  type NonNegativeNumber,
  type PositiveNumber,
  parseNonNegativeNumber,
  parsePositiveNumber,
  parseUnitInterval,
  type UnitInterval,
  type ValidationError,
} from "./validate.ts";

export type WaccInputs = {
  readonly riskFreeRate: NonNegativeNumber;
  readonly erp: NonNegativeNumber;
  readonly beta: PositiveNumber;
  readonly countryRiskPremium: NonNegativeNumber;
  readonly taxRate: UnitInterval;
  readonly preTaxCostOfDebt: NonNegativeNumber;
  readonly equityWeight: UnitInterval;
};

export type WaccRawInputs = { readonly [K in keyof WaccInputs]: number };

export type WaccResult = {
  readonly wacc: number;
  readonly costOfEquity: number;
  readonly afterTaxCostOfDebt: number;
  readonly inputsUsed: WaccInputs;
};

export function computeWacc(inputs: WaccInputs): WaccResult {
  const { riskFreeRate, erp, beta, countryRiskPremium, taxRate, preTaxCostOfDebt, equityWeight } =
    inputs;

  const costOfEquity = riskFreeRate + beta * (erp + countryRiskPremium);
  const afterTaxCostOfDebt = preTaxCostOfDebt * (1 - taxRate);
  const wacc = equityWeight * costOfEquity + (1 - equityWeight) * afterTaxCostOfDebt;

  return {
    wacc,
    costOfEquity,
    afterTaxCostOfDebt,
    inputsUsed: inputs,
  };
}

export function parseWaccInputs(raw: WaccRawInputs): Result<WaccInputs, ValidationError> {
  const riskFreeRate = parseNonNegativeNumber(raw.riskFreeRate, "riskFreeRate");
  if (!riskFreeRate.ok) {
    return riskFreeRate;
  }

  const erp = parseNonNegativeNumber(raw.erp, "erp");
  if (!erp.ok) {
    return erp;
  }

  const beta = parsePositiveNumber(raw.beta, "beta");
  if (!beta.ok) {
    return beta;
  }

  const countryRiskPremium = parseNonNegativeNumber(raw.countryRiskPremium, "countryRiskPremium");
  if (!countryRiskPremium.ok) {
    return countryRiskPremium;
  }

  const taxRate = parseUnitInterval(raw.taxRate, "taxRate");
  if (!taxRate.ok) {
    return taxRate;
  }

  const preTaxCostOfDebt = parseNonNegativeNumber(raw.preTaxCostOfDebt, "preTaxCostOfDebt");
  if (!preTaxCostOfDebt.ok) {
    return preTaxCostOfDebt;
  }

  const equityWeight = parseUnitInterval(raw.equityWeight, "equityWeight");
  if (!equityWeight.ok) {
    return equityWeight;
  }

  return ok({
    riskFreeRate: riskFreeRate.value,
    erp: erp.value,
    beta: beta.value,
    countryRiskPremium: countryRiskPremium.value,
    taxRate: taxRate.value,
    preTaxCostOfDebt: preTaxCostOfDebt.value,
    equityWeight: equityWeight.value,
  });
}
