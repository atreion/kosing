/**
 * facts.json + case.json to Valuation. This is where the cross-document
 * rules become consequences of construction: the domain's Valuation requires
 * what the wire leaves nullable, so anything that would make a selector
 * partial is rejected here with a path into the file that needs fixing.
 */

import type { Company } from "../domain/company.ts";
import type {
  FiscalYear,
  OperatingFinancials,
  OperatingLtm,
  Period,
  ReportedPeriod,
} from "../domain/financials.ts";
import { isNonEmpty, type NonEmpty } from "../domain/types.ts";
import {
  type CommodityModel,
  type CyclicalRevenueBase,
  type MineNavPart,
  type NavPart,
  type ScenarioTriple,
  STAGE_RISK_FACTOR,
  type Valuation,
} from "../domain/valuation.ts";
import { assertNever } from "../exhaustive.ts";
import { type Case, DEFAULT_SENSITIVITY_STEPS } from "./case.ts";
import {
  type DecodeError,
  type DecodeResult,
  decoded,
  decodeError,
  failed,
  type Resolution,
} from "./errors.ts";
import type { Facts } from "./facts.ts";

function checkTicker(facts: Facts, c: Case): DecodeError[] {
  if (c.ticker === facts.company.ticker) return [];
  return [
    decodeError(
      "case",
      "semantic.tickerMismatch",
      "ticker",
      `case is for ${c.ticker}, facts are for ${facts.company.ticker}`,
    ),
  ];
}

function checkSourceRefs(facts: Facts, c: Case): DecodeError[] {
  const ids = new Set(facts.sources.map((s) => s.id));
  return c.method.sourceRefs.flatMap((id, i) =>
    ids.has(id)
      ? []
      : [
          decodeError(
            "case",
            "semantic.sourceRef",
            `method.sourceRefs.${i}`,
            `source ${id} is not in facts.sources`,
          ),
        ],
  );
}

/** Narrows reported figures to a Period, or says which figure is missing. */
function toPeriod(period: ReportedPeriod, path: string): DecodeResult<Period> {
  const errors: DecodeError[] = [];
  if (period.revenue === null) {
    errors.push(
      decodeError(
        "facts",
        "semantic.periodMissingFigure",
        `${path}.revenue`,
        "revenue is required for this method",
      ),
    );
  }
  if (period.ebit === null) {
    errors.push(
      decodeError(
        "facts",
        "semantic.periodMissingFigure",
        `${path}.ebit`,
        "ebit is required for this method",
      ),
    );
  }
  if (period.revenue === null || period.ebit === null) return failed(errors);
  return decoded({ ...period, revenue: period.revenue, ebit: period.ebit });
}

/** Every missing figure is reported, not just the first. */
function toOperatingFinancials(company: Company): DecodeResult<OperatingFinancials> {
  const errors: DecodeError[] = [];
  const years: FiscalYear[] = [];
  for (const [i, year] of company.financials.fiscalYears.entries()) {
    const period = toPeriod(year, `financials.fiscalYears.${i}`);
    if (period.success) years.push({ ...period.data, fy: year.fy, endDate: year.endDate });
    else errors.push(...period.error);
  }
  let ltm: OperatingLtm | null = null;
  if (company.financials.ltm !== null) {
    const reported = company.financials.ltm;
    const period = toPeriod(reported, "financials.ltm");
    if (period.success) ltm = { ...period.data, endDate: reported.endDate };
    else errors.push(...period.error);
  }
  if (errors.length > 0) return failed(errors);
  if (!isNonEmpty(years)) throw new Error("unreachable: fiscalYears is NonEmpty");
  return decoded({ ltm, fiscalYears: years });
}

type RevenueBasePolicy = Extract<Case["method"], { kind: "normalisedEarnings" }>["revenueBase"];

function resolveRevenueBase(
  policy: RevenueBasePolicy,
  financials: OperatingFinancials,
  resolutions: Resolution[],
): DecodeResult<CyclicalRevenueBase> {
  switch (policy.kind) {
    case "ltm": {
      if (financials.ltm === null) {
        return failed([
          decodeError(
            "case",
            "semantic.revenueBaseUnsatisfiable",
            "method.revenueBase",
            "policy is ltm but facts carry no ltm row",
          ),
        ]);
      }
      resolutions.push({ kind: "revenueBaseFromLtm" });
      return decoded({ kind: "ltm", period: financials.ltm });
    }
    case "averageFy": {
      const window = financials.fiscalYears.slice(-policy.years);
      if (window.length < policy.years || !isNonEmpty(window)) {
        return failed([
          decodeError(
            "case",
            "semantic.revenueBaseUnsatisfiable",
            "method.revenueBase",
            `policy asks for ${policy.years} fiscal years, facts carry ${financials.fiscalYears.length}`,
          ),
        ]);
      }
      const last = window.at(-1) ?? window[0];
      resolutions.push({ kind: "revenueBaseAveraged", fromFy: window[0].fy, toFy: last.fy });
      return decoded({ kind: "averageFy", window });
    }
    default:
      return assertNever(policy);
  }
}

