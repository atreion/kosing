import { err, ok, type Result } from "./result.ts";

declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
export type PositiveNumber = Brand<number, "PositiveNumber">;
export type NonNegativeNumber = Brand<number, "NonNegativeNumber">;
export type UnitInterval = Brand<number, "UnitInterval">;
export type PositiveInteger = Brand<number, "PositiveInteger">;

type Named = { readonly name: string };

export type ValidationError =
  | (Named & {
      readonly kind: "notPositive";
      readonly value: number;
    })
  | (Named & {
      readonly kind: "notNonNegative";
      readonly value: number;
    })
  | (Named & {
      readonly kind: "wrongLength";
      readonly actual: number;
      readonly expected: number;
    })
  | (Named & {
      readonly kind: "notUnitInterval";
      readonly value: number;
    })
  | (Named & {
      readonly kind: "notPositiveInteger";
      readonly value: number;
    });

export function parsePositiveNumber(
  value: number,
  name: string,
): Result<PositiveNumber, ValidationError> {
  if (value > 0) {
    return ok(value as PositiveNumber);
  }

  return err({ kind: "notPositive", name, value });
}

export function parseNonNegativeNumber(
  value: number,
  name: string,
): Result<NonNegativeNumber, ValidationError> {
  if (value >= 0) {
    return ok(value as NonNegativeNumber);
  }

  return err({ kind: "notNonNegative", name, value });
}

export function parsePathLength(
  path: readonly number[],
  expected: number,
  name: string,
): Result<readonly number[], ValidationError> {
  if (path.length === expected) {
    return ok(path);
  }

  return err({ kind: "wrongLength", name, actual: path.length, expected });
}

export function parseUnitInterval(
  value: number,
  name: string,
): Result<UnitInterval, ValidationError> {
  if (value >= 0 && value <= 1) {
    return ok(value as UnitInterval);
  }

  return err({ kind: "notUnitInterval", name, value });
}

export function parsePositiveInteger(
  value: number,
  name: string,
): Result<PositiveInteger, ValidationError> {
  if (Number.isInteger(value) && value > 0) {
    return ok(value as PositiveInteger);
  }

  return err({ kind: "notPositiveInteger", name, value });
}
