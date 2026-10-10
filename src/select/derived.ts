import type { Company, OtherClaims } from "../domain/company.ts";

/** Price is reporting currency per share and shares are millions, so the product is millions. */
export type Derived = {
  readonly marketCap: number;
  readonly enterpriseValue: number;
  readonly netDebt: number;
  readonly otherClaims: OtherClaims;
};

export function selectDerived(company: Company): Derived {
  const marketCap = company.market.price * company.market.shares;
  return {
    marketCap,
    enterpriseValue: marketCap + company.netDebt,
    netDebt: company.netDebt,
    otherClaims: company.otherClaims,
  };
}
