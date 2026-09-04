import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type NonNegativeNumber,
  type PositiveNumber,
  requireNonNegative,
  requirePathLength,
  requirePositive,
} from "./validate.ts";

function takesPositiveNumber(_n: PositiveNumber): void {}
function takesNonNegativeNumber(_n: NonNegativeNumber): void {}

test("positive number is positive", () => {
  const actual = requirePositive(1, "foo");
  const expected = { ok: true, value: 1 };
  assert.deepEqual(actual, expected);
});

test("zero is not positive", () => {
  const actual = requirePositive(0, "foo");
  const expected = {
    ok: false,
    error: { kind: "not_positive", name: "foo", value: 0 },
  };
  assert.deepEqual(actual, expected);
});

test("negative number is not positive", () => {
  const actual = requirePositive(-1, "foo");
  const expected = {
    ok: false,
    error: { kind: "not_positive", name: "foo", value: -1 },
  };
  assert.deepEqual(actual, expected);
});

test("NaN is not positive", () => {
  const actual = requirePositive(NaN, "foo");
  const expected = {
    ok: false,
    error: { kind: "not_positive", name: "foo", value: NaN },
  };
  assert.deepEqual(actual, expected);
});

test("plain number is not a PositiveNumber", () => {
  // @ts-expect-error a plain number is not a PositiveNumber
  takesPositiveNumber(42);
});

test("non negative number is non-negative", () => {
  const actual = requireNonNegative(1, "foo");
  const expected = { ok: true, value: 1 };
  assert.deepEqual(actual, expected);
});

test("zero is non-negative", () => {
  const actual = requireNonNegative(0, "foo");
  const expected = { ok: true, value: 0 };
  assert.deepEqual(actual, expected);
});

test("negative number is not non-negative", () => {
  const actual = requireNonNegative(-1, "foo");
  const expected = {
    ok: false,
    error: { kind: "not_non_negative", name: "foo", value: -1 },
  };
  assert.deepEqual(actual, expected);
});

test("NaN is not non-negative", () => {
  const actual = requireNonNegative(NaN, "foo");
  const expected = {
    ok: false,
    error: { kind: "not_non_negative", name: "foo", value: NaN },
  };
  assert.deepEqual(actual, expected);
});

test("plain number is not a NonNegativeNumber", () => {
  // @ts-expect-error a plain number is not a NonNegativeNumber
  takesNonNegativeNumber(-3);
});

test("empty path is length zero", () => {
  const actual = requirePathLength([], 0, "revenue_growth_path");
  const expected = { ok: true, value: [] };
  assert.deepEqual(actual, expected);
});

test("correct path length is ok", () => {
  const actual = requirePathLength([0.1, 0.2, 0.3], 3, "revenue_growth_path");
  const expected = { ok: true, value: [0.1, 0.2, 0.3] };
  assert.deepEqual(actual, expected);
});

test("too short path is an error", () => {
  const actual = requirePathLength([0.1, 0.2], 3, "revenue_growth_path");
  const expected = {
    ok: false,
    error: { kind: "wrong_length", name: "revenue_growth_path", actual: 2, expected: 3 },
  };
  assert.deepEqual(actual, expected);
});

test("too long path is an error", () => {
  const actual = requirePathLength([0.1, 0.2, 0.3, 0.4], 3, "revenue_growth_path");
  const expected = {
    ok: false,
    error: { kind: "wrong_length", name: "revenue_growth_path", actual: 4, expected: 3 },
  };
  assert.deepEqual(actual, expected);
});
