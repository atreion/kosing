import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type NonNegativeNumber,
  type PositiveInteger,
  type PositiveNumber,
  parseNonNegativeNumber,
  parsePathLength,
  parsePositiveInteger,
  parsePositiveNumber,
  parseUnitInterval,
  type UnitInterval,
  type ValidationError,
} from "./validate.ts";

function takesPositiveNumber(_n: PositiveNumber): void {}
function takesNonNegativeNumber(_n: NonNegativeNumber): void {}
function takesUnitInterval(_n: UnitInterval): void {}
function takesPositiveInteger(_n: PositiveInteger): void {}

type ScalarCase = {
  readonly desc: string;
  readonly input: number;
  readonly expected: "ok" | ValidationError["kind"];
};

function expectedScalarResult(field: string, { input, expected }: ScalarCase) {
  return expected === "ok"
    ? { ok: true, value: input }
    : { ok: false, error: { kind: expected, name: field, value: input } };
}

describe("parsePositiveNumber", () => {
  const field = "beta";
  const cases: readonly ScalarCase[] = [
    { desc: "accepts a positive number", input: 1, expected: "ok" },
    { desc: "rejects zero", input: 0, expected: "notPositive" },
    { desc: "rejects a negative number", input: -1, expected: "notPositive" },
    { desc: "rejects NaN", input: NaN, expected: "notPositive" },
  ];

  for (const c of cases) {
    it(c.desc, () => {
      assert.deepEqual(parsePositiveNumber(c.input, field), expectedScalarResult(field, c));
    });
  }

  it("rejects a plain number at compile time", () => {
    // @ts-expect-error a plain number is not a PositiveNumber
    takesPositiveNumber(42);
  });
});

describe("parseNonNegativeNumber", () => {
  const field = "riskFreeRate";
  const cases: readonly ScalarCase[] = [
    { desc: "accepts a positive number", input: 1, expected: "ok" },
    { desc: "accepts zero", input: 0, expected: "ok" },
    { desc: "rejects a negative number", input: -1, expected: "notNonNegative" },
    { desc: "rejects NaN", input: NaN, expected: "notNonNegative" },
  ];

  for (const c of cases) {
    it(c.desc, () => {
      assert.deepEqual(parseNonNegativeNumber(c.input, field), expectedScalarResult(field, c));
    });
  }

  it("rejects a plain number at compile time", () => {
    // @ts-expect-error a plain number is not a NonNegativeNumber
    takesNonNegativeNumber(3);
  });
});

describe("parseUnitInterval", () => {
  const field = "taxRate";
  const cases: readonly ScalarCase[] = [
    { desc: "accepts zero", input: 0, expected: "ok" },
    { desc: "accepts a value strictly between 0 and 1", input: 0.69, expected: "ok" },
    { desc: "accepts one", input: 1, expected: "ok" },
    { desc: "rejects a value below zero", input: -0.1, expected: "notUnitInterval" },
    { desc: "rejects a value above one", input: 1.1, expected: "notUnitInterval" },
    { desc: "rejects NaN", input: NaN, expected: "notUnitInterval" },
  ];

  for (const c of cases) {
    it(c.desc, () => {
      assert.deepEqual(parseUnitInterval(c.input, field), expectedScalarResult(field, c));
    });
  }

  it("rejects a plain number at compile time", () => {
    // @ts-expect-error a plain number is not a UnitInterval
    takesUnitInterval(0.5);
  });
});

describe("parsePositiveInteger", () => {
  const field = "explicitPeriodYears";
  const cases: readonly ScalarCase[] = [
    { desc: "accepts a positive integer", input: 42, expected: "ok" },
    { desc: "rejects a non-integer", input: 3.14, expected: "notPositiveInteger" },
    { desc: "rejects zero", input: 0, expected: "notPositiveInteger" },
    { desc: "rejects a negative integer", input: -9000, expected: "notPositiveInteger" },
    { desc: "rejects NaN", input: NaN, expected: "notPositiveInteger" },
  ];

  for (const c of cases) {
    it(c.desc, () => {
      assert.deepEqual(parsePositiveInteger(c.input, field), expectedScalarResult(field, c));
    });
  }

  it("rejects a plain integer at compile time", () => {
    // @ts-expect-error a plain integer is not a PositiveInteger
    takesPositiveInteger(13);
  });
});

describe("parsePathLength", () => {
  const field = "revenueGrowthPath";
  const cases: readonly {
    readonly desc: string;
    readonly path: readonly number[];
    readonly expected: number;
    readonly outcome: "ok" | "wrongLength";
  }[] = [
    { desc: "accepts an empty path when 0 expected", path: [], expected: 0, outcome: "ok" },
    {
      desc: "accepts a path of the expected length",
      path: [0.1, 0.2, 0.3],
      expected: 3,
      outcome: "ok",
    },
    {
      desc: "rejects a path that is too short",
      path: [0.1, 0.2],
      expected: 3,
      outcome: "wrongLength",
    },
    {
      desc: "rejects a path that is too long",
      path: [0.1, 0.2, 0.3, 0.4],
      expected: 3,
      outcome: "wrongLength",
    },
  ];

  for (const { desc, path, expected, outcome } of cases) {
    it(desc, () => {
      const result =
        outcome === "ok"
          ? { ok: true, value: path }
          : {
              ok: false,
              error: { kind: "wrongLength", name: field, actual: path.length, expected },
            };
      assert.deepEqual(parsePathLength(path, expected, field), result);
    });
  }
});
