import type { IsoDate, NonEmpty } from "./types.ts";

/** As reported: every figure nullable, because a holding company has no revenue. */
export type ReportedPeriod = {
  readonly revenue: number | null;
  readonly ebit: number | null;
  readonly netIncome: number | null;
  readonly ebitda: number | null;
  readonly depreciationAmortization: number | null;
  readonly ocf: number | null;
  readonly capex: number | null;
  readonly fcf: number | null;
};

export type ReportedFiscalYear = ReportedPeriod & {
  readonly fy: number;
  readonly endDate: IsoDate;
};

/** The LTM row keeps its end date so the staleness warning can compare it. */
export type ReportedLtm = ReportedPeriod & { readonly endDate: IsoDate };

export type Financials = {
  readonly ltm: ReportedLtm | null;
  readonly fiscalYears: NonEmpty<ReportedFiscalYear>; // sorted oldest to newest
};

/** A period the math can use: revenue and EBIT are present by construction. */
export type Period = Omit<ReportedPeriod, "revenue" | "ebit"> & {
  readonly revenue: number;
  readonly ebit: number;
};

export type FiscalYear = Period & {
  readonly fy: number;
  readonly endDate: IsoDate;
};

export type OperatingFinancials = {
  readonly ltm: Period | null;
  readonly fiscalYears: NonEmpty<FiscalYear>;
};
