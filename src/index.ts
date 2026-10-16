// The valuator's public surface. Everything the CLI does is callable in-process.
export type {
  BalanceSheet,
  Company,
  CostOfCapital,
  Estimate,
  Exposure,
  Fx,
  HistoricalRanges,
  Holdings,
  Identity,
  Market,
  OtherClaims,
  Peer,
  RangeBand,
  ReportedHolding,
  SpotRate,
} from "./domain/company.ts";
export type {
  Financials,
  FiscalYear,
  OperatingFinancials,
  OperatingLtm,
  Period,
  ReportedFiscalYear,
  ReportedLtm,
  ReportedPeriod,
} from "./domain/financials.ts";
export type { Basis, Classification, Currency, IsoDate, NonEmpty, Unit } from "./domain/types.ts";
export type {
  CyclicalAssumptions,
  CyclicalRevenueBase,
  DcfAssumptions,
  NavAssumptions,
  NavPart,
  NavPartKind,
  ScenarioTriple,
  SensitivityAxes,
  Terminal,
  Valuation,
} from "./domain/valuation.ts";
export type { Case } from "./input/case.ts";
export { type Decoded, decode } from "./input/decode.ts";
export type { DecodeError, DecodeResult, Resolution, Warning } from "./input/errors.ts";
export type { Facts } from "./input/facts.ts";
export { emitJsonSchema } from "./input/schema.ts";
export {
  computeDcf,
  type DcfInputs,
  type DcfOutcome,
  type DcfValue,
  type YearAssumptions,
  type YearRow,
} from "./math/dcf.ts";
export { computeWacc, type WaccInputs, type WaccResult } from "./math/wacc.ts";
export { assemble } from "./results/assemble.ts";
export {
  DEFAULT_VALUATOR_OPTIONS,
  type Results,
  type ValuationSection,
  type ValuatorOptions,
} from "./results/types.ts";
export { valuate } from "./valuate.ts";
