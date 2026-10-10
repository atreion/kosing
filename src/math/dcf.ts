/**
 * Unlevered DCF, textbook. Each year: revenue grows, EBIT is a margin, NOPAT
 * is EBIT after tax, FCFF = NOPAT + D&A - capex - change in working capital,
 * discounted at end of year. Terminal value by Gordon growth on the final
 * year's FCFF or by an exit multiple on the final year's EBIT, EBITDA or
 * FCFF, discounted with the final year's factor.
 *
 * The one precondition the formula has, growth < wacc, is returned as a typed
 * outcome rather than thrown: decode cannot check it because the WACC is
 * computed, and a section that could not run is null in results.
 */

import { isNonEmpty, type NonEmpty } from "../domain/types.ts";
import { assertNever } from "../exhaustive.ts";

export type YearAssumptions = {
  readonly revenueGrowth: number;
  readonly ebitMargin: number;
  readonly capexPctRevenue: number;
  readonly daPctRevenue: number;
};

export type Terminal =
  | { readonly kind: "perpetuityGrowth"; readonly growth: number }
  | {
      readonly kind: "exitMultiple";
      readonly multiple: number;
      readonly on: "evEbit" | "evEbitda" | "evFcff";
    };

export type DcfInputs = {
  readonly revenueBase: number;
  readonly taxRate: number;
  readonly wacc: number;
  readonly netDebt: number;
  readonly shares: number;
  readonly years: NonEmpty<YearAssumptions>;
  /** Working capital as a share of revenue; the cash cost is this times the change in revenue. */
  readonly workingCapitalPctRevenue: number;
  readonly terminal: Terminal;
};

export type YearRow = {
  readonly year: number;
  readonly revenue: number;
  readonly ebit: number;
  readonly nopat: number;
  readonly da: number;
  readonly ebitda: number;
  readonly capex: number;
  readonly changeInWorkingCapital: number;
  readonly fcff: number;
  readonly discountFactor: number;
  readonly pvFcff: number;
};

export type DcfNote = { readonly kind: "terminalValueDominates"; readonly pctOfEv: number };

export type DcfValue = {
  readonly kind: "value";
  readonly valuePerShare: number;
  readonly enterpriseValue: number;
  readonly equityValue: number;
  /** Undiscounted, at the end of the final year. */
  readonly terminalValue: number;
  readonly pvTerminalValue: number;
  readonly terminalValuePctOfEv: number;
  readonly pvExplicitPeriod: number;
  readonly projection: NonEmpty<YearRow>;
  readonly notes: readonly DcfNote[];
};

export type DcfUndefined = {
  readonly kind: "undefined";
  readonly reason: "terminalGrowthNotBelowWacc";
};

export type DcfOutcome = DcfValue | DcfUndefined;

export type ProjectionConstants = {
  readonly taxRate: number;
  readonly wacc: number;
  readonly workingCapitalPctRevenue: number;
};

export function projectYear(
  previousRevenue: number,
  year: number,
  a: YearAssumptions,
  c: ProjectionConstants,
): YearRow {
  const revenue = previousRevenue * (1 + a.revenueGrowth);
  const ebit = revenue * a.ebitMargin;
  const nopat = ebit * (1 - c.taxRate);
  const da = revenue * a.daPctRevenue;
  const ebitda = ebit + da;
  const capex = revenue * a.capexPctRevenue;
  const changeInWorkingCapital = c.workingCapitalPctRevenue * (revenue - previousRevenue);
  const fcff = nopat + da - capex - changeInWorkingCapital;
  const discountFactor = 1 / (1 + c.wacc) ** year;
  return {
    year,
    revenue,
    ebit,
    nopat,
    da,
    ebitda,
    capex,
    changeInWorkingCapital,
    fcff,
    discountFactor,
    pvFcff: fcff * discountFactor,
  };
}

export function projectCashFlows(inputs: DcfInputs): NonEmpty<YearRow> {
  const constants: ProjectionConstants = {
    taxRate: inputs.taxRate,
    wacc: inputs.wacc,
    workingCapitalPctRevenue: inputs.workingCapitalPctRevenue,
  };
  const rows: YearRow[] = [];
  let previousRevenue = inputs.revenueBase;
  for (const [i, a] of inputs.years.entries()) {
    const row = projectYear(previousRevenue, i + 1, a, constants);
    rows.push(row);
    previousRevenue = row.revenue;
  }
  if (!isNonEmpty(rows)) throw new Error("unreachable: years is NonEmpty");
  return rows;
}

function exitBasis(
  finalYear: YearRow,
  on: Extract<Terminal, { kind: "exitMultiple" }>["on"],
): number {
  switch (on) {
    case "evEbit":
      return finalYear.ebit;
    case "evEbitda":
      return finalYear.ebitda;
    case "evFcff":
      return finalYear.fcff;
    default:
      return assertNever(on);
  }
}

/** Precondition for perpetuityGrowth: growth < wacc. computeDcf checks it; callers of this do too. */
export function terminalValue(finalYear: YearRow, wacc: number, terminal: Terminal): number {
  switch (terminal.kind) {
    case "perpetuityGrowth":
      return (finalYear.fcff * (1 + terminal.growth)) / (wacc - terminal.growth);
    case "exitMultiple":
      return terminal.multiple * exitBasis(finalYear, terminal.on);
    default:
      return assertNever(terminal);
  }
}

const TERMINAL_DOMINANCE = 0.75;

function gordonIsDefined(wacc: number, terminal: Terminal): boolean {
  return terminal.kind !== "perpetuityGrowth" || terminal.growth < wacc;
}

export function computeDcf(inputs: DcfInputs): DcfOutcome {
  if (!gordonIsDefined(inputs.wacc, inputs.terminal)) {
    return { kind: "undefined", reason: "terminalGrowthNotBelowWacc" };
  }
  const projection = projectCashFlows(inputs);
  const finalYear = projection[projection.length - 1] ?? projection[0];
  const tv = terminalValue(finalYear, inputs.wacc, inputs.terminal);
  const pvTerminalValue = tv * finalYear.discountFactor;
  const pvExplicitPeriod = projection.reduce((sum, row) => sum + row.pvFcff, 0);
  const enterpriseValue = pvExplicitPeriod + pvTerminalValue;
  const terminalValuePctOfEv = enterpriseValue === 0 ? 0 : pvTerminalValue / enterpriseValue;
  const equityValue = enterpriseValue - inputs.netDebt;
  return {
    kind: "value",
    valuePerShare: equityValue / inputs.shares,
    enterpriseValue,
    equityValue,
    terminalValue: tv,
    pvTerminalValue,
    terminalValuePctOfEv,
    pvExplicitPeriod,
    projection,
    notes:
      terminalValuePctOfEv > TERMINAL_DOMINANCE
        ? [{ kind: "terminalValueDominates", pctOfEv: terminalValuePctOfEv }]
        : [],
  };
}
