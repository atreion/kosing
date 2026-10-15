/**
 * Excess return on tangible book, for banks and insurers: book plus the
 * present value of what the company earns on it above the cost of equity.
 * Book grows by retained earnings; year ten's excess return is held steady
 * and grows at the terminal rate.
 */

import { isNonEmpty, type NonEmpty } from "../domain/types.ts";

export type ExcessReturnInputs = {
  readonly tangibleBook: number;
  readonly shares: number;
  readonly costOfEquity: number;
  readonly rotePath: NonEmpty<number>;
  readonly payoutRatio: number;
  readonly terminalGrowth: number;
};

export type ExcessReturnYear = {
  readonly year: number;
  readonly openingBook: number;
  readonly rote: number;
  readonly earnings: number;
  readonly excessReturn: number;
  readonly discountFactor: number;
  readonly pvExcessReturn: number;
  readonly closingBook: number;
};

export type ExcessReturnOutcome =
  | {
      readonly kind: "value";
      readonly valuePerShare: number;
      readonly equityValue: number;
      /** Value over tangible book; null when book is not positive. */
      readonly priceToTangibleBook: number | null;
      readonly terminalValue: number;
      readonly pvTerminalValue: number;
      /** Share of equity value from the terminal; null when equity value is not positive. */
      readonly terminalPctOfValue: number | null;
      readonly projection: readonly ExcessReturnYear[];
    }
  | {
      readonly kind: "undefined";
      readonly reason: "costOfEquityNotPositive" | "costOfEquityNotAboveGrowth";
    };

/** The same float guard the DCF's Gordon terminal uses. */
const MIN_SPREAD = 1e-9;

function project(inputs: ExcessReturnInputs): readonly ExcessReturnYear[] {
  const rows: ExcessReturnYear[] = [];
  let book = inputs.tangibleBook;
  for (const [i, rote] of inputs.rotePath.entries()) {
    const year = i + 1;
    const earnings = rote * book;
    const excessReturn = (rote - inputs.costOfEquity) * book;
    const discountFactor = 1 / (1 + inputs.costOfEquity) ** year;
    const closingBook = book + earnings * (1 - inputs.payoutRatio);
    rows.push({
      year,
      openingBook: book,
      rote,
      earnings,
      excessReturn,
      discountFactor,
      pvExcessReturn: excessReturn * discountFactor,
      closingBook,
    });
    book = closingBook;
  }
  return rows;
}

export function computeExcessReturn(inputs: ExcessReturnInputs): ExcessReturnOutcome {
  const ke = inputs.costOfEquity;
  if (ke <= 0) return { kind: "undefined", reason: "costOfEquityNotPositive" };
  if (ke - inputs.terminalGrowth < MIN_SPREAD) {
    return { kind: "undefined", reason: "costOfEquityNotAboveGrowth" };
  }
  const projection = project(inputs);
  const last = projection.at(-1);
  if (last === undefined) throw new Error("unreachable: the ROTE path is NonEmpty");
  const terminalValue = ((last.rote - ke) * last.closingBook) / (ke - inputs.terminalGrowth);
  const pvTerminalValue = terminalValue * last.discountFactor;
  const equityValue =
    inputs.tangibleBook +
    projection.reduce((sum, y) => sum + y.pvExcessReturn, 0) +
    pvTerminalValue;
  return {
    kind: "value",
    valuePerShare: equityValue / inputs.shares,
    equityValue,
    priceToTangibleBook: inputs.tangibleBook > 0 ? equityValue / inputs.tangibleBook : null,
    terminalValue,
    pvTerminalValue,
    terminalPctOfValue: equityValue > 0 ? pvTerminalValue / equityValue : null,
    projection,
  };
}

/** From P/TBV = (r − g) / (ke − g): the steady ROTE that justifies a price-to-tangible-book. */
export function impliedSteadyStateRote(
  priceToTangibleBook: number,
  costOfEquity: number,
  growth: number,
): number {
  return growth + priceToTangibleBook * (costOfEquity - growth);
}

export const COST_OF_EQUITY_STEPS: NonEmpty<number> = [-0.01, -0.005, 0, 0.005, 0.01];
export const ROTE_SHIFTS: NonEmpty<number> = [-0.02, -0.01, 0, 0.01, 0.02];

export type ExcessReturnSensitivity = {
  readonly axes: {
    readonly costOfEquity: readonly number[];
    readonly roteShift: readonly number[];
  };
  /** grid[i][j]: cost-of-equity axis i, ROTE shift j; null where the value is undefined. */
  readonly grid: readonly (readonly (number | null)[])[];
};

function shifted(path: NonEmpty<number>, shift: number): NonEmpty<number> {
  const moved = path.map((r) => r + shift);
  if (!isNonEmpty(moved)) throw new Error("unreachable: mapping a NonEmpty");
  return moved;
}

export function computeExcessReturnSensitivity(base: ExcessReturnInputs): ExcessReturnSensitivity {
  const costOfEquity = COST_OF_EQUITY_STEPS.map((d) => base.costOfEquity + d);
  const grid = costOfEquity.map((ke) =>
    ROTE_SHIFTS.map((shift) => {
      const r = computeExcessReturn({
        ...base,
        costOfEquity: ke,
        rotePath: shifted(base.rotePath, shift),
      });
      return r.kind === "value" ? r.valuePerShare : null;
    }),
  );
  return { axes: { costOfEquity, roteShift: [...ROTE_SHIFTS] }, grid };
}
