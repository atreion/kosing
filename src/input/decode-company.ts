/**
 * facts.json to Company. Everything the domain can build from facts alone,
 * normalised to reporting currency and millions, with every fallback
 * recorded as a Resolution.
 */

import type { Company, CostOfCapital, Market } from "../domain/company.ts";
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

type ReportedRow = Facts["financials"]["fiscalYears"][number];

function toReportedPeriod(row: Omit<ReportedRow, "fy">, scale: Scale): ReportedPeriod {
  return {
    revenue: scale.nullable(row.revenue),
    ebit: scale.nullable(row.ebit),
    netIncome: scale.nullable(row.netIncome),
    ebitda: scale.nullable(row.ebitda),
    depreciationAmortization: scale.nullable(row.depreciationAmortization),
    ocf: scale.nullable(row.ocf),
    capex: scale.nullable(row.capex),
    fcf: scale.nullable(row.fcf),
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
 * Price converts into reporting currency using the pair in either direction;
 * the schema guarantees one exists. The share count prefers diluted, and a
 * diluted count of zero is a share count, which is why the check is === null.
 */
function decodeMarket(facts: Facts, resolutions: Resolution[]): Market {
  const { market } = facts;
  let price = market.price;
  if (market.priceCurrency !== facts.currency) {
    const direct = `${market.priceCurrency}${facts.currency}`;
    const inverse = `${facts.currency}${market.priceCurrency}`;
    const spot = facts.fx?.spotRates.find((s) => s.pair === direct || s.pair === inverse);
    if (spot === undefined) throw new Error("unreachable: the schema requires the pair");
    const inverted = spot.pair === inverse;
    price = inverted ? price / spot.rate : price * spot.rate;
    resolutions.push({
      kind: "priceConvertedToReporting",
      pair: spot.pair,
      rate: spot.rate,
      inverted,
    });
  }
  let shares = market.sharesDilutedM;
  if (shares === null) {
    shares = market.sharesOutstandingM;
    resolutions.push({ kind: "sharesFromOutstanding", value: shares });
  }
  return {
    price,
    shares,
    week52High: market.week52High,
    week52Low: market.week52Low,
    asOf: market.asOf,
  };
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
  });
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
  const netDebt = totalDebt - cash - (shortTermInvestments ?? 0);
  resolutions.push({
    kind: "netDebtDerived",
    totalDebt,
    cash,
    shortTermInvestments: shortTermInvestments ?? 0,
  });

  const company: Company = {
    identity: { ...facts.company },
    currency: facts.currency,
    asOf: facts.asOf,
    market: decodeMarket(facts, resolutions),
    financials: decodeFinancials(facts.financials, scale),
    balanceSheet: {
      asOf: bs.asOf,
      cashAndEquivalents: cash,
      shortTermInvestments,
      totalDebt,
      shortTermDebt: scale.nullable(bs.shortTermDebt),
      longTermDebt: scale.nullable(bs.longTermDebt),
      goodwill: scale.nullable(bs.goodwill),
      intangiblesExGoodwill: scale.nullable(bs.intangiblesExGoodwill),
    },
    netDebt,
    otherClaims: {
      operatingLeaseLiabilities: scale.nullable(bs.operatingLeaseLiabilities),
      pensionObligations: scale.nullable(bs.pensionObligations),
    },
    costOfCapital: costOfCapital.data,
    historicalRanges: facts.historicalRanges
      ? {
          sharePrice: facts.historicalRanges.sharePrice,
          peTrailing: facts.historicalRanges.peTrailing,
          evEbit: facts.historicalRanges.evEbit,
          evEbitda: facts.historicalRanges.evEbitda,
          priceBook: facts.historicalRanges.priceBook,
        }
      : null,
    peers: (facts.peers ?? []).map(({ sourceRef: _s, ...peer }) => peer),
    estimates: (facts.estimates ?? []).map(({ sourceRef: _s, ...estimate }) => estimate),
    holdings: facts.holdings
      ? {
          items: facts.holdings.items.map((h) => ({
            name: h.name,
            fairValue: scale.nullable(h.fairValue),
            basis: h.basis,
          })),
          parentNetDebt: scale.required(facts.holdings.parentNetDebt),
          lookThroughNav: scale.nullable(facts.holdings.lookThroughNav),
        }
      : null,
    fx: facts.fx
      ? {
          spotRates: facts.fx.spotRates.map(({ sourceRef: _s, ...spot }) => spot),
          exposures: facts.fx.exposures,
        }
      : null,
  };
  return decoded({ company, resolutions });
}
