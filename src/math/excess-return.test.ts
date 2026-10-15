import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import {
  computeExcessReturn,
  computeExcessReturnSensitivity,
  type ExcessReturnInputs,
  impliedSteadyStateRote,
} from "./excess-return.ts";

const ten = (r: number) => [r, r, r, r, r, r, r, r, r, r] as const;

/**
 * AnalystPrep, CFA Level II, single-stage residual income valuation: book
 * value per share 25.25, long-term ROE 12%, cost of equity 8%, growth 6.5%,
 * value 92.58. With the payout set so book grows at g every year, the
 * ten-year model is the single-stage model exactly.
 * https://analystprep.com/study-notes/cfa-level-2/single-stage-residual-income-valuation/
 */
test("worked example: AnalystPrep single-stage residual income", () => {
  const r = computeExcessReturn({
    tangibleBook: 25.25,
    shares: 1,
    costOfEquity: 0.08,
    rotePath: ten(0.12),
    payoutRatio: 1 - 0.065 / 0.12,
    terminalGrowth: 0.065,
  });
  assert.equal(r.kind, "value");
  if (r.kind !== "value") return;
  assertClose(r.valuePerShare, 92.58, 0.005);
  assertClose(r.priceToTangibleBook ?? 0, 92.58 / 25.25, 0.001);
});

const base: ExcessReturnInputs = {
  tangibleBook: 9000,
  shares: 100,
  costOfEquity: 0.09,
  rotePath: ten(0.13),
  payoutRatio: 0.6,
  terminalGrowth: 0.02,
};

test("earning exactly the cost of equity is worth tangible book", () => {
  const r = computeExcessReturn({ ...base, rotePath: ten(0.09) });
  assert.ok(r.kind === "value");
  assertClose(r.valuePerShare, 90, 1e-9);
  assertClose(r.terminalValue, 0, 1e-9);
});

test("book grows by retained earnings and each year's excess is charged on opening book", () => {
  const r = computeExcessReturn(base);
  assert.ok(r.kind === "value");
  const y1 = r.projection[0];
  assert.ok(y1);
  assertClose(y1.earnings, 0.13 * 9000, 1e-9);
  assertClose(y1.excessReturn, (0.13 - 0.09) * 9000, 1e-9);
  assertClose(y1.closingBook, 9000 + 0.13 * 9000 * 0.4, 1e-9);
  assert.equal(r.projection.length, 10);
});

test("value rises with ROTE and falls with the cost of equity", () => {
  const v = (i: ExcessReturnInputs) => {
    const r = computeExcessReturn(i);
    if (r.kind !== "value") throw new Error("unreachable");
    return r.valuePerShare;
  };
  assert.ok(v({ ...base, rotePath: ten(0.15) }) > v(base));
  assert.ok(v({ ...base, costOfEquity: 0.1 }) < v(base));
});

test("a cost of equity at or below growth, or at or below zero, has no value", () => {
  assert.deepEqual(computeExcessReturn({ ...base, costOfEquity: 0.02 }), {
    kind: "undefined",
    reason: "costOfEquityNotAboveGrowth",
  });
  assert.deepEqual(computeExcessReturn({ ...base, costOfEquity: 0, terminalGrowth: -0.01 }), {
    kind: "undefined",
    reason: "costOfEquityNotPositive",
  });
});

test("non-positive tangible book still values, with no price-to-book ratio", () => {
  const r = computeExcessReturn({ ...base, tangibleBook: 0 });
  assert.ok(r.kind === "value");
  assert.equal(r.priceToTangibleBook, null);
});

test("the implied steady-state ROTE inverts the single-stage value", () => {
  const ptb = 92.58 / 25.25;
  assertClose(impliedSteadyStateRote(ptb, 0.08, 0.065), 0.12, 0.0001);
});

test("the sensitivity grid reads low to high and its centre is the base value", () => {
  const s = computeExcessReturnSensitivity(base);
  assert.deepEqual(
    s.axes.costOfEquity.map((x) => Math.round(x * 1000) / 1000),
    [0.08, 0.085, 0.09, 0.095, 0.1],
  );
  assert.deepEqual(s.axes.roteShift, [-0.02, -0.01, 0, 0.01, 0.02]);
  const r = computeExcessReturn(base);
  assert.ok(r.kind === "value");
  assertClose(s.grid[2]?.[2] ?? 0, r.valuePerShare, 1e-9);
  for (const row of s.grid) {
    for (let j = 1; j < row.length; j++) assert.ok((row[j] ?? 0) > (row[j - 1] ?? 0));
  }
});

test("a non-flat path ends on year ten's rote", () => {
  const r = computeExcessReturn({
    tangibleBook: 9000,
    shares: 100,
    costOfEquity: 0.0855,
    rotePath: [0.14, 0.135, 0.13, 0.13, 0.125, 0.125, 0.12, 0.12, 0.12, 0.12],
    payoutRatio: 0.6,
    terminalGrowth: 0.02,
  });
  assert.ok(r.kind === "value");
  const y10 = r.projection[9];
  assert.ok(y10);
  assertClose(r.terminalValue, ((0.12 - 0.0855) * y10.closingBook) / (0.0855 - 0.02), 1e-9);
});
