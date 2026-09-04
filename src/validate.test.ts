import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type NonNegativeNumber,
  type PositiveNumber,
  parseNonNegativeNumber,
  parsePathLength,
  parsePositiveNumber,
  parseUnitInterval,
  type UnitInterval,
} from "./validate.ts";

function takesPositiveNumber(_n: PositiveNumber): void {}
function takesNonNegativeNumber(_n: NonNegativeNumber): void {}
function takesUnitInterval(_n: UnitInterval): void {}

test("positive number is a PositiveNumber", () => {
  const actual = parsePositiveNumber(1, "beta");
  const expected = { ok: true, value: 1 };
  assert.deepEqual(actual, expected);
});

test("zero is not a PositiveNumber", () => {
  const actual = parsePositiveNumber(0, "beta");
  const expected = {
    ok: false,
    error: { kind: "notPositive", name: "beta", value: 0 },
  };
  assert.deepEqual(actual, expected);
});

test("negative number is not a PositiveNumber", () => {
  const actual = parsePositiveNumber(-1, "beta");
  const expected = {
    ok: false,
    error: { kind: "notPositive", name: "beta", value: -1 },
  };
  assert.deepEqual(actual, expected);
});

test("NaN is not a PositiveNumber", () => {
  const actual = parsePositiveNumber(NaN, "beta");
  const expected = {
    ok: false,
    error: { kind: "notPositive", name: "beta", value: NaN },
  };
  assert.deepEqual(actual, expected);
});

test("plain number is not a PositiveNumber", () => {
  // @ts-expect-error a plain number is not a PositiveNumber
  takesPositiveNumber(42);
});

test("positive number is a NonNegativeNumber", () => {
  const actual = parseNonNegativeNumber(1, "riskFreeRate");
  const expected = { ok: true, value: 1 };
  assert.deepEqual(actual, expected);
});

test("zero is a NonNegativeNumber", () => {
  const actual = parseNonNegativeNumber(0, "riskFreeRate");
  const expected = { ok: true, value: 0 };
  assert.deepEqual(actual, expected);
});

test("negative number is not a NonNegativeNumber", () => {
  const actual = parseNonNegativeNumber(-1, "riskFreeRate");
  const expected = {
    ok: false,
    error: { kind: "notNonNegative", name: "riskFreeRate", value: -1 },
  };
  assert.deepEqual(actual, expected);
});

test("NaN is not a NonNegativeNumber", () => {
  const actual = parseNonNegativeNumber(NaN, "riskFreeRate");
  const expected = {
    ok: false,
    error: { kind: "notNonNegative", name: "riskFreeRate", value: NaN },
  };
  assert.deepEqual(actual, expected);
});

test("plain number is not a NonNegativeNumber", () => {
  // @ts-expect-error a plain number is not a NonNegativeNumber
  takesNonNegativeNumber(-3);
});

test("empty path has length 0", () => {
  const actual = parsePathLength([], 0, "revenueGrowthPath");
  const expected = { ok: true, value: [] };
  assert.deepEqual(actual, expected);
});

test("correct path length is ok", () => {
  const actual = parsePathLength([0.1, 0.2, 0.3], 3, "revenueGrowthPath");
  const expected = { ok: true, value: [0.1, 0.2, 0.3] };
  assert.deepEqual(actual, expected);
});

test("too short path is an error", () => {
  const actual = parsePathLength([0.1, 0.2], 3, "revenueGrowthPath");
  const expected = {
    ok: false,
    error: { kind: "wrongLength", name: "revenueGrowthPath", actual: 2, expected: 3 },
  };
  assert.deepEqual(actual, expected);
});

test("too long path is an error", () => {
  const actual = parsePathLength([0.1, 0.2, 0.3, 0.4], 3, "revenueGrowthPath");
  const expected = {
    ok: false,
    error: { kind: "wrongLength", name: "revenueGrowthPath", actual: 4, expected: 3 },
  };
  assert.deepEqual(actual, expected);
});

test("0 is a UnitInterval", () => {
  const actual = parseUnitInterval(0, "taxRate");
  const expected = { ok: true, value: 0 };
  assert.deepEqual(actual, expected);
});
test("between 0 and 1 is a UnitInterval", () => {
  const actual = parseUnitInterval(0.69, "taxRate");
  const expected = { ok: true, value: 0.69 };
  assert.deepEqual(actual, expected);
});
test("1 is a UnitInterval", () => {
  const actual = parseUnitInterval(1, "taxRate");
  const expected = { ok: true, value: 1 };
  assert.deepEqual(actual, expected);
});

test("below 0 is not a UnitInterval", () => {
  const actual = parseUnitInterval(-0.1, "taxRate");
  const expected = {
    ok: false,
    error: { kind: "notUnitInterval", name: "taxRate", value: -0.1 },
  };
  assert.deepEqual(actual, expected);
});

test("above 1 is not a UnitInterval", () => {
  const actual = parseUnitInterval(1.1, "taxRate");
  const expected = {
    ok: false,
    error: { kind: "notUnitInterval", name: "taxRate", value: 1.1 },
  };
  assert.deepEqual(actual, expected);
});

test("NaN is not a UnitInterval", () => {
  const actual = parseUnitInterval(NaN, "taxRate");
  const expected = {
    ok: false,
    error: { kind: "notUnitInterval", name: "taxRate", value: NaN },
  };
  assert.deepEqual(actual, expected);
});

test("plain number is not a UnitInterval", () => {
  // @ts-expect-error a plain number is not a NonNegativeNumber
  takesUnitInterval(0.5);
});
