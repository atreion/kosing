import { err, ok, type Result } from "./result.ts";

declare const positiveBrand: unique symbol;
declare const nonNegativeBrand: unique symbol;

export type PositiveNumber = number & { readonly [positiveBrand]: true };

export type NonNegativeNumber = number & { readonly [nonNegativeBrand]: true };

export type ValidationError =
  | {
      readonly kind: "notPositive";
      readonly name: string;
      readonly value: number;
    }
  | {
      readonly kind: "notNonNegative";
      readonly name: string;
      readonly value: number;
    }
  | {
      readonly kind: "wrongLength";
      readonly name: string;
      readonly actual: number;
      readonly expected: number;
    };

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