type NavInputs = {
  parts: NonEmpty<NavPart>;
  hasScenarios: boolean;
  parentNetDebt: number;
  lookThroughNav: number | null;
};

type NavCaseParts = NonNullable<Extract<Case["method"], { kind: "nav" }>["parts"]>;
type NavCasePart = NavCaseParts[number];
type FactsHoldings = NonNullable<Company["holdings"]>;
type FactsHolding = FactsHoldings["items"][number];

function flat(value: number): ScenarioTriple {
  return { bear: value, base: value, bull: value };
}

function scaled(triple: ScenarioTriple, by: (v: number) => number): ScenarioTriple {
  return { bear: by(triple.bear), base: by(triple.base), bull: by(triple.bull) };
}

function withoutValue(i: number, h: FactsHolding): DecodeError {
  return decodeError(
    "facts",
    "semantic.holdingWithoutValue",
    `holdings.items.${i}.fairValue`,
    `holding "${h.name}" has no fair value`,
  );
}

/** Every facts holding at its fair value, the method's behaviour before parts. */
function factsHoldingParts(holdings: FactsHoldings): DecodeResult<NavPart[]> {
  if (!isNonEmpty(holdings.items)) {
    return failed([
      decodeError(
        "facts",
        "semantic.navRequiresHoldings",
        "holdings.items",
        "a nav case needs at least one holding",
      ),
    ]);
  }
  const errors: DecodeError[] = [];
  const parts: NavPart[] = [];
  for (const [i, h] of holdings.items.entries()) {
    if (h.fairValue === null) errors.push(withoutValue(i, h));
    else {
      parts.push({
        name: h.name,
        kind: "factsFairValue",
        holding: h.name,
        value: flat(h.fairValue),
      });
    }
  }
  return errors.length > 0 ? failed(errors) : decoded(parts);
}

/** Converts an amount in `currency` into the reporting currency. */
function toReportingCurrency(
  company: Company,
  currency: string,
  part: string,
  resolutions: Resolution[],
): DecodeResult<(value: number) => number> {
  if (currency === company.currency) return decoded((v) => v);
  const direct = `${currency}${company.currency}`;
  const inverse = `${company.currency}${currency}`;
  const spot = company.fx?.spotRates.find((r) => r.pair === direct || r.pair === inverse);
  if (spot === undefined) {
    return failed([
      decodeError(
        "facts",
        "semantic.navPartNeedsSpotRate",
        "fx.spotRates",
        `nav part "${part}" is in ${currency}; fx needs ${direct} or ${inverse}`,
      ),
    ]);
  }
  const inverted = spot.pair === inverse;
  resolutions.push({ kind: "navPartConverted", part, pair: spot.pair, rate: spot.rate, inverted });
  return decoded(inverted ? (v) => v / spot.rate : (v) => v * spot.rate);
}

