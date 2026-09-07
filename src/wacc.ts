import { collectResults, type Result } from "./result.ts";
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

export function parseWaccInputs(
  raw: WaccRawInputs,
): Result<WaccInputs, readonly ValidationError[]> {
  return collectResults({
    riskFreeRate: parseNonNegativeNumber(raw.riskFreeRate, "riskFreeRate"),
    erp: parseNonNegativeNumber(raw.erp, "erp"),
    beta: parsePositiveNumber(raw.beta, "beta"),
    countryRiskPremium: parseNonNegativeNumber(raw.countryRiskPremium, "countryRiskPremium"),
    taxRate: parseUnitInterval(raw.taxRate, "taxRate"),
    preTaxCostOfDebt: parseNonNegativeNumber(raw.preTaxCostOfDebt, "preTaxCostOfDebt"),
    equityWeight: parseUnitInterval(raw.equityWeight, "equityWeight"),
  });
}
