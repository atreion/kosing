/**
 * Branded number types and the parsers that produce them.
 *
 * The `as` casts inside the parsers are the sanctioned exception to the
 * project's no-cast rule: a brand can only be applied by asserting it, and
 * each cast sits next to the check that justifies it.
 */

import { err, ok, type Result } from "./result.ts";

declare const brand: unique symbol;

/**
 * Marks a primitive with a compile-time-only tag so that only a parser can
 * produce it. The tag has no runtime representation. Arithmetic on a branded
 * value yields a plain `number`, since the compiler cannot know whether the
 * property survives.
 */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
export type PositiveNumber = Brand<number, "PositiveNumber">;
export type NonNegativeNumber = Brand<number, "NonNegativeNumber">;
export type UnitInterval = Brand<number, "UnitInterval">;
export type PositiveInteger = Brand<number, "PositiveInteger">;
export type NonNegativeInteger = Brand<number, "NonNegativeInteger">;

type Named = { readonly name: string };
type Rejected<Kind extends string> = Named & { readonly kind: Kind; readonly value: number };

export type NotPositiveError = Rejected<"notPositive">;
export type NotNonNegativeError = Rejected<"notNonNegative">;
export type NotUnitIntervalError = Rejected<"notUnitInterval">;
export type NotPositiveIntegerError = Rejected<"notPositiveInteger">;
export type NotNonNegativeIntegerError = Rejected<"notNonNegativeInteger">;
export type WrongLengthError = Named & {
  readonly kind: "wrongLength";
  readonly actual: number;
  readonly expected: number;
};

export type ValidationError =
  | NotPositiveError
  | NotNonNegativeError
  | NotUnitIntervalError
  | NotPositiveIntegerError
  | NotNonNegativeIntegerError
  | WrongLengthError;

export function parsePositiveNumber(
  value: number,
  name: string,
): Result<PositiveNumber, NotPositiveError> {
  if (value > 0) {
    return ok(value as PositiveNumber);
  }

  return err({ kind: "notPositive", name, value });
}

export function parseNonNegativeNumber(
  value: number,
  name: string,
): Result<NonNegativeNumber, NotNonNegativeError> {
  if (value >= 0) {
    return ok(value as NonNegativeNumber);
  }

  return err({ kind: "notNonNegative", name, value });
}

export function parseUnitInterval(
  value: number,
  name: string,
): Result<UnitInterval, NotUnitIntervalError> {
  if (value >= 0 && value <= 1) {
    return ok(value as UnitInterval);
  }

  return err({ kind: "notUnitInterval", name, value });
}

export function parsePositiveInteger(
  value: number,
  name: string,
): Result<PositiveInteger, NotPositiveIntegerError> {
  if (Number.isInteger(value) && value > 0) {
    return ok(value as PositiveInteger);
  }

  return err({ kind: "notPositiveInteger", name, value });
}

export function parseNonNegativeInteger(
  value: number,
  name: string,
): Result<NonNegativeInteger, NotNonNegativeIntegerError> {
  if (Number.isInteger(value) && value >= 0) {
    return ok(value as NonNegativeInteger);
  }

  return err({ kind: "notNonNegativeInteger", name, value });
}

export function parsePathLength(
  path: readonly number[],
  expected: number,
  name: string,
): Result<readonly number[], WrongLengthError> {
  if (path.length === expected) {
    return ok(path);
  }

  return err({ kind: "wrongLength", name, actual: path.length, expected });
}