/** The facts holding a part accounts for, or null for a part that adds an asset of its own. */
function referencedHolding(part: NavCasePart): string | null {
  switch (part.kind) {
    case "factsFairValue":
    case "lookThrough":
    case "excluded":
    case "analystValue":
      return part.holding;
    case "segment":
    case "mine":
    case "inventory":
      return null;
    default:
      return assertNever(part);
  }
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

type MineCasePart = Extract<NavCasePart, { kind: "mine" }>;

/** A mine as the domain carries it; a year before the facts' year is a stale plan. */
function toMinePart(
  part: MineCasePart,
  index: number,
  factsYear: number,
): DecodeResult<MineNavPart> {
  const stale = [
    ...part.production.map((r, i) => ({ year: r.year, path: `production.${i}.year` })),
    ...part.initialCapex.map((r, i) => ({ year: r.year, path: `initialCapex.${i}.year` })),
  ].filter((r) => r.year < factsYear);
  if (stale.length > 0) {
    return failed(
      stale.map((r) =>
        decodeError(
          "case",
          "semantic.mineYearBeforeFacts",
          `method.parts.${index}.${r.path}`,
          `${r.year} is before the facts' year ${factsYear}; carry only what remains`,
        ),
      ),
    );
  }
  const [first, ...rest] = part.production;
  if (first === undefined) throw new Error("unreachable: the schema requires a production year");
  return decoded({
    name: part.name,
    kind: "mine",
    stage: part.stage,
    ownership: part.ownership,
    riskFactor: part.riskFactor ?? STAGE_RISK_FACTOR[part.stage],
    product: part.product,
    production: [first, ...rest],
    byProducts: part.byProducts,
    recoverableReserve: part.recoverableReserve,
    cashCostPerUnit: part.cashCostPerUnit,
    royaltyRate: part.royaltyRate,
    royaltySteps: part.royaltySteps,
    sustainingCapexPerUnit: part.sustainingCapexPerUnit,
    initialCapex: part.initialCapex,
    openingTaxBase: part.openingTaxBase,
    closureCost: part.closureCost,
    taxRate: part.taxRate,
    delayYears: part.delayYears,
  });
}

type CaseCommodity = NonNullable<Extract<Case["method"], { kind: "nav" }>["commodity"]>;

function toCommodityModel(
  company: Company,
  commodity: CaseCommodity,
  resolutions: Resolution[],
): DecodeResult<CommodityModel> {
  const rate = toReportingCurrency(company, "USD", "mines", resolutions);
  if (!rate.success) return failed(rate.error);
  const book = commodity.contractBook;
  return decoded({
    name: commodity.name,
    unit: commodity.unit,
    priceDeck: commodity.priceDeck,
    otherProducts: commodity.otherProducts.map((p) => ({
      name: p.name,
      unit: p.unit,
      priceDeck: p.priceDeck,
    })),
    usdRiskFree: commodity.discount.usdRiskFree,
    usdInflation: commodity.discount.usdInflation,
    contractBook:
      book === null
        ? null
        : {
            taxRate: book.taxRate,
            blocks: book.blocks.map((b) => ({
              fromYear: b.fromYear,
              toYear: b.toYear,
              volumePerYear: b.volumePerYear,
              pricing: b.pricing,
            })),
          },
    usdToReporting: rate.data(1),
  });
}

function valuePart(
  company: Company,
  part: NavCasePart,
  index: number,
  held: { readonly index: number; readonly item: FactsHolding } | null,
  resolutions: Resolution[],
): DecodeResult<NavPart | null> {
  switch (part.kind) {
    case "excluded":
      resolutions.push({ kind: "navHoldingExcluded", holding: part.holding });
      return decoded(null);
    case "factsFairValue": {
      if (held === null) throw new Error("unreachable: an unknown holding was rejected first");
      if (held.item.fairValue === null) return failed([withoutValue(held.index, held.item)]);
      return decoded({
        name: part.holding,
        kind: "factsFairValue",
        holding: part.holding,
        value: flat(held.item.fairValue),
      });
    }
    case "lookThrough": {
      const convert = toReportingCurrency(company, part.currency, part.holding, resolutions);
      if (!convert.success) return failed(convert.error);
      return decoded({
        name: part.holding,
        kind: "lookThrough",
        holding: part.holding,
        value: scaled(part.valuePerShare, (v) => convert.data(v * part.sharesM)),
      });
    }
    case "mine":
      return toMinePart(part, index, yearOf(company.asOf));
    case "inventory":
      return decoded({
        name: part.name,
        kind: "inventory",
        volume: part.volume,
        costPerUnit: part.costPerUnit,
        taxRate: part.taxRate,
      });
    case "segment":
      return decoded({
        name: part.name,
        kind: "segment",
        holding: null,
        value: scaled(part.multiple, (m) => m * part.metricValue),
      });
    case "analystValue":
      return decoded({
        name: part.name,
        kind: "analystValue",
        holding: part.holding,
        value: part.value,
      });
    default:
      return assertNever(part);
  }
}

/**
 * The case's sum of the parts against the facts' holdings: each named holding
 * must exist, and each facts holding is accounted for exactly once, so a stake
 * cannot be silently dropped or counted twice.
 */
function caseParts(
  company: Company,
  holdings: FactsHoldings,
  parts: NavCaseParts,
  resolutions: Resolution[],
): DecodeResult<NavPart[]> {
  const errors: DecodeError[] = [];
  const valued: NavPart[] = [];
  const seen = new Set<string>();
  for (const [i, part] of parts.entries()) {
    const name = referencedHolding(part);
    let held: { index: number; item: FactsHolding } | null = null;
    if (name !== null) {
      const index = holdings.items.findIndex((h) => h.name === name);
      const item = holdings.items[index];
      if (item === undefined) {
        errors.push(
          decodeError(
            "case",
            "semantic.navPartUnknownHolding",
            `method.parts.${i}.holding`,
            `"${name}" is not in the facts' holdings.items`,
          ),
        );
        continue;
      }
      if (seen.has(name)) {
        errors.push(
          decodeError(
            "case",
            "semantic.navHoldingTwice",
            `method.parts.${i}.holding`,
            `"${name}" is already accounted for by an earlier part`,
          ),
        );
        continue;
      }
      seen.add(name);
      held = { index, item };
    }
    const v = valuePart(company, part, i, held, resolutions);
    if (!v.success) errors.push(...v.error);
    else if (v.data !== null) valued.push(v.data);
  }
  const unaccounted = holdings.items.filter((h) => !seen.has(h.name)).map((h) => h.name);
  if (unaccounted.length > 0) {
    errors.push(
      decodeError(
        "case",
        "semantic.navHoldingUnaccounted",
        "method.parts",
        `no part accounts for ${unaccounted.map((n) => `"${n}"`).join(", ")}; value or exclude each`,
      ),
    );
  }
  if (errors.length > 0) return failed(errors);
  if (valued.length === 0) {
    return failed([
      decodeError(
        "case",
        "semantic.navRequiresParts",
        "method.parts",
        "every part is excluded, so nothing is valued",
      ),
    ]);
  }
  return decoded(valued);
}

/**
 * A company that is not a holding company (a miner valued by its mines) has no
 * holdings block; its parts then reference no holding and its net debt is the
 * balance sheet's.
 */
function balanceSheetHoldings(
  company: Company,
  parts: NavCaseParts | null,
  resolutions: Resolution[],
): FactsHoldings | null {
  if (parts === null || parts.some((p) => referencedHolding(p) !== null)) return null;
  resolutions.push({ kind: "navNetDebtFromBalanceSheet", netDebt: company.netDebt });
  return { items: [], parentNetDebt: company.netDebt, lookThroughNav: null };
}

function toNavInputs(
  company: Company,
  parts: NavCaseParts | null,
  resolutions: Resolution[],
): DecodeResult<NavInputs> {
  const holdings = company.holdings ?? balanceSheetHoldings(company, parts, resolutions);
  if (holdings === null) {
    return failed([
      decodeError(
        "facts",
        "semantic.navRequiresHoldings",
        "holdings",
        "a nav case needs a holdings block",
      ),
    ]);
  }
  const valued =
    parts === null ? factsHoldingParts(holdings) : caseParts(company, holdings, parts, resolutions);
  if (!valued.success) return failed(valued.error);
  if (!isNonEmpty(valued.data)) throw new Error("unreachable: an empty set of parts was rejected");
  return decoded({
    parts: valued.data,
    hasScenarios: parts !== null,
    parentNetDebt: holdings.parentNetDebt,
    lookThroughNav: holdings.lookThroughNav,
  });
}

function sensitivitySteps(steps: readonly number[] | undefined): NonEmpty<number> {
  const chosen = steps ?? DEFAULT_SENSITIVITY_STEPS;
  if (!isNonEmpty(chosen)) throw new Error("unreachable: the schema requires a step");
  return chosen;
}

/** Written out rather than spread so the wire's rationale stays out of the domain. */
function scenarioPaths(s: { revenueGrowthPath: number[]; ebitMarginPath: number[] }) {
  return { revenueGrowthPath: s.revenueGrowthPath, ebitMarginPath: s.ebitMarginPath };
}

export function decodeValuation(
  facts: Facts,
  investmentCase: Case,
  company: Company,
): DecodeResult<{ valuation: Valuation; resolutions: Resolution[] }> {
  const preface = [
    ...checkTicker(facts, investmentCase),
    ...checkSourceRefs(facts, investmentCase),
  ];
  if (preface.length > 0) return failed(preface);

  if (company.financialInstitution !== null && investmentCase.method.kind !== "excessReturn") {
    return failed([
      decodeError(
        "facts",
        "semantic.financialInstitutionNeedsExcessReturn",
        "financialInstitution",
        "a bank or insurer is valued by excessReturn only",
      ),
    ]);
  }

  const resolutions: Resolution[] = [];
  const { method, overrides, sensitivity } = investmentCase;

  switch (method.kind) {
    case "dcf": {
      const financials = toOperatingFinancials(company);
      if (!financials.success) return failed(financials.error);
      let costOfCapital = company.costOfCapital;
      if (overrides.beta !== null) {
        resolutions.push({ kind: "betaOverridden", from: costOfCapital.beta, to: overrides.beta });
        // The alternative is the beta facts resolved, so results show what the override changed.
        const alternativeBeta = costOfCapital.beta === overrides.beta ? null : costOfCapital.beta;
        costOfCapital = { ...costOfCapital, beta: overrides.beta, alternativeBeta };
      }
      if (overrides.wacc !== null) resolutions.push({ kind: "waccOverridden", to: overrides.wacc });
      if (overrides.taxRate !== null) {
        resolutions.push({
          kind: "taxRateOverridden",
          from: costOfCapital.taxRateForCashFlows,
          to: overrides.taxRate,
        });
        costOfCapital = { ...costOfCapital, taxRateForCashFlows: overrides.taxRate };
      }
      // Written out rather than spread so the wire's `basis` rationale stays out of the domain.
      const terminal =
        method.terminal.kind === "perpetuityGrowth"
          ? { kind: "perpetuityGrowth" as const, growth: method.terminal.growth }
          : {
              kind: "exitMultiple" as const,
              multiple: method.terminal.multiple,
              on: method.terminal.on,
            };
      return decoded({
        valuation: {
          method: "dcf",
          financials: financials.data,
          costOfCapital,
          waccOverride: overrides.wacc,
          assumptions: {
            revenueGrowthPath: method.revenueGrowthPath,
            ebitMarginPath: method.ebitMarginPath,
            capexPctRevenuePath: method.capexPctRevenuePath,
            daPctRevenuePath: method.daPctRevenuePath,
            workingCapitalPctRevenue: method.workingCapitalPctRevenue,
            terminal,
            scenarios:
              method.scenarios === null
                ? null
                : {
                    bear: scenarioPaths(method.scenarios.bear),
                    bull: scenarioPaths(method.scenarios.bull),
                  },
          },
          sensitivity: {
            waccSteps: sensitivitySteps(sensitivity?.waccSteps),
            terminalGrowthSteps: sensitivitySteps(sensitivity?.terminalGrowthSteps),
          },
        },
        resolutions,
      });
    }
    case "normalisedEarnings": {
      const financials = toOperatingFinancials(company);
      if (!financials.success) return failed(financials.error);
      const revenueBase = resolveRevenueBase(method.revenueBase, financials.data, resolutions);
      if (!revenueBase.success) return failed(revenueBase.error);
      return decoded({
        valuation: {
          method: "normalisedEarnings",
          financials: financials.data,
          revenueBase: revenueBase.data,
          assumptions: {
            ebitMargin: method.ebitMargin,
            evEbitMultiple: method.evEbitMultiple,
            multipleCeiling: method.multipleCeiling,
          },
        },
        resolutions,
      });
    }
    case "nav": {
      const holdings = toNavInputs(company, method.parts, resolutions);
      const commodity =
        method.commodity === null
          ? decoded(null)
          : toCommodityModel(company, method.commodity, resolutions);
      if (!holdings.success || !commodity.success) {
        return failed([...(holdings.error ?? []), ...(commodity.error ?? [])]);
      }
      return decoded({
        valuation: {
          method: "nav",
          ...holdings.data,
          assumptions: { warrantedDiscount: method.warrantedDiscount },
          commodity: commodity.data,
        },
        resolutions,
      });
    }
    case "excessReturn": {
      const fi = company.financialInstitution;
      if (fi === null) {
        return failed([
          decodeError(
            "facts",
            "semantic.excessReturnNeedsFinancialInstitution",
            "financialInstitution",
            "an excessReturn case needs the financialInstitution block in the facts",
          ),
        ]);
      }
      return decoded({
        valuation: {
          method: "excessReturn",
          tangibleBook: fi.tangibleBookEquity,
          costOfCapital: company.costOfCapital,
          assumptions: {
            rotePath: method.rotePath,
            payoutRatio: method.payoutRatio,
            terminalGrowth: method.terminal.growth,
            scenarios:
              method.scenarios === null
                ? null
                : {
                    bear: { rotePath: method.scenarios.bear.rotePath },
                    bull: { rotePath: method.scenarios.bull.rotePath },
                  },
          },
        },
        resolutions,
      });
    }
    default:
      return assertNever(method);
  }
}
