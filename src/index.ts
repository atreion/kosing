export {
  computeDcf,
  type DcfAssumptions,
  type DcfInputs,
  type DcfNote,
  type DcfResult,
  type ExitMultipleBasis,
  type TerminalValueMethod,
  type YearAssumptions,
  type YearlyCashFlow,
} from "./dcf.ts";
export {
  type DcfRawAssumptions,
  type DcfRawInputs,
  type DcfRawTerminalValueMethod,
  type DcfValidationError,
  parseDcfAssumptions,
  parseDcfInputs,
  type TerminalGrowthNotBelowWaccError,
} from "./dcf-parse.ts";
// The valuator's decode surface. The domain's DcfAssumptions is not exported
// here yet: it collides with dcf.ts's until plan 2 migrates the math.
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
  Period,
  ReportedFiscalYear,
  ReportedLtm,
  ReportedPeriod,
} from "./domain/financials.ts";
export type { Basis, Classification, Currency, IsoDate, NonEmpty, Unit } from "./domain/types.ts";
export type {
  CyclicalAssumptions,
  CyclicalRevenueBase,
  Holding,
  NavAssumptions,
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
export { err, ok, type Result } from "./result.ts";
export {
  type NonNegativeInteger,
  type NonNegativeNumber,
  type NotNonNegativeError,
  type NotNonNegativeIntegerError,
  type NotPositiveError,
  type NotPositiveIntegerError,
  type NotUnitIntervalError,
  type PositiveInteger,
  type PositiveNumber,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  parsePathLength,
  parsePositiveInteger,
  parsePositiveNumber,
  parseUnitInterval,
  type UnitInterval,
  type ValidationError,
  type WrongLengthError,
} from "./validate.ts";
export {
  computeWacc,
  parseWaccInputs,
  type WaccInputs,
  type WaccRawInputs,
  type WaccResult,
} from "./wacc.ts";
