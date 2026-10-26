/**
 * facts.json to Company. Everything the domain can build from facts alone,
 * normalised to reporting currency and millions, with every fallback
 * recorded as a Resolution.
 */

import type {
  Company,
  CostOfCapital,
  FinancialInstitution,
  Market,
  RangeBand,
} from "../domain/company.ts";
import type { Financials, ReportedFiscalYear, ReportedPeriod } from "../domain/financials.ts";
import { isNonEmpty, type Unit } from "../domain/types.ts";
import { type DecodeResult, decoded, decodeError, failed, type Resolution } from "./errors.ts";
import type { Facts } from "./facts.ts";

const DIVISOR: Record<Exclude<Unit, "millions">, number> = { thousands: 1_000, ones: 1_000_000 };

type Scale = {
  readonly nullable: (value: number | null) => number | null;
  readonly required: (value: number) => number;
};

function scaleBy(unit: Unit): Scale {
  if (unit === "millions") return { nullable: (v) => v, required: (v) => v };
  const divisor = DIVISOR[unit];
  return {
    nullable: (v) => (v === null ? null : v / divisor),
    required: (v) => v / divisor,
  };
}

type Convert = (value: number) => number;

/**
 * Quoted figures (the price, the 52-week range, the historical share-price
 * bands) are in the trading currency and convert into the reporting currency
 * through the spot rate, in either direction; the schema guarantees one
 * exists. Reported per-share figures such as eps are already in the
 * reporting currency and never pass through here.
 */
function quoteConversion(facts: Facts, resolutions: Resolution[]): Convert {
  const { priceCurrency } = facts.market;
  if (priceCurrency === facts.currency) return (v) => v;
  const direct = `${priceCurrency}${facts.currency}`;
  const inverse = `${facts.currency}${priceCurrency}`;
  const spot = facts.fx?.spotRates.find((s) => s.pair === direct || s.pair === inverse);
  if (spot === undefined) throw new Error("unreachable: the schema requires the pair");
  const inverted = spot.pair === inverse;
  resolutions.push({
    kind: "priceConvertedToReporting",
    pair: spot.pair,
    rate: spot.rate,
    inverted,
  });
  return inverted ? (v) => v / spot.rate : (v) => v * spot.rate;
}

function convertNullable(convert: Convert, value: number | null): number | null {
  return value === null ? null : convert(value);
}

function convertBand(convert: Convert, band: RangeBand): RangeBand {
  return {
    y5Low: convertNullable(convert, band.y5Low),
    y5High: convertNullable(convert, band.y5High),
    y10Low: convertNullable(convert, band.y10Low),
    y10High: convertNullable(convert, band.y10High),
  };
}

type ReportedRow = Facts["financials"]["fiscalYears"][number];

function toReportedPeriod(
  row: Omit<ReportedRow, "fy" | "sourceRef">,
  scale: Scale,
): ReportedPeriod {
  return {
    revenue: scale.nullable(row.revenue),
    ebit: scale.nullable(row.ebit),
    netIncome: scale.nullable(row.netIncome),
    ebitda: scale.nullable(row.ebitda),
    depreciationAmortization: scale.nullable(row.depreciationAmortization),
    ocf: scale.nullable(row.ocf),
    capex: scale.nullable(row.capex),
    fcf: scale.nullable(row.fcf),
    dividendsPaid: scale.nullable(row.dividendsPaid),
  };
}

function decodeFinancials(financials: Facts["financials"], scale: Scale): Financials {
  const years: ReportedFiscalYear[] = financials.fiscalYears
    .map((row) => ({ ...toReportedPeriod(row, scale), fy: row.fy, endDate: row.endDate }))
    .sort((a, b) => a.fy - b.fy);
  if (!isNonEmpty(years)) throw new Error("unreachable: the schema requires a fiscal year");
  const ltm = financials.ltm
    ? { ...toReportedPeriod(financials.ltm, scale), endDate: financials.ltm.endDate }
    : null;
  return { ltm, fiscalYears: years };
}

/**
 * The share count prefers diluted; a diluted count of zero is a share count,
 * not a missing one, which is exactly why it is an error rather than a fallback.
 */
function decodeMarket(
  facts: Facts,
  convert: Convert,
  resolutions: Resolution[],
): DecodeResult<Market> {
  const { market } = facts;
  let shares = market.sharesDilutedM;
  let suppliedBy: "market.sharesDilutedM" | "market.sharesOutstandingM" = "market.sharesDilutedM";
  if (shares === null) {
    shares = market.sharesOutstandingM;
    suppliedBy = "market.sharesOutstandingM";
    resolutions.push({ kind: "sharesFromOutstanding", value: shares });
  }
  if (shares === 0) {
    return failed([
      decodeError(
        "facts",
        "semantic.zeroShares",
        suppliedBy,
        "a share count of 0 cannot price a share",
      ),
    ]);
  }
  return decoded({
    price: convert(market.price),
    shares,
    week52High: convertNullable(convert, market.week52High),
    week52Low: convertNullable(convert, market.week52Low),
    asOf: market.asOf,
  });
}

