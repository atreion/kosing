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
  readonly countryPremium: NonNegativeNumber;
  readonly taxRate: UnitInterval;
  readonly pretaxCostOfDebt: NonNegativeNumber;
  readonly weightEquity: UnitInterval;
};

export type WaccRawInputs = { readonly [K in keyof WaccInputs]: number };

export type WaccResult = {
  readonly wacc: number;
  readonly costOfEquity: number;
  readonly costOfDebtAfterTax: number;
  readonly inputsUsed: WaccInputs;
};

export function computeWacc(inputs: WaccInputs): WaccResult {
  const { riskFreeRate, erp, beta, countryPremium, taxRate, pretaxCostOfDebt, weightEquity } =
    inputs;

  const costOfEquity = riskFreeRate + beta * (erp + countryPremium);
  const costOfDebtAfterTax = pretaxCostOfDebt * (1 - taxRate);
  const wacc = weightEquity * costOfEquity + (1 - weightEquity) * costOfDebtAfterTax;

  return {
    wacc,
    costOfEquity,
    costOfDebtAfterTax,
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

  const countryPremium = parseNonNegativeNumber(raw.countryPremium, "countryPremium");
  if (!countryPremium.ok) {
    return countryPremium;
  }

  const taxRate = parseUnitInterval(raw.taxRate, "taxRate");
  if (!taxRate.ok) {
    return taxRate;
  }

  const pretaxCostOfDebt = parseNonNegativeNumber(raw.pretaxCostOfDebt, "pretaxCostOfDebt");
  if (!pretaxCostOfDebt.ok) {
    return pretaxCostOfDebt;
  }

  const weightEquity = parseUnitInterval(raw.weightEquity, "weightEquity");
  if (!weightEquity.ok) {
    return weightEquity;
  }

  return ok({
    riskFreeRate: riskFreeRate.value,
    erp: erp.value,
    beta: beta.value,
    countryPremium: countryPremium.value,
    taxRate: taxRate.value,
    pretaxCostOfDebt: pretaxCostOfDebt.value,
    weightEquity: weightEquity.value,
  });
}
