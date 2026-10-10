import type { CostOfCapital } from "../domain/company.ts";
import type { WaccInputs } from "../math/wacc.ts";

/** The discount rate's tax shield uses the discounting rate; cash flows use the other one. */
export function selectWacc(c: CostOfCapital): WaccInputs {
  return {
    riskFree: c.riskFree,
    erp: c.erp,
    beta: c.beta,
    countryPremium: c.countryPremium,
    preTaxCostOfDebt: c.preTaxCostOfDebt,
    taxRate: c.taxRateForDiscounting,
    equityWeight: c.equityWeight,
    debtWeight: c.debtWeight,
  };
}