function decodeCostOfCapital(
  raw: Facts["costOfCapital"],
  resolutions: Resolution[],
): DecodeResult<CostOfCapital> {
  let beta = raw.betaCompany;
  if (beta === null) {
    if (raw.betaSector === null) {
      return failed([
        decodeError(
          "facts",
          "semantic.noBeta",
          "costOfCapital.betaCompany",
          "neither betaCompany nor betaSector is given",
        ),
      ]);
    }
    beta = raw.betaSector;
    resolutions.push({ kind: "betaFromSector", value: beta });
  }
  let taxRateForDiscounting = raw.taxRateStatutory;
  if (taxRateForDiscounting === null) {
    taxRateForDiscounting = raw.taxRateEffective;
    resolutions.push({ kind: "taxRateFromEffective", value: taxRateForDiscounting });
  }
  return decoded({
    riskFree: raw.riskFreeRate,
    erp: raw.erp,
    beta,
    countryPremium: raw.countryPremium ?? 0,
    preTaxCostOfDebt: raw.pretaxCostOfDebt,
    equityWeight: raw.equityWeight,
    debtWeight: raw.debtWeight,
    taxRateForDiscounting,
    taxRateForCashFlows: raw.taxRateEffective,
    alternativeBeta: raw.betaCompany !== null ? raw.betaSector : null,
  });
}

function decodeFinancialInstitution(
  fi: NonNullable<Facts["financialInstitution"]>,
  scale: Scale,
): FinancialInstitution {
  const { sourceRefs: _s, ...rest } = fi;
  return {
    ...rest,
    tangibleBookEquity: scale.required(fi.tangibleBookEquity),
    at1Capital: scale.nullable(fi.at1Capital),
    at1Coupons: scale.nullable(fi.at1Coupons),
    riskWeightedAssets: scale.nullable(fi.riskWeightedAssets),
    netInterestIncome: scale.nullable(fi.netInterestIncome),
    niiSensitivity: scale.nullable(fi.niiSensitivity),
    contractualServiceMargin: scale.nullable(fi.contractualServiceMargin),
  };
}

export function decodeCompany(
  facts: Facts,
): DecodeResult<{ company: Company; resolutions: Resolution[] }> {
  const resolutions: Resolution[] = [];
  const scale = scaleBy(facts.unit);
  if (facts.unit !== "millions") {
    resolutions.push({ kind: "unitRescaled", from: facts.unit, divisor: DIVISOR[facts.unit] });
  }

  const costOfCapital = decodeCostOfCapital(facts.costOfCapital, resolutions);
  if (!costOfCapital.success) return failed(costOfCapital.error);

  const bs = facts.balanceSheet;
  const totalDebt = scale.required(bs.totalDebt);
  const cash = scale.required(bs.cashAndEquivalents);
  const shortTermInvestments = scale.nullable(bs.shortTermInvestments);
  const dividendPayable = scale.required(bs.dividendPayable);
  const netDebt = totalDebt - cash - (shortTermInvestments ?? 0) + dividendPayable;
  if (facts.financialInstitution === null) {
    resolutions.push({
      kind: "netDebtDerived",
      totalDebt,
      cash,
      shortTermInvestments: shortTermInvestments ?? 0,
      dividendPayable,
    });
  }

  const convert = quoteConversion(facts, resolutions);
  const market = decodeMarket(facts, convert, resolutions);
  if (!market.success) return failed(market.error);

  const company: Company = {
    identity: { ...facts.company },
    currency: facts.currency,
    asOf: facts.asOf,
    market: market.data,
    financials: decodeFinancials(facts.financials, scale),
    balanceSheet: {
      asOf: bs.asOf,
      cashAndEquivalents: cash,
      shortTermInvestments,
      totalDebt,
      dividendPayable,
      shortTermDebt: scale.nullable(bs.shortTermDebt),
      longTermDebt: scale.nullable(bs.longTermDebt),
      goodwill: scale.nullable(bs.goodwill),
      intangiblesExGoodwill: scale.nullable(bs.intangiblesExGoodwill),
      totalEquity: scale.nullable(bs.totalEquity),
    },
    netDebt,
    otherClaims: {
      operatingLeaseLiabilities: scale.nullable(bs.operatingLeaseLiabilities),
      pensionObligations: scale.nullable(bs.pensionObligations),
    },
    costOfCapital: costOfCapital.data,
    historicalRanges: facts.historicalRanges
      ? {
          sharePrice: convertBand(convert, facts.historicalRanges.sharePrice),
          peTrailing: facts.historicalRanges.peTrailing,
          evEbit: facts.historicalRanges.evEbit,
          evEbitda: facts.historicalRanges.evEbitda,
          priceBook: facts.historicalRanges.priceBook,
        }
      : null,
    peers: (facts.peers ?? []).map(({ sourceRef: _s, ...peer }) => peer),
    estimates: (facts.estimates ?? []).map((e) => ({
      fy: e.fy,
      revenue: scale.nullable(e.revenue),
      ebit: scale.nullable(e.ebit),
      eps: e.eps,
      basis: e.basis,
    })),
    holdings: facts.holdings
      ? {
          items: facts.holdings.items.map((h) => ({
            name: h.name,
            fairValue: scale.nullable(h.fairValue),
            basis: h.basis,
          })),
          parentNetDebt: scale.required(facts.holdings.parentNetDebt) + dividendPayable,
          lookThroughNav: scale.nullable(facts.holdings.lookThroughNav),
        }
      : null,
    fx: facts.fx
      ? {
          spotRates: facts.fx.spotRates.map(({ sourceRef: _s, ...spot }) => spot),
          exposures: facts.fx.exposures,
        }
      : null,
    financialInstitution: facts.financialInstitution
      ? decodeFinancialInstitution(facts.financialInstitution, scale)
      : null,
  };
  return decoded({ company, resolutions });
}
