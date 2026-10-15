import type { Company, OtherClaims } from "../domain/company.ts";

/** Price is reporting currency per share and shares are millions, so the product is millions. */
export type Derived = {
  readonly marketCap: number;
  readonly enterpriseValue: number | null;
  /** Null for a bank or insurer: its cash is operating liquidity, not surplus, so net debt means nothing. */
  readonly netDebt: number | null;
  readonly otherClaims: OtherClaims;
};

/**
 * Enterprise value includes lease liabilities: EBIT and EBITDA are reported
 * after IFRS 16, so the current multiples compare like with like, as peer
 * figures usually do. A bank or insurer has no enterprise value: its
 * debt is its raw material.
 */
export function selectDerived(company: Company): Derived {
  const marketCap = company.market.price * company.market.shares;
  const leases = company.otherClaims.operatingLeaseLiabilities ?? 0;
  return {
    marketCap,
    enterpriseValue:
      company.financialInstitution === null ? marketCap + company.netDebt + leases : null,
    netDebt: company.financialInstitution === null ? company.netDebt : null,
    otherClaims: company.otherClaims,
  };
}
