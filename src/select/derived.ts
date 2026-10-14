import type { Company, OtherClaims } from "../domain/company.ts";

/** Price is reporting currency per share and shares are millions, so the product is millions. */
export type Derived = {
  readonly marketCap: number;
  readonly enterpriseValue: number;
  readonly netDebt: number;
  readonly otherClaims: OtherClaims;
};

/**
 * Enterprise value includes lease liabilities: EBIT and EBITDA are reported
 * after IFRS 16, so the current multiples compare like with like, as peer
 * figures usually do.
 */
export function selectDerived(company: Company): Derived {
  const marketCap = company.market.price * company.market.shares;
  const leases = company.otherClaims.operatingLeaseLiabilities ?? 0;
  return {
    marketCap,
    enterpriseValue: marketCap + company.netDebt + leases,
    netDebt: company.netDebt,
    otherClaims: company.otherClaims,
  };
}
