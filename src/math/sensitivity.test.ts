import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClose } from "../test-utils.ts";
import { computeDcf, type DcfInputs } from "./dcf.ts";
import { computeSensitivity } from "./sensitivity.ts";

const year = { revenueGrowth: 0.05, ebitMargin: 0.15, capexPctRevenue: 0.04, daPctRevenue: 0.03 };
const base: DcfInputs = {
  revenueBase: 1000,
  taxRate: 0.25,
  wacc: 0.09,
  netDebt: 200,
  shares: 100,
  years: [year, year, year, year, year],
  workingCapitalPctRevenue: 0.05,
  terminal: { kind: "perpetuityGrowth", growth: 0.02 },
};
const steps = [-0.01, -0.005, 0, 0.005, 0.01] as const;

/** Axis values are base + delta in floating point, so they compare within rounding. */
function assertAxis(actual: readonly number[], expected: readonly number[]): void {
  assert.equal(actual.length, expected.length);
  for (const [i, e] of expected.entries())
    assertClose(actual[i] ?? Number.NaN, e, 1e-12, `axis ${i}`);
}

test("property: the base case sits at the centre and equals the plain DCF", () => {
  const r = computeSensitivity({ base, waccSteps: [...steps], terminalGrowthSteps: [...steps] });
  assert.deepEqual(r.base, [2, 2]);
  const plain = computeDcf(base);
  assert.equal(plain.kind, "value");
  if (plain.kind !== "value") return;
  assert.equal(r.grid[2]?.[2], plain.valuePerShare);
  assertAxis(r.axes.wacc, [0.08, 0.085, 0.09, 0.095, 0.1]);
  assertAxis(r.axes.terminalGrowth ?? [], [0.01, 0.015, 0.02, 0.025, 0.03]);
});

test("property: cells decrease along the wacc axis and increase along the growth axis", () => {
  const r = computeSensitivity({ base, waccSteps: [...steps], terminalGrowthSteps: [...steps] });
  for (const row of r.grid) {
    for (let j = 1; j < row.length; j += 1) {
      const a = row[j - 1];
      const b = row[j];
      if (a !== null && b !== null && a !== undefined && b !== undefined) assert.ok(b > a);
    }
  }
  for (let j = 0; j < steps.length; j += 1) {
    for (let i = 1; i < r.grid.length; i += 1) {
      const a = r.grid[i - 1]?.[j];
      const b = r.grid[i]?.[j];
      if (a !== null && b !== null && a !== undefined && b !== undefined) assert.ok(b < a);
    }
  }
});

test("steps are sorted before use so the axes read low to high", () => {
  const r = computeSensitivity({
    base,
    waccSteps: [0.01, 0, -0.01],
    terminalGrowthSteps: [0, 0.005],
  });
  assertAxis(r.axes.wacc, [0.08, 0.09, 0.1]);
  assert.deepEqual(r.base, [1, 0]);
});

test("a cell whose growth meets its wacc is null, not infinite", () => {
  const tight: DcfInputs = {
    ...base,
    wacc: 0.03,
    terminal: { kind: "perpetuityGrowth", growth: 0.02 },
  };
  const r = computeSensitivity({
    base: tight,
    waccSteps: [-0.01, 0],
    terminalGrowthSteps: [0, 0.01],
  });
  // wacc 0.02 with growth 0.02 and 0.03: both undefined; wacc 0.03 with growth 0.03: undefined.
  assert.deepEqual(
    r.grid.map((row) => row.map((c) => c === null)),
    [
      [true, true],
      [false, true],
    ],
  );
  for (const row of r.grid) for (const c of row) assert.ok(c === null || Number.isFinite(c));
});

test("an exit-multiple terminal sweeps wacc only", () => {
  const exit: DcfInputs = {
    ...base,
    terminal: { kind: "exitMultiple", multiple: 10, on: "evEbit" },
  };
  const r = computeSensitivity({
    base: exit,
    waccSteps: [...steps],
    terminalGrowthSteps: [...steps],
  });
  assert.equal(r.axes.terminalGrowth, null);
  assert.equal(r.grid.length, 5);
  assert.ok(r.grid.every((row) => row.length === 1));
  assert.deepEqual(r.base, [2, 0]);
});
