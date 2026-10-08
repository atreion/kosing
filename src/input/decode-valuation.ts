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
  Period,
  ReportedPeriod,
} from "../domain/financials.ts";
import { isNonEmpty, type NonEmpty } from "../domain/types.ts";
import type { CyclicalRevenueBase, Holding, Valuation } from "../domain/valuation.ts";
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
  let ltm: Period | null = null;
  if (company.financials.ltm !== null) {
    const period = toPeriod(company.financials.ltm, "financials.ltm");
    if (period.success) ltm = period.data;
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
  holdings: NonEmpty<Holding>;
  parentNetDebt: number;
  lookThroughNav: number | null;
};

function toHoldings(company: Company): DecodeResult<NavInputs> {
  if (company.holdings === null) {
    return failed([
      decodeError(
        "facts",
        "semantic.navRequiresHoldings",
        "holdings",
        "a nav case needs a holdings block",
      ),
    ]);
  }
  if (!isNonEmpty(company.holdings.items)) {
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
  const holdings: Holding[] = [];
  for (const [i, h] of company.holdings.items.entries()) {
    if (h.fairValue === null) {
      errors.push(
        decodeError(
          "facts",
          "semantic.holdingWithoutValue",
          `holdings.items.${i}.fairValue`,
          `holding "${h.name}" has no fair value`,
        ),
      );
    } else {
      holdings.push({ name: h.name, fairValue: h.fairValue, basis: h.basis });
    }
  }
  if (errors.length > 0) return failed(errors);
  if (!isNonEmpty(holdings)) throw new Error("unreachable: items was NonEmpty and none failed");
  return decoded({
    holdings,
    parentNetDebt: company.holdings.parentNetDebt,
    lookThroughNav: company.holdings.lookThroughNav,
  });
}

function sensitivitySteps(steps: readonly number[] | undefined): NonEmpty<number> {
  const chosen = steps ?? DEFAULT_SENSITIVITY_STEPS;
  if (!isNonEmpty(chosen)) throw new Error("unreachable: the schema requires a step");
  return chosen;
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

  const resolutions: Resolution[] = [];
  const { method, overrides, sensitivity } = investmentCase;

  switch (method.kind) {
    case "dcf": {
      const financials = toOperatingFinancials(company);
      if (!financials.success) return failed(financials.error);
      let costOfCapital = company.costOfCapital;
      if (overrides.beta !== null) {
        resolutions.push({ kind: "betaOverridden", from: costOfCapital.beta, to: overrides.beta });
        costOfCapital = { ...costOfCapital, beta: overrides.beta };
      }
      if (overrides.wacc !== null) resolutions.push({ kind: "waccOverridden", to: overrides.wacc });
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
      const holdings = toHoldings(company);
      if (!holdings.success) return failed(holdings.error);
      return decoded({
        valuation: {
          method: "nav",
          ...holdings.data,
          assumptions: { warrantedDiscount: method.warrantedDiscount },
        },
        resolutions,
      });
    }
    default:
      return assertNever(method);
  }
}
